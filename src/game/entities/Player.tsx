import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { playerEntity, useAimStore } from "@/stores/entityStore";
import { inputState } from "@/game/input/useInput";
import { aimGroundPoint } from "@/game/input/aimRaycaster";
import { useAssetStore } from "@/stores/assetStore";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import { useGameStore } from "@/stores/gameStore";
import type { ActionKey } from "@/game/animation/clipMatcher";
import type { Vec3 } from "@/types/game";
import { PLAY_AREA_BOUND, leagueUnits } from "@/game/config/playArea.config";
import { playerControlState } from "@/stores/entityStore";
import { selectedChromaTexturePath, useChromaStore } from "@/stores/chromaStore";
import { maybePlayThreshMoveQuote } from "@/game/audio/threshAudio";
import { getPlayerAnimationFrame } from "@/game/animation/playerAnimationSequence";

const PLAYER_SPEED = leagueUnits(330);
const STOP_DISTANCE = 0.06;
const TURN_RATE = 22;
const HOLD_RETARGET_MIN_HZ = 1;
const HOLD_RETARGET_MAX_HZ = 4;
const HOLD_RETARGET_WAVE_MS = 2400;

export function Player() {
  const ref = useRef<Group>(null);
  const { camera } = useThree();
  const setAim = useAimStore((s) => s.setAim);
  const playerCfg = useAssetStore((s) => s.registry.playerModel);
  const clipOverrides = useAssetStore((s) => s.clipOverrides.player);
  const setDetectedClips = useAssetStore((s) => s.setDetectedClips);
  const chromaId = useChromaStore((s) => s.selectedId);

  const hook = useGameStore((s) => s.hook);

  const [action, setAction] = useState<ActionKey>("idle");
  const [actionToken, setActionToken] = useState(0);
  const [animationSpeedMultiplier, setAnimationSpeedMultiplier] = useState(1);
  const danceUntilRef = useRef(0);
  const destinationRef = useRef<Vec3>([0, 0, 0]);
  const hasDestinationRef = useRef(false);
  const rightWasDownRef = useRef(false);
  const holdMoveStartedAtRef = useRef(0);
  const nextHeldMoveCommandAtRef = useRef(0);
  const cancelMoveTokenRef = useRef(0);
  const animationSpeedMultiplierRef = useRef(1);

  // Ctrl+3 toggles a 4s dance window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.repeat && (e.code === "Digit3" || e.key === "3")) {
        e.preventDefault();
        danceUntilRef.current = performance.now() + 4000;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFrame((_, dt) => {
    if (cancelMoveTokenRef.current !== playerControlState.cancelMoveToken) {
      cancelMoveTokenRef.current = playerControlState.cancelMoveToken;
      hasDestinationRef.current = false;
    }
    if (animationSpeedMultiplierRef.current !== playerControlState.animationSpeedMultiplier) {
      animationSpeedMultiplierRef.current = playerControlState.animationSpeedMultiplier;
      setAnimationSpeedMultiplier(playerControlState.animationSpeedMultiplier);
    }

    const now = performance.now();
    const [px, , pz] = playerEntity.position;
    if (inputState.keys["KeyS"]) {
      hasDestinationRef.current = false;
      danceUntilRef.current = 0;
    }
    if (inputState.keys["KeyQ"]) {
      danceUntilRef.current = 0;
    }

    const aim = aimGroundPoint(camera, inputState.mouseNDC.x, inputState.mouseNDC.y);
    const rightDown = inputState.mouseDown.right;
    const rightPressed = rightDown && !rightWasDownRef.current;
    const heldCommandReady = rightDown && now >= nextHeldMoveCommandAtRef.current;
    rightWasDownRef.current = rightDown;
    if (rightPressed) holdMoveStartedAtRef.current = now;
    if (!rightDown) {
      holdMoveStartedAtRef.current = 0;
      nextHeldMoveCommandAtRef.current = 0;
    }
    if (aim) {
      setAim(aim);
      if (rightPressed || heldCommandReady) {
        const destination: Vec3 = [
          clamp(aim[0], -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
          0,
          clamp(aim[2], -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
        ];
        destinationRef.current = destination;
        nextHeldMoveCommandAtRef.current = now + heldRetargetIntervalMs(now - holdMoveStartedAtRef.current);
        hasDestinationRef.current = Math.hypot(destination[0] - px, destination[2] - pz) > STOP_DISTANCE;
        danceUntilRef.current = 0;
        if (rightPressed && hasDestinationRef.current) {
          maybePlayThreshMoveQuote(playerEntity.position, now);
        }
      }
    }

    let mx = 0;
    let mz = 0;
    const canMove = !hook.casting && !hook.active && now >= playerControlState.movementLockedUntil;
    if (canMove && hasDestinationRef.current) {
      const dest = destinationRef.current;
      const dx = dest[0] - px;
      const dz = dest[2] - pz;
      const dist = Math.hypot(dx, dz);
      if (dist <= STOP_DISTANCE) {
        hasDestinationRef.current = false;
      } else {
        mx = dx / dist;
        mz = dz / dist;
      }
    }

    const currentSpeed = PLAYER_SPEED * playerControlState.movementSpeedMultiplier;
    const vx = canMove && hasDestinationRef.current ? mx * currentSpeed : 0;
    const vz = canMove && hasDestinationRef.current ? mz * currentSpeed : 0;
    const moving = Math.hypot(vx, vz) > 0.03;
    const nx = clamp(px + vx * dt, -PLAY_AREA_BOUND, PLAY_AREA_BOUND);
    const nz = clamp(pz + vz * dt, -PLAY_AREA_BOUND, PLAY_AREA_BOUND);
    playerEntity.position = [nx, 0, nz];
    playerEntity.velocity = [vx, 0, vz];

    if (moving) {
      danceUntilRef.current = 0;
      playerEntity.rotationY = rotateTowardAngle(playerEntity.rotationY, Math.atan2(vx, vz), TURN_RATE * dt);
    }

    const faceTarget = playerControlState.faceTarget;
    if (faceTarget) {
      const dx = faceTarget.position[0] - nx;
      const dz = faceTarget.position[2] - nz;
      if (Math.hypot(dx, dz) > 0.001) {
        playerEntity.rotationY = Math.atan2(dx, dz);
      }
    }

    if (ref.current) {
      ref.current.position.set(nx, 0, nz);
      ref.current.rotation.y = playerEntity.rotationY;
    }

    // pick desired action
    let desired: ActionKey;
    const forcedAnimation = getPlayerAnimationFrame(now);
    const desiredToken = forcedAnimation?.token ?? 0;
    if (forcedAnimation) desired = forcedAnimation.action;
    else if (playerControlState.dashActive) desired = "dash";
    else if (hook.casting || hook.active) desired = "cast";
    else if (danceUntilRef.current > now) desired = "dance";
    else if (moving) desired = "move";
    else desired = "idle";
    setActionToken((prev) => (prev === desiredToken ? prev : desiredToken));
    setAction((prev) => (prev === desired ? prev : desired));
  });

  const forcedAnimation = getPlayerAnimationFrame();
  const modelTimeScale = forcedAnimation ? forcedAnimation.timeScale : action === "move" ? animationSpeedMultiplier : 1;

  return (
    <group ref={ref}>
      <AnimatedModel
        config={playerCfg}
        action={action}
        fallbackColor="#4ea1ff"
        clipOverrides={clipOverrides}
        materialTexturePath={selectedChromaTexturePath(chromaId)}
        actionToken={actionToken}
        timeScale={modelTimeScale}
        onClipsDetected={(names) => setDetectedClips("player", names)}
      />
    </group>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function heldRetargetIntervalMs(heldForMs: number) {
  const phase = (heldForMs / HOLD_RETARGET_WAVE_MS) * Math.PI * 2;
  const wave01 = (Math.sin(phase) + 1) / 2;
  const hz = HOLD_RETARGET_MIN_HZ + wave01 * (HOLD_RETARGET_MAX_HZ - HOLD_RETARGET_MIN_HZ);
  return 1000 / hz;
}

function rotateTowardAngle(current: number, target: number, maxStep: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}
