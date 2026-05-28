import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import type { ActionKey } from "@/game/animation/clipMatcher";
import { DODGEBALL_ARENA_RADIUS } from "@/game/config/dodgeball.config";
import { useAssetStore } from "@/stores/assetStore";
import { dummyEntity, playerEntity } from "@/stores/entityStore";

const DUMMY_POSITION: [number, number, number] = [4.8, 0, 0];

export function DodgeballDummy() {
  const ref = useRef<Group>(null);
  const cfg = useAssetStore((s) => s.registry.defaultDummyModel);
  const clipOverrides = useAssetStore((s) => s.clipOverrides.dummy);
  const [action, setAction] = useState<ActionKey>("idle");
  const [actionToken, setActionToken] = useState(0);
  const lastHitSerialRef = useRef(dummyEntity.hitSerial);

  useEffect(() => {
    dummyEntity.position = clampToArena(DUMMY_POSITION);
    dummyEntity.velocity = [0, 0, 0];
    dummyEntity.rotationY = 0;
    dummyEntity.alive = true;
    dummyEntity.hitSerial = 0;
    lastHitSerialRef.current = 0;
  }, []);

  useFrame(() => {
    if (dummyEntity.hitSerial !== lastHitSerialRef.current) {
      lastHitSerialRef.current = dummyEntity.hitSerial;
      setAction("hit");
      setActionToken((token) => token + 1);
    }

    const dx = playerEntity.position[0] - dummyEntity.position[0];
    const dz = playerEntity.position[2] - dummyEntity.position[2];
    dummyEntity.rotationY = Math.atan2(dx, dz);

    if (ref.current) {
      ref.current.position.set(dummyEntity.position[0], 0, dummyEntity.position[2]);
      ref.current.rotation.y = dummyEntity.rotationY;
    }
  });

  return (
    <group ref={ref}>
      <AnimatedModel
        config={cfg}
        action={action}
        actionToken={actionToken}
        fallbackColor="#ff6b6b"
        clipOverrides={clipOverrides}
        onActionFinished={(finished) => {
          if (finished === "hit") setAction("idle");
        }}
      />
    </group>
  );
}

function clampToArena(position: [number, number, number]): [number, number, number] {
  const radius = DODGEBALL_ARENA_RADIUS - 0.8;
  const dist = Math.hypot(position[0], position[2]);
  if (dist <= radius) return position;
  const scale = radius / (dist || 1);
  return [position[0] * scale, position[1], position[2] * scale];
}
