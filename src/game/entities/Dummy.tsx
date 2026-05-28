import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { dummyEntities, playerEntity, useDummyStore, type MutableEntity } from "@/stores/entityStore";
import { useAssetStore } from "@/stores/assetStore";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import type { ActionKey } from "@/game/animation/clipMatcher";
import { useGameStore } from "@/stores/gameStore";
import { newMemory, updateDummy } from "@/game/ai/DummyAI";
import { aiBus } from "@/stores/aiBus";
import { PLAY_AREA_BOUND } from "@/game/config/playArea.config";
import type { Vec3 } from "@/types/game";

const MINION_BLOCK_RADIUS = 1.45;
const MINION_BLOCK_NUDGE = 0.65;

export function Dummy() {
  const count = useDummyStore((s) => s.count);
  const version = useDummyStore((s) => s.version);
  const setCount = useDummyStore((s) => s.setCount);
  const toggleFreezeDummies = useGameStore((s) => s.toggleFreezeDummies);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "F2" && !e.repeat) {
        e.preventDefault();
        toggleFreezeDummies();
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (!["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].includes(e.code)) return;
      e.preventDefault();
      setCount(Number(e.code.slice("Digit".length)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCount, toggleFreezeDummies]);

  return (
    <>
      {dummyEntities.slice(0, count).map((entity, index) => (
        <DummyInstance key={`${index}-${version}`} entity={entity} detectClips={index === 0} />
      ))}
      <FlashVfx />
    </>
  );
}

function DummyInstance({ entity, detectClips }: { entity: MutableEntity; detectClips: boolean }) {
  const ref = useRef<Group>(null);
  const cfg = useAssetStore((s) => s.registry.defaultDummyModel);
  const clipOverrides = useAssetStore((s) => s.clipOverrides.dummy);
  const setDetectedClips = useAssetStore((s) => s.setDetectedClips);

  const aiCfg = useGameStore((s) => s.aiConfig);
  const freezeDummies = useGameStore((s) => s.devMode.freezeDummies);
  const sensor = useGameStore((s) => s.hookSensor);
  const lastResult = useGameStore((s) => s.hook.lastResult);

  const memory = useMemo(() => newMemory(), []);
  const [action, setAction] = useState<ActionKey>("idle");
  const deathUntilRef = useRef(0);
  const hitSerialRef = useRef(entity.hitSerial);
  const respawnTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (respawnTimerRef.current !== null) window.clearTimeout(respawnTimerRef.current);
    };
  }, []);

  useFrame((_, dt) => {
    const now = performance.now();
    if (entity.hitSerial !== hitSerialRef.current) {
      hitSerialRef.current = entity.hitSerial;
      deathUntilRef.current = now + 3000;
      setAction("hit");
      if (respawnTimerRef.current !== null) window.clearTimeout(respawnTimerRef.current);
      respawnTimerRef.current = window.setTimeout(() => {
        respawnDummy(entity);
        memory.velocity = [0, 0, 0];
        deathUntilRef.current = 0;
        respawnTimerRef.current = null;
        setAction("idle");
      }, 3000);
    }

    // Freeze AI during death anim
    if (deathUntilRef.current > now) {
      memory.velocity = [0, 0, 0];
      if (ref.current) {
        const [x, , z] = entity.position;
        ref.current.position.set(x, 0, z);
        ref.current.rotation.y = entity.rotationY;
      }
      return;
    }
    if (freezeDummies) {
      memory.velocity = [0, 0, 0];
      entity.velocity = [0, 0, 0];
      if (action !== "idle") setAction("idle");
      if (sensor.castStartedAt === null) aiBus.flashedThisCast = false;
      if (ref.current) {
        const [x, , z] = entity.position;
        ref.current.position.set(x, 0, z);
        ref.current.rotation.y = entity.rotationY;
      }
      return;
    }
    const res = updateDummy(entity.position, aiCfg, sensor, memory, dt, now);
    entity.position = applyMinionBlock(res.position, memory.velocity);
    entity.velocity = [memory.velocity[0], 0, memory.velocity[2]];
    aiBus.dummyFlashReadyAt = memory.flashReadyAt;

    if (res.flashed) {
      aiBus.flashedThisCast = true;
      aiBus.lastFlash = { from: res.flashed.from, to: res.flashed.to, at: now };
      setAction("flash");
      // bounce back to idle/move shortly
      window.setTimeout(() => setAction("idle"), 300);
    }

    // face movement direction
    const vx = memory.velocity[0];
    const vz = memory.velocity[2];
    const speed = Math.hypot(vx, vz);
    if (speed > 0.05) {
      entity.rotationY = Math.atan2(vx, vz);
      if (action === "idle") setAction("move");
    } else if (action === "move") {
      setAction("idle");
    }

    // clear flash flag once sensor returns to idle
    if (sensor.castStartedAt === null) {
      aiBus.flashedThisCast = false;
    }

    if (ref.current) {
      const [x, , z] = entity.position;
      ref.current.position.set(x, 0, z);
      ref.current.rotation.y = entity.rotationY;
    }
  });

  return (
    <group ref={ref}>
      <AnimatedModel
        config={cfg}
        action={action}
        fallbackColor="#ff6b6b"
        clipOverrides={clipOverrides}
        onClipsDetected={detectClips ? (names) => setDetectedClips("dummy", names) : undefined}
      />
    </group>
  );
}

function respawnDummy(entity: MutableEntity) {
  const a = Math.random() * Math.PI * 2;
  const r = 6 + Math.random() * 4;
  entity.position = [
    clamp(Math.cos(a) * r, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
    0,
    clamp(Math.sin(a) * r, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
  ];
  entity.velocity = [0, 0, 0];
  entity.rotationY = 0;
  entity.alive = true;
}

function applyMinionBlock(position: Vec3, velocity: Vec3): Vec3 {
  const dx = position[0] - playerEntity.position[0];
  const dz = position[2] - playerEntity.position[2];
  const dist = Math.hypot(dx, dz);
  if (dist >= MINION_BLOCK_RADIUS) return position;

  let nx = dx / (dist || 1);
  let nz = dz / (dist || 1);
  if (dist < 0.001) {
    const a = Math.random() * Math.PI * 2;
    nx = Math.cos(a);
    nz = Math.sin(a);
  }

  const push = (MINION_BLOCK_RADIUS - dist) * MINION_BLOCK_NUDGE;
  velocity[0] = nx * Math.max(Math.abs(velocity[0]), 1.8);
  velocity[2] = nz * Math.max(Math.abs(velocity[2]), 1.8);

  return [
    clamp(position[0] + nx * push, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
    0,
    clamp(position[2] + nz * push, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
  ];
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Small expanding ring + flash sphere when the dummy blinks. */
function FlashVfx() {
  const ringRef = useRef<any>(null);
  const sphereRef = useRef<any>(null);
  useFrame(() => {
    const lf = aiBus.lastFlash;
    if (!lf) {
      if (ringRef.current) ringRef.current.visible = false;
      if (sphereRef.current) sphereRef.current.visible = false;
      return;
    }
    const elapsed = performance.now() - lf.at;
    const dur = 380;
    if (elapsed > dur) {
      if (ringRef.current) ringRef.current.visible = false;
      if (sphereRef.current) sphereRef.current.visible = false;
      return;
    }
    const t = elapsed / dur;
    // ring at *from* (origin)
    if (ringRef.current) {
      ringRef.current.visible = true;
      ringRef.current.position.set(lf.from[0], 0.05, lf.from[2]);
      ringRef.current.scale.setScalar(0.5 + t * 3);
      (ringRef.current.material as any).opacity = (1 - t) * 0.8;
    }
    if (sphereRef.current) {
      sphereRef.current.visible = true;
      sphereRef.current.position.set(lf.to[0], 1, lf.to[2]);
      (sphereRef.current.material as any).opacity = (1 - t) * 0.9;
    }
  });
  return (
    <>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.4, 0.55, 32]} />
        <meshBasicMaterial color="#ffd166" transparent />
      </mesh>
      <mesh ref={sphereRef} visible={false}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial color="#ffeaa3" transparent />
      </mesh>
    </>
  );
}
