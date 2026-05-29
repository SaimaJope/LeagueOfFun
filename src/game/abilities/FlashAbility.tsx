import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { inputState } from "@/game/input/useInput";
import { aimGroundPoint } from "@/game/input/aimRaycaster";
import { playerEntity } from "@/stores/entityStore";
import { useFlashStore } from "@/stores/flashStore";
import { useTrainerStore } from "@/stores/trainerStore";
import { usePvpStore } from "@/stores/pvpStore";
import { send } from "@/game/network/peerNetwork";
import { playMundoFlash } from "@/game/audio/mundoAudio";
import { FlashVfx } from "@/game/abilities/FlashVfx";
import {
  DODGEBALL_ARENA_RADIUS,
  FLASH_COOLDOWN_MS,
  FLASH_RANGE,
} from "@/game/config/dodgeball.config";

const ARENA_PADDING = 0.2;

export function FlashAbility() {
  const { camera } = useThree();
  const fWasDownRef = useRef(false);
  const triggerRef = useRef(useFlashStore.getState().trigger);

  useFrame(() => {
    const now = performance.now();
    const fDown = !!inputState.keys["KeyF"];
    const flashStore = useFlashStore.getState();

    // In PvP, abilities are locked until the round is actually live (post-countdown).
    const pvpLocked =
      useTrainerStore.getState().trainer === "pvp" &&
      usePvpStore.getState().phase !== "playing";

    if (!pvpLocked && fDown && !fWasDownRef.current && now >= flashStore.cooldownUntil) {
      const origin: [number, number, number] = [
        playerEntity.position[0],
        0,
        playerEntity.position[2],
      ];
      const aim = aimGroundPoint(camera, inputState.mouseNDC.x, inputState.mouseNDC.y);
      const dx = (aim?.[0] ?? origin[0] + 1) - origin[0];
      const dz = (aim?.[2] ?? origin[2]) - origin[2];
      const aimDist = Math.hypot(dx, dz) || 1;
      const blinkDist = Math.min(FLASH_RANGE, aimDist);
      const dirX = dx / aimDist;
      const dirZ = dz / aimDist;
      let destX = origin[0] + dirX * blinkDist;
      let destZ = origin[2] + dirZ * blinkDist;
      const radius = DODGEBALL_ARENA_RADIUS - ARENA_PADDING;
      const destR = Math.hypot(destX, destZ);
      if (destR > radius) {
        const s = radius / destR;
        destX *= s;
        destZ *= s;
      }
      const destination: [number, number, number] = [destX, 0, destZ];

      playerEntity.position = [destX, 0, destZ];
      playerEntity.velocity = [0, 0, 0];
      const cd =
        useTrainerStore.getState().trainer === "pvp"
          ? usePvpStore.getState().settings.flashCooldownMs
          : FLASH_COOLDOWN_MS;
      triggerRef.current(origin, destination, now + cd, now);
      playMundoFlash(destination);
      // Broadcast so the opponent sees the same blink burst at our endpoints.
      if (useTrainerStore.getState().trainer === "pvp") {
        send({ type: "flash", origin, destination });
      }
    }
    fWasDownRef.current = fDown;
  });

  return <FlashVfx read={useFlashStore.getState} />;
}
