import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { playerEntity } from "@/stores/entityStore";
import { PLAY_AREA_BOUND } from "@/game/config/playArea.config";
import { updateThreshAudioListener } from "@/game/audio/threshAudio";

const BASE_OFFSET = new Vector3(0, 22, 13);
const MIN_ZOOM = 0.22;
const MAX_ZOOM = 0.62;

export function IsoCamera() {
  const { camera } = useThree();
  const target = useRef(new Vector3());
  const cameraCenter = useRef(new Vector3());
  const dragAnchorMouse = useRef({ x: 0, y: 0 });
  const dragCurrentMouse = useRef({ x: 0, y: 0 });
  const zoom = useRef(MAX_ZOOM);
  const locked = useRef(true);
  const draggingMiddle = useRef(false);
  const spaceHeld = useRef(false);

  useEffect(() => {
    camera.position.set(0, BASE_OFFSET.y, BASE_OFFSET.z);
    camera.lookAt(0, 0, 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyY" && !e.repeat) {
        locked.current = !locked.current;
      }
      if (e.code === "Space") {
        spaceHeld.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      draggingMiddle.current = true;
      locked.current = false;
      dragAnchorMouse.current = { x: e.clientX, y: e.clientY };
      dragCurrentMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 1) draggingMiddle.current = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingMiddle.current) return;
      dragCurrentMouse.current = { x: e.clientX, y: e.clientY };
    };
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = clamp(zoom.current + e.deltaY * 0.0008, MIN_ZOOM, MAX_ZOOM);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("auxclick", onAuxClick);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("auxclick", onAuxClick);
      window.removeEventListener("wheel", onWheel);
    };
  }, [camera]);

  useFrame((_, dt) => {
    const [px, , pz] = playerEntity.position;
    if (locked.current || spaceHeld.current) {
      target.current.set(px, 0, pz);
      cameraCenter.current.copy(target.current);
    } else {
      if (draggingMiddle.current) {
        const dx = dragCurrentMouse.current.x - dragAnchorMouse.current.x;
        const dy = dragCurrentMouse.current.y - dragAnchorMouse.current.y;
        const deadZone = 1;
        const scrollSpeed = 0.16 * zoom.current;
        const scrollX = Math.abs(dx) > deadZone ? dx : 0;
        const scrollZ = Math.abs(dy) > deadZone ? dy : 0;
        cameraCenter.current.x = clamp(cameraCenter.current.x + scrollX * scrollSpeed * dt, -PLAY_AREA_BOUND, PLAY_AREA_BOUND);
        cameraCenter.current.z = clamp(cameraCenter.current.z + scrollZ * scrollSpeed * dt, -PLAY_AREA_BOUND, PLAY_AREA_BOUND);
      }
      target.current.copy(cameraCenter.current);
    }
    const desired = target.current.clone().add(BASE_OFFSET.clone().multiplyScalar(zoom.current));
    camera.position.copy(desired);
    camera.lookAt(target.current);
    updateThreshAudioListener(camera);
  });

  return null;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
