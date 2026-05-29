import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { loadTexture } from "@/game/animation/AnimatedModel";
import { dummyEntity, playerEntity } from "@/stores/entityStore";
import { cleaverProjectileState, useCleaverStore } from "@/stores/cleaverStore";
import { useTrainerStore } from "@/stores/trainerStore";
import { usePvpStore } from "@/stores/pvpStore";
import { opponentEntity } from "@/stores/entityStore";
import { selectedChromaTexturePath, useChromaStore } from "@/stores/chromaStore";
import { inputState } from "@/game/input/useInput";
import { aimGroundPoint } from "@/game/input/aimRaycaster";
import { playMundoHit, playMundoQCast } from "@/game/audio/mundoAudio";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import { send } from "@/game/network/peerNetwork";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { FROZEN_MALLET_SLOW_MS } from "@/game/config/pvpItems";
import {
  CLEAVER_RANGE,
  CLEAVER_SIZE,
  CLEAVER_SPEED_STANDING,
  CLEAVER_SPEED_MOVING,
  CLEAVER_CAST_DELAY_MS,
  CLEAVER_MOVING_CAST_DELAY_MS,
  CLEAVER_COOLDOWN_MS,
  CLEAVER_WIDTH,
  CLEAVER_MOTION_BLUR_SAMPLES,
  CLEAVER_MOTION_BLUR_STRENGTH,
  CLEAVER_MOTION_BLUR_STRIDE_MS,
  CLEAVER_MOTION_BLUR_DECAY,
} from "@/game/config/dodgeball.config";

const CLEAVER_HAND_HEIGHT = 1.25;
const CLEAVER_HAND_FORWARD_OFFSET = 0.68;
const CLEAVER_HAND_RIGHT_OFFSET = 0.36;
const SPIN_RATE = 22; // rad/s around one local horizontal tumble axis
const CLEAVER_FORWARD_ROTATION = new Matrix4().makeRotationX(Math.PI / 2);
const CLEAVER_DUMMY_HIT_RADIUS = 0.7;
const MOVING_CAST_SPEED_THRESHOLD = 0.15;
// Hard safety cap on a single cast. A normal windup + full-range flight is
// ~1s; if anything leaves the projectile alive past this (a frame stall, a
// dropped end, a weird state), force it back to idle so it can't get stuck
// floating in the arena (and stop broadcasting it to the opponent).
const MAX_CLEAVER_LIFE_MS = 2000;

interface Travel {
  origin: [number, number, number];
  dir: [number, number, number];
  distance: number;
  startTime: number;
  phase: "idle" | "windup" | "flight";
  castStartTime: number;
  castDelayMs: number;
  flightSpeed: number;
  hitDummy: boolean;
}

export function CleaverAbility() {
  const { camera } = useThree();
  // NOTE: do not subscribe to useAimStore here — MundoPlayer calls setAim every
  // frame, which would re-render this component each frame and clobber the
  // imperative `projectileRef.current.visible = true` via the JSX default.
  const startCast = useCleaverStore.getState().startCast;
  const endCast = useCleaverStore.getState().endCast;
  const projectileRef = useRef<Group>(null);
  const spinGroupRef = useRef<Group>(null);
  const ghostGroupsRef = useRef<Group[]>([]);
  const ghostSpinGroupsRef = useRef<Group[]>([]);
  const spinAngleRef = useRef(0);
  const qWasDownRef = useRef(false);

  // Hide before first paint so the cleaver doesn't flash at world origin while idle.
  useLayoutEffect(() => {
    if (projectileRef.current) projectileRef.current.visible = false;
  }, []);

  // If this component unmounts mid-flight (leaving PvP, rematch swap, etc.),
  // clear the shared projectile snapshot so PvpSync stops broadcasting a frozen
  // cleaver that would stick on the opponent's screen.
  useEffect(() => {
    return () => {
      cleaverProjectileState.active = false;
      cleaverProjectileState.phase = "idle";
    };
  }, []);

  const travel = useRef<Travel>({
    origin: [0, 0, 0],
    dir: [1, 0, 0],
    distance: 0,
    startTime: 0,
    castStartTime: 0,
    castDelayMs: CLEAVER_CAST_DELAY_MS,
    flightSpeed: CLEAVER_SPEED_STANDING,
    phase: "idle",
    hitDummy: false,
  });

  useFrame((_, dt) => {
    const now = performance.now();
    const qDown = !!inputState.keys["KeyQ"];
    const t = travel.current;
    const store = useCleaverStore.getState();
    const cooldownReady = now >= store.cooldownUntil;

    // Watchdog: kill any cast that has overstayed its welcome so a stuck
    // projectile self-heals and the player can throw again.
    if (t.phase !== "idle" && now - t.castStartTime > MAX_CLEAVER_LIFE_MS) {
      t.phase = "idle";
      t.hitDummy = false;
      if (projectileRef.current) projectileRef.current.visible = false;
      hideGhosts(ghostGroupsRef.current);
      cleaverProjectileState.active = false;
      cleaverProjectileState.phase = "idle";
    }

    // In PvP, Q is locked until the round is live (post-countdown / not shopping).
    const pvpLocked =
      useTrainerStore.getState().trainer === "pvp" &&
      usePvpStore.getState().phase !== "playing";

    if (!pvpLocked && qDown && !qWasDownRef.current && t.phase === "idle" && cooldownReady) {
      const origin: [number, number, number] = [
        playerEntity.position[0],
        CLEAVER_HAND_HEIGHT,
        playerEntity.position[2],
      ];
      const castAim = aimGroundPoint(camera, inputState.mouseNDC.x, inputState.mouseNDC.y) ?? [
        origin[0] + 1,
        0,
        origin[2],
      ];
      const dx = castAim[0] - origin[0];
      const dz = castAim[2] - origin[2];
      const len = Math.hypot(dx, dz) || 1;
      const dir: [number, number, number] = [dx / len, 0, dz / len];
      t.origin = handOrigin(origin, dir);
      t.dir = dir;
      t.distance = 0;
      t.castStartTime = now;
      const moving = isMundoRunning();
      t.castDelayMs = moving ? CLEAVER_MOVING_CAST_DELAY_MS : CLEAVER_CAST_DELAY_MS;
      t.flightSpeed = moving ? CLEAVER_SPEED_MOVING : CLEAVER_SPEED_STANDING;
      t.phase = "windup";
      t.hitDummy = false;
      spinAngleRef.current = 0;
      // PvP cooldown overrides — pulled at cast time so the slider applies live.
      const pvpCooldown = trainerCooldownMs();
      const yaw = Math.atan2(dir[0], dir[2]);
      if (projectileRef.current) {
        projectileRef.current.visible = false;
        projectileRef.current.position.set(t.origin[0], t.origin[1], t.origin[2]);
        projectileRef.current.rotation.set(0, yaw, 0);
      }
      startCast(now + t.castDelayMs, now + pvpCooldown, yaw);
      // Snapshot for network broadcast: cleaver is now "live".
      cleaverProjectileState.active = true;
      cleaverProjectileState.phase = "windup";
      cleaverProjectileState.worldX = t.origin[0];
      cleaverProjectileState.worldZ = t.origin[2];
      cleaverProjectileState.dirX = dir[0];
      cleaverProjectileState.dirZ = dir[2];
      cleaverProjectileState.speed = t.flightSpeed;
      cleaverProjectileState.startedAt = now;
    }
    qWasDownRef.current = qDown;

    if (t.phase === "windup") {
      spinAngleRef.current += SPIN_RATE * 0.4 * dt;
      if (spinGroupRef.current) {
        spinGroupRef.current.rotation.set(spinAngleRef.current, 0, 0);
      }
      if (now - t.castStartTime >= t.castDelayMs) {
        const releaseOrigin: [number, number, number] = [
          playerEntity.position[0],
          CLEAVER_HAND_HEIGHT,
          playerEntity.position[2],
        ];
        t.origin = handOrigin(releaseOrigin, t.dir);
        t.distance = 0;
        t.phase = "flight";
        t.startTime = now;
        endCast();
        cleaverProjectileState.phase = "flight";
        cleaverProjectileState.worldX = t.origin[0];
        cleaverProjectileState.worldZ = t.origin[2];
        if (projectileRef.current) {
          projectileRef.current.visible = true;
          projectileRef.current.position.set(t.origin[0], t.origin[1], t.origin[2]);
          projectileRef.current.rotation.set(0, Math.atan2(t.dir[0], t.dir[2]), 0);
        }
        playMundoQCast(t.origin);
      }
    }

    if (t.phase === "flight") {
      t.distance += t.flightSpeed * dt;
      const px = t.origin[0] + t.dir[0] * t.distance;
      const pz = t.origin[2] + t.dir[2] * t.distance;
      spinAngleRef.current += SPIN_RATE * dt;
      const yaw = Math.atan2(t.dir[0], t.dir[2]);
      // Network snapshot — kept fresh every frame so the receiver sees the
      // cleaver's actual world position, not just the cast origin.
      cleaverProjectileState.worldX = px;
      cleaverProjectileState.worldZ = pz;
      if (projectileRef.current) {
        projectileRef.current.position.set(px, t.origin[1], pz);
        projectileRef.current.rotation.set(0, yaw, 0);
      }
      if (spinGroupRef.current) {
        spinGroupRef.current.rotation.set(spinAngleRef.current, 0, 0);
      }
      // Position the afterimage ghosts behind the main cleaver along the flight
      // vector. Each ghost is `(i+1) * CLEAVER_MOTION_BLUR_STRIDE_MS` ms in the
      // past — since flight is straight-line at constant speed, that's just a
      // shift of `speed * deltaMs * 0.001` units backward along dir.
      const ghostBaseDist = t.flightSpeed * CLEAVER_MOTION_BLUR_STRIDE_MS * 0.001;
      const ghostSpinStep = SPIN_RATE * CLEAVER_MOTION_BLUR_STRIDE_MS * 0.001;
      for (let i = 0; i < CLEAVER_MOTION_BLUR_SAMPLES; i++) {
        const lagDist = ghostBaseDist * (i + 1);
        // Only show ghosts that would still be inside the actual flight path
        // (no negative-distance ghosts spawning behind Mundo before takeoff).
        const ghostDist = t.distance - lagDist;
        const g = ghostGroupsRef.current[i];
        if (!g) continue;
        if (ghostDist <= 0) {
          g.visible = false;
          continue;
        }
        g.visible = true;
        g.position.set(
          t.origin[0] + t.dir[0] * ghostDist,
          t.origin[1],
          t.origin[2] + t.dir[2] * ghostDist,
        );
        g.rotation.set(0, yaw, 0);
        const gs = ghostSpinGroupsRef.current[i];
        if (gs) gs.rotation.set(spinAngleRef.current - ghostSpinStep * (i + 1), 0, 0);
      }
      const trainer = useTrainerStore.getState().trainer;
      if (trainer !== "pvp" && !t.hitDummy && dummyEntity.alive && hitsDummy(px, pz)) {
        t.hitDummy = true;
        dummyEntity.hitSerial += 1;
        playMundoHit([px, t.origin[1], pz]);
        // Splatter at the dummy's body center, not the cleaver tip — looks
        // anchored to the victim rather than to the projectile's edge.
        useHitEffectStore.getState().trigger(
          [dummyEntity.position[0], 0, dummyEntity.position[2]],
          1,
        );
        t.phase = "idle";
        cleaverProjectileState.active = false;
        cleaverProjectileState.phase = "idle";
        if (projectileRef.current) projectileRef.current.visible = false;
        hideGhosts(ghostGroupsRef.current);
        return;
      }
      // PvP mode: the wall blocks players, not cleavers. Q passes through and
      // only ends on champion hit or max range.
      if (trainer === "pvp") {
        if (opponentEntity.alive) {
          const odx = px - opponentEntity.position[0];
          const odz = pz - opponentEntity.position[2];
          if (Math.hypot(odx, odz) <= CLEAVER_DUMMY_HIT_RADIUS + CLEAVER_WIDTH) {
            const hitAt: [number, number, number] = [
              opponentEntity.position[0],
              0,
              opponentEntity.position[2],
            ];
            const pvpRole = usePvpStore.getState().role;
            const target = pvpRole === "host" ? "client" : "host";
            playMundoHit([px, t.origin[1], pz]);
            useHitEffectStore.getState().trigger(hitAt, 1);
            usePvpStore.getState().damage(target, 1);
            // Frozen Mallet: our cleaver slows the enemy on hit.
            const slowMs = usePvpEconomyStore.getState().owned.frozen_mallet
              ? FROZEN_MALLET_SLOW_MS
              : undefined;
            send({ type: "hit", target, at: hitAt, slowMs });
            t.phase = "idle";
            cleaverProjectileState.active = false;
            cleaverProjectileState.phase = "idle";
            if (projectileRef.current) projectileRef.current.visible = false;
            hideGhosts(ghostGroupsRef.current);
            return;
          }
        }
      }
      if (t.distance >= CLEAVER_RANGE) {
        t.phase = "idle";
        cleaverProjectileState.active = false;
        cleaverProjectileState.phase = "idle";
        if (projectileRef.current) projectileRef.current.visible = false;
        hideGhosts(ghostGroupsRef.current);
      }
    } else if (t.phase === "idle") {
      if (projectileRef.current) projectileRef.current.visible = false;
      hideGhosts(ghostGroupsRef.current);
      if (cleaverProjectileState.active) {
        cleaverProjectileState.active = false;
        cleaverProjectileState.phase = "idle";
      }
    }
  }, -1);

  // Important: do NOT set `visible={false}` as a JSX prop here. If this component
  // ever re-renders mid-flight, the prop would clobber the imperative
  // `projectileRef.current.visible = true` set above. Visibility is fully
  // managed inside useFrame.
  return (
    <>
      <group ref={projectileRef}>
        <group ref={spinGroupRef}>
          <CleaverProjectileModel />
        </group>
      </group>
      {/* PS2-style afterimage ghosts. Each renders the same cleaver model with
          its own translucent material clone. Positions are mutated each frame
          in useFrame to lag behind the main cleaver along the flight vector. */}
      {Array.from({ length: CLEAVER_MOTION_BLUR_SAMPLES }).map((_, i) => {
        // Exponential per-sample decay: each ghost is DECAY% dimmer than the
        // previous. ghost 0 = STRENGTH, ghost 1 = STRENGTH * (1 - DECAY), etc.
        // Clamped to non-negative so very high DECAY still works.
        const alpha = Math.max(
          0,
          CLEAVER_MOTION_BLUR_STRENGTH * Math.pow(1 - CLEAVER_MOTION_BLUR_DECAY, i),
        );
        return (
          <group
            key={i}
            ref={(g) => {
              if (g) ghostGroupsRef.current[i] = g;
            }}
            visible={false}
          >
            <group
              ref={(g) => {
                if (g) ghostSpinGroupsRef.current[i] = g;
              }}
            >
              <CleaverProjectileModel ghostAlpha={alpha} />
            </group>
          </group>
        );
      })}
    </>
  );
}

function hitsDummy(projectileX: number, projectileZ: number) {
  const dx = projectileX - dummyEntity.position[0];
  const dz = projectileZ - dummyEntity.position[2];
  return Math.hypot(dx, dz) <= CLEAVER_DUMMY_HIT_RADIUS + CLEAVER_WIDTH;
}

function isMundoRunning() {
  return Math.hypot(playerEntity.velocity[0], playerEntity.velocity[2]) > MOVING_CAST_SPEED_THRESHOLD;
}

function trainerCooldownMs() {
  if (useTrainerStore.getState().trainer === "pvp") {
    return usePvpStore.getState().settings.qCooldownMs;
  }
  return CLEAVER_COOLDOWN_MS;
}

function hideGhosts(groups: Group[]) {
  for (const g of groups) if (g) g.visible = false;
}

function CleaverProjectileModel({ ghostAlpha }: { ghostAlpha?: number } = {}) {
  const cfg = useAssetStore((s) => s.registry.cleaverProjectileModel);
  const state = useModel(cfg.path);
  const chromaId = useChromaStore((s) => s.selectedId);
  const trainer = useTrainerStore((s) => s.trainer);
  const pvpRole = usePvpStore((s) => s.role);
  const hostSkin = usePvpStore((s) => s.hostSkin);
  const clientSkin = usePvpStore((s) => s.clientSkin);
  const localSkinId =
    trainer === "pvp"
      ? pvpRole === "client"
        ? clientSkin
        : hostSkin
      : chromaId;
  const chromaPath = selectedChromaTexturePath(localSkinId, "mundo");
  const [chromaTexture, setChromaTexture] = useState<Texture | null>(null);
  const isGhost = ghostAlpha !== undefined;

  useEffect(() => {
    let cancelled = false;
    if (!chromaPath) {
      setChromaTexture(null);
      return;
    }
    loadTexture(chromaPath)
      .then((tex) => {
        if (!cancelled) setChromaTexture(tex);
      })
      .catch((err) => {
        console.warn(`[CleaverAbility] failed to load chroma texture ${chromaPath}:`, err);
        if (!cancelled) setChromaTexture(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chromaPath]);

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

      // Main render uses the GLB's ORIGINAL material in place (cloning a freshly
      // loaded GLB material loses the embedded baseColorTexture). Ghosts MUST
      // clone the material so per-ghost opacity doesn't bleed into the main.
      let meshMaterial: any = o.material;
      if (isGhost) {
        meshMaterial = Array.isArray(o.material)
          ? o.material.map((m: any) => m.clone())
          : o.material.clone();
        applyGhostAlpha(meshMaterial, ghostAlpha as number);
      }
      brightenCleaverMaterial(meshMaterial);
      collectMaterials(meshMaterial, materials);
      const mesh = new Mesh(geometry, meshMaterial);
      mesh.castShadow = !isGhost;
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
  }, [state, cfg.autoFitHeight, isGhost, ghostAlpha]);

  // Chroma swap: when a non-default chroma is selected, override `.map` with the
  // chroma texture. The cleaver UVs are part of Mundo's body atlas, so the chroma
  // (same UV layout) lights up the cleaver region correctly. When the chroma is
  // cleared, restore the GLB's original baseColorTexture (cached in userData).
  useEffect(() => {
    if (!prepared) return;
    for (const material of prepared.materials) {
      if (!material) continue;
      if (material.userData.baseMap === undefined) {
        material.userData.baseMap = material.map ?? null;
      }
      const tex = chromaTexture ?? material.userData.baseMap ?? null;
      material.map = tex;
      // Shadeless: pipe the texture through emissive at full intensity and
      // zero out the lit color so directional/ambient lighting can't darken it.
      if (material.emissive) {
        material.emissive.set(0xffffff);
        material.emissiveIntensity = 1;
        material.emissiveMap = tex;
      }
      if (material.color) material.color.set(0x000000);
      material.needsUpdate = true;
    }
  }, [prepared, chromaTexture]);

  if (!prepared) return null;

  return (
    <group scale={cfg.scale * prepared.autoScale * CLEAVER_SIZE}>
      <primitive object={prepared.scene} />
    </group>
  );
}

function collectMaterials(source: any, out: any[]) {
  const materials = Array.isArray(source) ? source : [source];
  for (const material of materials) {
    if (material && !out.includes(material)) out.push(material);
  }
}

function brightenCleaverMaterial(source: any) {
  const materials = Array.isArray(source) ? source : [source];
  for (const material of materials) {
    if (!material) continue;
    material.side = DoubleSide;
    material.needsUpdate = true;
  }
}

function applyGhostAlpha(source: any, alpha: number) {
  const materials = Array.isArray(source) ? source : [source];
  for (const material of materials) {
    if (!material) continue;
    material.transparent = true;
    material.opacity = alpha;
    material.depthWrite = false;
    // ADDITIVE blending so ghosts brighten whatever's behind them instead of
    // dimming it. With normal blending, 15 stacked translucent ghosts darken
    // the arena's transparent boundary ring enough that it appears to "flash
    // off" during a cleaver throw. Additive keeps every underlying outline +
    // grid line at full opacity AND reads as a glowing PS2-style trail.
    material.blending = AdditiveBlending;
    material.needsUpdate = true;
  }
}

function handOrigin(origin: [number, number, number], dir: [number, number, number]): [number, number, number] {
  // Right vector in XZ for a forward-facing yaw: right = (dz, -dx).
  const rightX = dir[2];
  const rightZ = -dir[0];
  return [
    origin[0] + dir[0] * CLEAVER_HAND_FORWARD_OFFSET + rightX * CLEAVER_HAND_RIGHT_OFFSET,
    origin[1],
    origin[2] + dir[2] * CLEAVER_HAND_FORWARD_OFFSET + rightZ * CLEAVER_HAND_RIGHT_OFFSET,
  ];
}
