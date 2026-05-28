import { useEffect, useRef } from "react";

export interface InputState {
  keys: Record<string, boolean>;
  mouseDown: { left: boolean; right: boolean };
  /** Mouse position in NDC (-1..1) */
  mouseNDC: { x: number; y: number };
}

export const inputState: InputState = {
  keys: {},
  mouseDown: { left: false, right: false },
  mouseNDC: { x: 0, y: 0 },
};

export function useInput(canvas: HTMLCanvasElement | null) {
  const bound = useRef(false);
  useEffect(() => {
    if (bound.current) return;
    bound.current = true;
    const kd = (e: KeyboardEvent) => {
      inputState.keys[e.code] = true;
    };
    const ku = (e: KeyboardEvent) => {
      inputState.keys[e.code] = false;
    };
    const md = (e: MouseEvent) => {
      if (e.button === 0) inputState.mouseDown.left = true;
      if (e.button === 2) inputState.mouseDown.right = true;
    };
    const mu = (e: MouseEvent) => {
      if (e.button === 0) inputState.mouseDown.left = false;
      if (e.button === 2) inputState.mouseDown.right = false;
    };
    const mm = (e: MouseEvent) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      inputState.mouseNDC.x = (e.clientX / w) * 2 - 1;
      inputState.mouseNDC.y = -(e.clientY / h) * 2 + 1;
    };
    const ctx = (e: MouseEvent) => e.preventDefault();

    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("mousemove", mm);
    window.addEventListener("contextmenu", ctx);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("contextmenu", ctx);
      bound.current = false;
    };
  }, [canvas]);
}
