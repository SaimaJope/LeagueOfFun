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
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { send, subscribe } from "@/game/network/peerNetwork";
import { inputState } from "@/game/input/useInput";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import { useOpponentFlashStore } from "@/stores/opponentFlashStore";
import { playMundoHit, playMundoFlash, playMundoQCast } from "@/game/audio/mundoAudio";
import { playYoumuuActivate } from "@/game/audio/announcer";
import {
  BOOTS_MS_MULT,
  YOUMUU_COOLDOWN_MS,
  YOUMUU_DURATION_MS,
  YOUMUU_MS_MULT,
  FROZEN_MALLET_SLOW_MULT,
} from "@/game/config/pvpItems";
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
// The thrower broadcasts the cleaver at ~40 Hz while it's live. If we go this
// long without a fresh snapshot the throw has ended (or its end packet was
// dropped), so drop it rather than freeze/extrapolate a stuck blade.
const OPPONENT_CLEAVER_STALE_MS = 250;
// Same forward-axis correction the local cleaver bakes into its geometry so the
// blade lies flat and points along its flight vector (see CleaverAbility).
const CLEAVER_FORWARD_ROTATION = new Matrix4().makeRotationX(Math.PI / 2);
// Tumble rate around the blade's local axis — must match CleaverAbility's SPIN_RATE
// so the opponent's cleaver spins identically to how the thrower sees it.
const SPIN_RATE = 22; // rad/s

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
  const youmuuKeyDownRef = useRef(false);
  const opponentCleaverActiveUntilRef = useRef(0);
  // castStartedAt of the opponent throw whose release sound we've already played,
  // so the Q cast SFX fires once per throw (on the windup→flight transition).
  const opponentThrowSoundForRef = useRef(0);

  const opponentCleaverGroupRef = useRef<Group>(null);
  const opponentCleaverSpinRef = useRef<Group>(null);
  const opponentCleaverGhostRefs = useRef<Group[]>([]);
  const opponentCleaverGhostSpinRefs = useRef<Group[]>([]);
  // performance.now() when the latest in-flight cleaver snapshot arrived; used to
  // dead-reckon the tip position between the 40 Hz network updates so the blade
  // glides at full frame rate instead of stepping once per snapshot.
  const opponentCleaverSnapAtRef = useRef(0);
  // Accumulated tumble angle for the opponent's cleaver + its trail ghosts.
  const opponentSpinAngleRef = useRef(0);

  // Restore the base move-speed multiplier when leaving the match.
  useEffect(() => {
    return () => {
      playerControlState.movementSpeedMultiplier = 1;
    };
  }, []);

  // Reset local + opponent positions to spawn at the start of each round (when
  // the pre-round countdown begins). HP is restored to each peer's own max
  // (startingHp + Warmog's bonus); the opponent's is corrected via packets.
  useEffect(() => {
    if (phase !== "countdown") return;
    const myRole = role === "host" ? "host" : "client";
    const oppRole = role === "host" ? "client" : "host";
    const mine = spawnForRole(myRole, wallOrientation);
    const theirs = spawnForRole(oppRole, wallOrientation);
    playerEntity.position = mine;
    playerEntity.velocity = [0, 0, 0];
    playerEntity.alive = true;
    playerEntity.slowedUntil = 0;
    opponentEntity.position = theirs;
    opponentEntity.velocity = [0, 0, 0];
    opponentEntity.alive = true;
    opponentEntity.slowed = false;
    opponentEntity.cleaver = null;
    for (const dummy of dummyEntities) {
      dummy.alive = false;
      dummy.position = [999, 0, 999];
      dummy.velocity = [0, 0, 0];
      dummy.hitSerial = 0;
    }
    useCleaverStore.getState().reset();
    // Clear any lingering Youmuu active buff between rounds.
    usePvpEconomyStore.getState().activateYoumuu(0, 0);
    const myMax = startingHp + usePvpEconomyStore.getState().bonusHp();
    const store = usePvpStore.getState();
    store.setMaxHp(myRole, myMax);
    store.setHp(myRole, myMax);
    // Optimistically restore the opponent's bar to their last-known max until
    // their first round packet arrives.
    store.setHp(oppRole, store.maxHp[oppRole]);
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
          // Frozen Mallet: the attacker tags us with a slow on hit.
          if (msg.slowMs && msg.slowMs > 0) {
            playerEntity.slowedUntil = performance.now() + msg.slowMs;
          }
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
      opponentEntity.lastUpdate = performance.now();
      opponentEntity.slowed = !!msg.slowed;
      if (msg.maxHp) {
        usePvpStore.getState().setMaxHp(role === "host" ? "client" : "host", msg.maxHp);
      }
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
        const at = performance.now();
        opponentCleaverActiveUntilRef.current = at + OPPONENT_CLEAVER_LIFETIME_MS;
        opponentCleaverSnapAtRef.current = at;
      }
      // Mirror the opponent's own authoritative HP (each peer owns its own HP;
      // direct set so round-reset restores show immediately, not just damage).
      const target = role === "host" ? "client" : "host";
      usePvpStore.getState().setHp(target, msg.hp);
    });
  }, [role]);

  useFrame((_, dt) => {
    const now = performance.now();
    const me = role === "host" ? "host" : "client";
    const econ = usePvpEconomyStore.getState();

    // ─── Youmuu's Ghostblade active (key "1") ─────────────────────────────
    const youmuuKey = !!inputState.keys["Digit1"];
    if (
      youmuuKey &&
      !youmuuKeyDownRef.current &&
      phase === "playing" &&
      econ.owned.youmuu &&
      now >= econ.youmuuReadyAt
    ) {
      econ.activateYoumuu(now + YOUMUU_DURATION_MS, now + YOUMUU_COOLDOWN_MS);
      playYoumuuActivate();
    }
    youmuuKeyDownRef.current = youmuuKey;

    // ─── Effective move-speed multiplier (setting × items × slow) ─────────
    let mul = moveSpeedMul;
    if (econ.owned.boots) mul *= BOOTS_MS_MULT;
    if (now < econ.youmuuActiveUntil) mul *= YOUMUU_MS_MULT;
    if (now < playerEntity.slowedUntil) mul *= FROZEN_MALLET_SLOW_MULT;
    playerControlState.movementSpeedMultiplier = mul;

    // ─── Broadcast own state ──────────────────────────────────────────────
    if (
      (phase === "playing" ||
        phase === "countdown" ||
        phase === "intermission" ||
        phase === "shop") &&
      now - lastSentRef.current >= STATE_SEND_INTERVAL_MS
    ) {
      lastSentRef.current = now;
      const myHp = usePvpStore.getState().hp[me];
      send({
        type: "state",
        t: now,
        pos: [playerEntity.position[0], playerEntity.position[2]],
        vel: [playerEntity.velocity[0], playerEntity.velocity[2]],
        rotY: playerEntity.rotationY,
        hp: myHp,
        maxHp: usePvpStore.getState().maxHp[me],
        slowed: now < playerEntity.slowedUntil,
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
    // Drop a cleaver whose snapshots have gone stale (ended / packets lost).
    if (
      opponentEntity.cleaver &&
      now - opponentCleaverSnapAtRef.current > OPPONENT_CLEAVER_STALE_MS
    ) {
      opponentEntity.cleaver = null;
    }
    if (opponentEntity.cleaver && opponentCleaverGroupRef.current) {
      const c = opponentEntity.cleaver;
      // Only show the projectile in flight. During windup the blade is still in
      // Mundo's hand (the throw animation covers that beat); rendering it here
      // made the cleaver pop to the hand before the cast — the "teleport" glitch.
      const inFlight = c.phase === "flight";
      opponentCleaverGroupRef.current.visible = inFlight;
      if (inFlight) {
        // Dead reckoning: extrapolate the tip along the flight vector from the
        // last snapshot so the blade moves smoothly every frame, not in 40 Hz
        // steps. Flight is straight-line at constant speed, so this is exact.
        const elapsed = Math.max(0, (now - opponentCleaverSnapAtRef.current) / 1000);
        const cx = c.px + c.dirX * c.speed * elapsed;
        const cz = c.pz + c.dirZ * c.speed * elapsed;
        const yaw = Math.atan2(c.dirX, c.dirZ);
        opponentCleaverGroupRef.current.position.set(cx, 1.0, cz);
        opponentCleaverGroupRef.current.rotation.set(0, yaw, 0);
        // Advance + apply the tumble spin (around the blade's local axis).
        opponentSpinAngleRef.current += SPIN_RATE * dt;
        if (opponentCleaverSpinRef.current) {
          opponentCleaverSpinRef.current.rotation.set(opponentSpinAngleRef.current, 0, 0);
        }
        // Play the release SFX once, the moment this throw enters flight.
        if (c.castStartedAt !== opponentThrowSoundForRef.current) {
          opponentThrowSoundForRef.current = c.castStartedAt;
          playMundoQCast([cx, 1.0, cz]);
        }
        updateOpponentCleaverGhosts(
          opponentCleaverGhostRefs.current,
          opponentCleaverGhostSpinRefs.current,
          c,
          cx,
          cz,
          yaw,
          opponentSpinAngleRef.current,
        );
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
        <group ref={opponentCleaverSpinRef}>
          <OpponentCleaverModel skinId={opponentSkinId} />
        </group>
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
            <group
              ref={(g) => {
                if (g) opponentCleaverGhostSpinRefs.current[i] = g;
              }}
            >
              <OpponentCleaverModel skinId={opponentSkinId} ghostAlpha={alpha} />
            </group>
          </group>
        );
      })}
    </>
  );
}

/** Remote cleaver trail helpers and renderer. */
function updateOpponentCleaverGhosts(
  groups: Group[],
  spinGroups: Group[],
  cleaver: NonNullable<typeof opponentEntity.cleaver>,
  x: number,
  z: number,
  yaw: number,
  spinAngle: number,
) {
  const speed = cleaver.speed || CLEAVER_SPEED_STANDING;
  const ghostBaseDist = speed * CLEAVER_MOTION_BLUR_STRIDE_MS * 0.001;
  const ghostSpinStep = SPIN_RATE * CLEAVER_MOTION_BLUR_STRIDE_MS * 0.001;
  for (let i = 0; i < CLEAVER_MOTION_BLUR_SAMPLES; i += 1) {
    const group = groups[i];
    if (!group) continue;
    const lagDist = ghostBaseDist * (i + 1);
    group.visible = true;
    group.position.set(x - cleaver.dirX * lagDist, 1.0, z - cleaver.dirZ * lagDist);
    group.rotation.set(0, yaw, 0);
    // Each ghost lags the head by one stride of spin too, so the trail tumbles.
    const gs = spinGroups[i];
    if (gs) gs.rotation.set(spinAngle - ghostSpinStep * (i + 1), 0, 0);
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
