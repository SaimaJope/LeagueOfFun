import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { useAssetStore } from "@/stores/assetStore";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import { opponentEntity } from "@/stores/entityStore";
import { selectedChromaTexturePath } from "@/stores/chromaStore";
import { usePvpStore } from "@/stores/pvpStore";

/**
 * Render-only opponent in PvP. Mirrors the position/rotation of
 * {@link opponentEntity} every frame — that struct is mutated by the network
 * sync loop from incoming "state" messages.
 */
export function OpponentChampion() {
  const ref = useRef<Group>(null);
  const mundoCfg = useAssetStore((s) => s.registry.mundoPlayerModel);
  const role = usePvpStore((s) => s.role);
  const hostSkin = usePvpStore((s) => s.hostSkin);
  const clientSkin = usePvpStore((s) => s.clientSkin);
  // Opponent's skin: if I'm the host, my opponent is the client (and vice versa).
  const opponentSkinId = role === "host" ? clientSkin : hostSkin;

  useFrame(() => {
    if (!ref.current) return;
    const [x, , z] = opponentEntity.position;
    ref.current.position.set(x, 0, z);
    ref.current.rotation.y = opponentEntity.rotationY;
  });

  return (
    <group ref={ref}>
      <AnimatedModel
        config={mundoCfg}
        action="idle"
        fallbackColor="#d96b6b"
        materialTexturePath={selectedChromaTexturePath(opponentSkinId, "mundo")}
      />
    </group>
  );
}
