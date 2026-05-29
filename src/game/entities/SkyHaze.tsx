import { BackSide } from "three";

export const PVP_SKY_COLOR = "#83ffff";

export function SkyHaze() {
  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[120, 32, 16]} />
      <meshBasicMaterial color={PVP_SKY_COLOR} side={BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}
