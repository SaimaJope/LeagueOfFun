import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  Box3,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  Vector3,
  type Texture,
} from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useAssetStore } from "@/stores/assetStore";
import { useModel } from "@/game/assets/modelLoader";
import { dummyEntities, opponentEntity, playerControlState, playerEntity } from "@/stores/entityStore";
import { cleaverProjectileState, useCleaverStore } from "@/stores/cleaverStore";
import { usePvpStore } from "@/stores/pvpStore";
import { send, subscribe } from "@/game/network/peerNetwork";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import { useOpponentFlashStore } from "@/stores/opponentFlashStore";
import { playMundoHit, playMundoFlash } from "@/game/audio/mundoAudio";
import { loadTexture } from "@/game/animation/AnimatedModel";
import { spawnForRole } from "@/game/entities/PvpWall";
import { selectedChromaTexturePath } from "@/stores/chromaStore";
import {
  CLEAVER_SIZE,
  CLEAVER_SPEED_STANDING,
  CLEAVER_MOTION_BLUR_SAMPLES,
  CLEAVER_MOTION_BLUR_STRENGTH,
  CLEAVER_MOTION_BLUR_STRIDE_MS,
  CLEAVER_MOTION_BLUR_DECAY,
} from "@/game/config/dodgeball.config";

const STATE_SEND_HZ = 40;
const STATE_SEND_INTERVAL_MS = 1000 / STATE_SEND_HZ;
const OPPONENT_CLEAVER_LIFETIME_MS = 4000;
// Same forward-axis correction the local cleaver bakes into its geometry so the
// blade lies flat and points along its flight vector (see CleaverAbility).
const CLEAVER_FORWARD_ROTATION = new Matrix4().makeRotationX(Math.PI / 2);

/**
 * Drives the runtime PvP loop inside the Canvas:
 *  - Broadcasts our own state (position, velocity, rotation, current cleaver, HP) at ~40 Hz.
 *  - Mirrors incoming opponent state into {@link opponentEntity}.
 *  - Renders the opponent's cleaver projectile from network state.
 *  - Applies explicit peer hit messages.
 *  - Syncs PvP move-speed setting into playerControlState.
 *  - Snaps the local champion to its spawn position when a match starts.
 */
export function PvpSync() {
  const role = usePvpStore((s) => s.role);
  const phase = usePvpStore((s) => s.phase);
  const moveSpeedMul = usePvpStore((s) => s.settings.moveSpeedMul);
  const wallOrientation = usePvpStore((s) => s.settings.wallOrientation);
  const startingHp = usePvpStore((s) => s.settings.startingHp);
  const hostSkin = usePvpStore((s) => s.hostSkin);
  const clientSkin = usePvpStore((s) => s.clientSkin);
  const opponentSkinId = role === "host" ? clientSkin : hostSkin;

  const lastSentRef = useRef(0);
  const opponentCleaverActiveUntilRef = useRef(0);

  const opponentCleaverGroupRef = useRef<Group>(null);
  const opponentCleaverGhostRefs = useRef<Group[]>([]);
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
    for (const dummy of dummyEntities) {
      dummy.alive = false;
      dummy.position = [999, 0, 999];
      dummy.velocity = [0, 0, 0];
      dummy.hitSerial = 0;
    }
    useCleaverStore.getState().reset();
    usePvpStore.setState({
      hp: { host: startingHp, client: startingHp },
      winner: null,
    });
  }, [phase, role, wallOrientation, startingHp]);

  // Subscribe to incoming state from the network.
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "hit") {
        const me = role === "host" ? "host" : "client";
        const before = usePvpStore.getState().hp[me];
        if ((msg.target === undefined || msg.target === me) && before > 0) {
          usePvpStore.getState().damage(me, 1);
          useHitEffectStore.getState().trigger([playerEntity.position[0], 0, playerEntity.position[2]], 1);
          playMundoHit([playerEntity.position[0], 1, playerEntity.position[2]]);
          opponentEntity.cleaver = null;
          if (opponentCleaverGroupRef.current) opponentCleaverGroupRef.current.visible = false;
          hideGroups(opponentCleaverGhostRefs.current);
        }
        return;
      }
      if (msg.type === "flash") {
        useOpponentFlashStore
          .getState()
          .trigger(msg.origin, msg.destination, performance.now());
        playMundoFlash(msg.destination);
        return;
      }
      if (msg.type !== "state") return;
      opponentEntity.position = [msg.pos[0], 0, msg.pos[1]];
      opponentEntity.velocity = [msg.vel?.[0] ?? 0, 0, msg.vel?.[1] ?? 0];
      opponentEntity.rotationY = msg.rotY;
      opponentEntity.cleaver = msg.cleaver
        ? {
            px: msg.cleaver.px,
            pz: msg.cleaver.pz,
            dirX: msg.cleaver.dirX,
            dirZ: msg.cleaver.dirZ,
            distance: msg.cleaver.distance,
            speed: msg.cleaver.speed ?? CLEAVER_SPEED_STANDING,
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
        vel: [playerEntity.velocity[0], playerEntity.velocity[2]],
        rotY: playerEntity.rotationY,
        hp: myHp,
        cleaver: cleaverProjectileState.active
          ? {
              px: cleaverProjectileState.worldX,
              pz: cleaverProjectileState.worldZ,
              dirX: cleaverProjectileState.dirX,
              dirZ: cleaverProjectileState.dirZ,
              distance: 0,
              speed: cleaverProjectileState.speed || CLEAVER_SPEED_STANDING,
              phase: cleaverProjectileState.phase === "windup" ? "windup" : "flight",
              startedAt: cleaverProjectileState.startedAt,
            }
          : null,
      });
    }

    // ─── Opponent cleaver visual ─────────────────────
    if (opponentEntity.cleaver && opponentCleaverGroupRef.current) {
      const c = opponentEntity.cleaver;
      // Use the broadcast position directly — the thrower updates worldX/Z every
      // frame on their side so each 40ms snapshot is the actual tip position.
      const cx = c.px;
      const cz = c.pz;
      const yaw = Math.atan2(c.dirX, c.dirZ);
      opponentCleaverGroupRef.current.visible = true;
      opponentCleaverGroupRef.current.position.set(cx, 1.0, cz);
      opponentCleaverGroupRef.current.rotation.set(0, yaw, 0);
      if (c.phase === "flight") {
        updateOpponentCleaverGhosts(opponentCleaverGhostRefs.current, c, cx, cz, yaw);
      } else {
        hideGroups(opponentCleaverGhostRefs.current);
      }

      // Expire stale opponent cleavers.
      if (now > opponentCleaverActiveUntilRef.current) {
        opponentEntity.cleaver = null;
        opponentCleaverGroupRef.current.visible = false;
        hideGroups(opponentCleaverGhostRefs.current);
      }
    } else if (opponentCleaverGroupRef.current) {
      opponentCleaverGroupRef.current.visible = false;
      hideGroups(opponentCleaverGhostRefs.current);
    }
  });

  return (
    <>
      <group ref={opponentCleaverGroupRef} visible={false}>
        <OpponentCleaverModel skinId={opponentSkinId} />
      </group>
      {Array.from({ length: CLEAVER_MOTION_BLUR_SAMPLES }).map((_, i) => {
        const alpha = Math.max(
          0,
          CLEAVER_MOTION_BLUR_STRENGTH * Math.pow(1 - CLEAVER_MOTION_BLUR_DECAY, i),
        );
        return (
          <group
            key={i}
            ref={(g) => {
              if (g) opponentCleaverGhostRefs.current[i] = g;
            }}
            visible={false}
          >
            <OpponentCleaverModel skinId={opponentSkinId} ghostAlpha={alpha} />
          </group>
        );
      })}
    </>
  );
}

/** Remote cleaver trail helpers and renderer. */
function updateOpponentCleaverGhosts(
  groups: Group[],
  cleaver: NonNullable<typeof opponentEntity.cleaver>,
  x: number,
  z: number,
  yaw: number,
) {
  const speed = cleaver.speed || CLEAVER_SPEED_STANDING;
  const ghostBaseDist = speed * CLEAVER_MOTION_BLUR_STRIDE_MS * 0.001;
  for (let i = 0; i < CLEAVER_MOTION_BLUR_SAMPLES; i += 1) {
    const group = groups[i];
    if (!group) continue;
    const lagDist = ghostBaseDist * (i + 1);
    group.visible = true;
    group.position.set(x - cleaver.dirX * lagDist, 1.0, z - cleaver.dirZ * lagDist);
    group.rotation.set(0, yaw, 0);
  }
}

function hideGroups(groups: Group[]) {
  for (const group of groups) {
    if (group) group.visible = false;
  }
}

function OpponentCleaverModel({
  skinId,
  ghostAlpha,
}: {
  skinId: string;
  ghostAlpha?: number;
}) {
  const cfg = useAssetStore((s) => s.registry.cleaverProjectileModel);
  const state = useModel(cfg.path);
  const chromaPath = selectedChromaTexturePath(skinId, "mundo");
  const [chromaTexture, setChromaTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!chromaPath) {
      setChromaTexture(null);
      return;
    }
    loadTexture(chromaPath)
      .then((texture) => {
        if (!cancelled) setChromaTexture(texture);
      })
      .catch((err) => {
        console.warn(`[PvpSync] failed to load opponent cleaver chroma ${chromaPath}:`, err);
        if (!cancelled) setChromaTexture(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chromaPath]);

  // Bake the cleaver the same way CleaverAbility does for the local player:
  // flatten the GLB hierarchy into world space, apply the forward-axis
  // correction, then recenter on the bounding-box origin and auto-fit the
  // height. Without this the raw GLB mesh sits off its pivot and the opponent's
  // cleaver renders far from its networked position (i.e. appears invisible).
  const prepared = useMemo(() => {
    if (state.status !== "ready") return null;
    const source = cloneSkeleton(state.model.scene) as Group;
    const scene = new Group();
    const box = new Box3();
    let started = false;
    const materials: any[] = [];

    source.updateMatrixWorld(true);
    source.traverse((o: any) => {
      if (!o.isMesh) return;
      const geometry = o.geometry.clone();
      geometry.applyMatrix4(o.matrixWorld);
      geometry.applyMatrix4(CLEAVER_FORWARD_ROTATION);
      geometry.computeBoundingBox();

      const meshMaterial = Array.isArray(o.material)
        ? o.material.map((m: any) => m?.clone?.() ?? m)
        : o.material?.clone?.() ?? o.material;
      const mats = Array.isArray(meshMaterial) ? meshMaterial : [meshMaterial];
      for (const m of mats) {
        if (!m) continue;
        materials.push(m);
      }

      const mesh = new Mesh(geometry, meshMaterial);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      scene.add(mesh);

      const meshBox = geometry.boundingBox;
      if (!meshBox) return;
      if (!started) {
        box.copy(meshBox);
        started = true;
      } else {
        box.union(meshBox);
      }
    });

    if (!started) return null;

    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const autoScale = cfg.autoFitHeight ? cfg.autoFitHeight / maxDim : 1;
    scene.children.forEach((child) => child.position.sub(center));
    return { scene, autoScale, materials };
  }, [state, cfg.autoFitHeight]);

  useEffect(() => {
    if (!prepared) return;
    for (const material of prepared.materials) {
      if (!material) continue;
      material.userData = material.userData ?? {};
      if (material.userData.baseMap === undefined) {
        material.userData.baseMap = material.map ?? null;
      }
      const tex = chromaTexture ?? material.userData.baseMap ?? null;
      material.map = tex;
      material.side = DoubleSide;
      if (material.emissive) {
        material.emissive.set(0xffffff);
        material.emissiveIntensity = 1;
        material.emissiveMap = tex;
      }
      if (material.color) material.color.set(0x000000);
      if (ghostAlpha !== undefined) {
        material.transparent = true;
        material.opacity = ghostAlpha;
        material.depthWrite = false;
        material.blending = AdditiveBlending;
      }
      material.needsUpdate = true;
    }
  }, [prepared, chromaTexture, ghostAlpha]);

  if (!prepared) return null;
  return (
    <group scale={cfg.scale * prepared.autoScale * CLEAVER_SIZE}>
      <primitive object={prepared.scene} />
    </group>
  );
}
