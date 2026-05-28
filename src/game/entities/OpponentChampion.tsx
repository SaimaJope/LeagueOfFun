import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";
import { useAssetStore } from "@/stores/assetStore";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import type { ActionKey } from "@/game/animation/clipMatcher";
import { opponentEntity } from "@/stores/entityStore";
import { selectedChromaTexturePath } from "@/stores/chromaStore";
import { usePvpStore } from "@/stores/pvpStore";
import { playMundoDeath } from "@/game/audio/mundoAudio";

const POSITION_SMOOTHING = 24;
const ROTATION_SPEED = 34;
const MOVE_ANIM_SPEED = 0.12;

/**
 * Render-only opponent in PvP. Mirrors the position/rotation of
 * {@link opponentEntity} every frame — that struct is mutated by the network
 * sync loop from incoming "state" messages.
 */
export function OpponentChampion() {
  const ref = useRef<Group>(null);
  const initializedRef = useRef(false);
  const renderXRef = useRef(0);
  const renderZRef = useRef(0);
  const renderRotRef = useRef(0);
  const [action, setAction] = useState<ActionKey>("idle");
  const [actionToken, setActionToken] = useState(0);
  // Tracks the opponent's last cleaver cast so we fire the throw animation once
  // per Q. The cleaver projectile is networked (see PvpSync), so its
  // `castStartedAt` changing is our signal that the opponent just pressed Q.
  const lastCastStartedAtRef = useRef(0);
  const attackingRef = useRef(false);
  // Latches once when the opponent dies so the death one-shot + sound fire
  // exactly once; cleared on a rematch when HP is restored.
  const deadRef = useRef(false);
  const mundoCfg = useAssetStore((s) => s.registry.mundoPlayerModel);
  const role = usePvpStore((s) => s.role);
  const hostSkin = usePvpStore((s) => s.hostSkin);
  const clientSkin = usePvpStore((s) => s.clientSkin);
  // Opponent's skin: if I'm the host, my opponent is the client (and vice versa).
  const opponentSkinId = role === "host" ? clientSkin : hostSkin;

  useFrame((_, dt) => {
    if (!ref.current) return;
    const [x, , z] = opponentEntity.position;

    if (!initializedRef.current) {
      renderXRef.current = x;
      renderZRef.current = z;
      renderRotRef.current = opponentEntity.rotationY;
      initializedRef.current = true;
    }

    const alpha = 1 - Math.exp(-POSITION_SMOOTHING * dt);
    renderXRef.current += (x - renderXRef.current) * alpha;
    renderZRef.current += (z - renderZRef.current) * alpha;
    renderRotRef.current = rotateTowardAngle(
      renderRotRef.current,
      opponentEntity.rotationY,
      ROTATION_SPEED * dt,
    );

    ref.current.position.set(renderXRef.current, 0, renderZRef.current);
    ref.current.rotation.y = renderRotRef.current;

    // Death: when the opponent's HP hits 0, play the death one-shot + sound once
    // and freeze the animation. Cleared on a rematch when HP is restored.
    const oppRole = role === "host" ? "client" : "host";
    const oppHp = usePvpStore.getState().hp[oppRole];
    if (deadRef.current && oppHp > 0) {
      deadRef.current = false;
    } else if (!deadRef.current && oppHp <= 0) {
      deadRef.current = true;
      attackingRef.current = false;
      setAction("death");
      setActionToken((t) => t + 1);
      playMundoDeath(opponentEntity.position);
      return;
    }
    if (deadRef.current) return;

    // Detect a new Q cast: the networked cleaver carries the throw timestamp.
    const cleaver = opponentEntity.cleaver;
    if (cleaver && cleaver.castStartedAt !== lastCastStartedAtRef.current) {
      lastCastStartedAtRef.current = cleaver.castStartedAt;
      attackingRef.current = true;
      setAction("attack");
      setActionToken((t) => t + 1);
      return;
    }

    // Hold the attack one-shot until AnimatedModel reports it finished.
    if (attackingRef.current) return;

    const speed = Math.hypot(opponentEntity.velocity[0], opponentEntity.velocity[2]);
    const desired: ActionKey = speed > MOVE_ANIM_SPEED ? "move" : "idle";
    setAction((prev) => (prev === desired ? prev : desired));
  });

  const handleActionFinished = (finished: ActionKey) => {
    if (finished === "attack") {
      attackingRef.current = false;
    }
  };

  return (
    <group ref={ref}>
      <AnimatedModel
        config={mundoCfg}
        action={action}
        actionToken={actionToken}
        onActionFinished={handleActionFinished}
        fallbackColor="#d96b6b"
        materialTexturePath={selectedChromaTexturePath(opponentSkinId, "mundo")}
      />
    </group>
  );
}

function rotateTowardAngle(current: number, target: number, maxStep: number) {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return normalizeAngle(current + Math.sign(delta) * maxStep);
}

function normalizeAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
