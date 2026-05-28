import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { opponentEntity, playerControlState, playerEntity } from "@/stores/entityStore";
import { cleaverProjectileState, useCleaverStore } from "@/stores/cleaverStore";
import { usePvpStore } from "@/stores/pvpStore";
import { send, subscribe } from "@/game/network/peerNetwork";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import { playMundoHit } from "@/game/audio/mundoAudio";
import { spawnForRole } from "@/game/entities/PvpWall";
import { publicAsset } from "@/game/assets/publicPath";
import {
  CLEAVER_SIZE,
  CLEAVER_WIDTH,
} from "@/game/config/dodgeball.config";

const STATE_SEND_HZ = 25;
const STATE_SEND_INTERVAL_MS = 1000 / STATE_SEND_HZ;
const HIT_RADIUS = 0.7;
const OPPONENT_CLEAVER_LIFETIME_MS = 4000;

/**
 * Drives the runtime PvP loop inside the Canvas:
 *  - Broadcasts our own state (position, rotation, current cleaver, HP) at ~25 Hz.
 *  - Mirrors incoming opponent state into {@link opponentEntity}.
 *  - Renders the opponent's cleaver projectile from network state.
 *  - Detects opponent-cleaver-vs-self hits and applies receiver-side damage.
 *  - Syncs PvP move-speed setting into playerControlState.
 *  - Snaps the local champion to its spawn position when a match starts.
 */
export function PvpSync() {
  const role = usePvpStore((s) => s.role);
  const phase = usePvpStore((s) => s.phase);
  const moveSpeedMul = usePvpStore((s) => s.settings.moveSpeedMul);
  const wallOrientation = usePvpStore((s) => s.settings.wallOrientation);
  const startingHp = usePvpStore((s) => s.settings.startingHp);

  const lastSentRef = useRef(0);
  const opponentCleaverActiveUntilRef = useRef(0);

  const opponentCleaverGroupRef = useRef<Group>(null);
  const opponentCleaverModelRef = useRef<Group | null>(null);

  // Apply move-speed multiplier to the local player.
  useEffect(() => {
    playerControlState.movementSpeedMultiplier = moveSpeedMul;
    return () => {
      playerControlState.movementSpeedMultiplier = 1;
    };
  }, [moveSpeedMul]);

  // Reset local + opponent positions to spawn on match start.
  useEffect(() => {
    if (phase !== "playing") return;
    const myRole = role === "host" ? "host" : "client";
    const oppRole = role === "host" ? "client" : "host";
    const mine = spawnForRole(myRole, wallOrientation);
    const theirs = spawnForRole(oppRole, wallOrientation);
    playerEntity.position = mine;
    playerEntity.velocity = [0, 0, 0];
    playerEntity.alive = true;
    opponentEntity.position = theirs;
    opponentEntity.velocity = [0, 0, 0];
    opponentEntity.alive = true;
    opponentEntity.cleaver = null;
    useCleaverStore.getState().reset();
    usePvpStore.setState({
      hp: { host: startingHp, client: startingHp },
      winner: null,
    });
  }, [phase, role, wallOrientation, startingHp]);

  // Subscribe to incoming state from the network.
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== "state") return;
      opponentEntity.position = [msg.pos[0], 0, msg.pos[1]];
      opponentEntity.rotationY = msg.rotY;
      opponentEntity.cleaver = msg.cleaver
        ? {
            px: msg.cleaver.px,
            pz: msg.cleaver.pz,
            dirX: msg.cleaver.dirX,
            dirZ: msg.cleaver.dirZ,
            distance: msg.cleaver.distance,
            phase: msg.cleaver.phase,
            castStartedAt: msg.cleaver.startedAt,
          }
        : null;
      if (msg.cleaver) {
        opponentCleaverActiveUntilRef.current =
          performance.now() + OPPONENT_CLEAVER_LIFETIME_MS;
      }
      // Mirror opponent's authoritative HP back into our store.
      const target = role === "host" ? "client" : "host";
      const current = usePvpStore.getState().hp[target];
      if (current !== msg.hp) {
        const delta = current - msg.hp;
        if (delta > 0) usePvpStore.getState().damage(target, delta);
      }
    });
  }, [role]);

  useFrame(() => {
    const now = performance.now();

    // ─── Broadcast own state ──────────────────────────────────────────────
    if (phase === "playing" && now - lastSentRef.current >= STATE_SEND_INTERVAL_MS) {
      lastSentRef.current = now;
      const me = role === "host" ? "host" : "client";
      const myHp = usePvpStore.getState().hp[me];
      send({
        type: "state",
        t: now,
        pos: [playerEntity.position[0], playerEntity.position[2]],
        rotY: playerEntity.rotationY,
        hp: myHp,
        cleaver: cleaverProjectileState.active
          ? {
              px: cleaverProjectileState.worldX,
              pz: cleaverProjectileState.worldZ,
              dirX: cleaverProjectileState.dirX,
              dirZ: cleaverProjectileState.dirZ,
              distance: 0,
              phase: cleaverProjectileState.phase === "windup" ? "windup" : "flight",
              startedAt: cleaverProjectileState.startedAt,
            }
          : null,
      });
    }

    // ─── Opponent cleaver visual + self-hit detection ─────────────────────
    if (opponentEntity.cleaver && opponentCleaverGroupRef.current) {
      const c = opponentEntity.cleaver;
      // Use the broadcast position directly — the thrower updates worldX/Z every
      // frame on their side so each 40ms snapshot is the actual tip position.
      const cx = c.px;
      const cz = c.pz;
      opponentCleaverGroupRef.current.visible = true;
      opponentCleaverGroupRef.current.position.set(cx, 1.0, cz);
      opponentCleaverGroupRef.current.rotation.set(0, Math.atan2(c.dirX, c.dirZ), 0);

      // Hit on self — but only during flight, not windup.
      const sdx = cx - playerEntity.position[0];
      const sdz = cz - playerEntity.position[2];
      if (c.phase === "flight" && Math.hypot(sdx, sdz) <= HIT_RADIUS + CLEAVER_WIDTH) {
        const me = role === "host" ? "host" : "client";
        const before = usePvpStore.getState().hp[me];
        if (before > 0) {
          usePvpStore.getState().damage(me, 1);
          useHitEffectStore.getState().trigger([playerEntity.position[0], 0, playerEntity.position[2]], 1);
          playMundoHit([playerEntity.position[0], 1, playerEntity.position[2]]);
          // Clear opponent cleaver locally so a single shot doesn't keep dealing damage frame after frame.
          opponentEntity.cleaver = null;
          opponentCleaverGroupRef.current.visible = false;
        }
      }

      // Expire stale opponent cleavers.
      if (now > opponentCleaverActiveUntilRef.current) {
        opponentEntity.cleaver = null;
        opponentCleaverGroupRef.current.visible = false;
      }
    } else if (opponentCleaverGroupRef.current) {
      opponentCleaverGroupRef.current.visible = false;
    }
  });

  return (
    <group ref={opponentCleaverGroupRef} visible={false}>
      <OpponentCleaverModel onReady={(m) => (opponentCleaverModelRef.current = m)} />
    </group>
  );
}

/**
 * Strip-down clone of CleaverProjectileModel — no chroma, no motion blur, just
 * the GLB rendered shadeless so it reads identically to the local cleaver.
 */
function OpponentCleaverModel({ onReady }: { onReady: (m: Group) => void }) {
  // Re-use the same model loader path. We load it via useLoader so React holds
  // a stable scene reference; cloneSkeleton avoids reparenting issues.
  const gltf = useLoader(GLTFLoader, publicAsset("/assets/models/champions/mundo/cleaver.glb"));
  const prepared = useMemo(() => {
    const cloned = cloneSkeleton(gltf.scene) as Group;
    cloned.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        // Same shadeless trick as the local cleaver.
        if (m.emissive) {
          m.emissive.set(0xffffff);
          m.emissiveIntensity = 1;
          m.emissiveMap = m.map ?? null;
        }
        if (m.color) m.color.set(0x000000);
        m.needsUpdate = true;
      }
    });
    return cloned;
  }, [gltf]);

  useEffect(() => {
    if (prepared) onReady(prepared);
  }, [prepared, onReady]);

  if (!prepared) return null;
  return (
    <group scale={CLEAVER_SIZE * 0.4} rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={prepared} />
    </group>
  );
}

