import { useEffect } from "react";
import { Color, DoubleSide, MeshBasicMaterial, type Group, type Material, type Texture } from "three";
import { DodgeballArena } from "@/game/entities/DodgeballArena";
import { useModel } from "@/game/assets/modelLoader";

export const MUNDO_PVP_ARENA_MODEL = "/assets/models/environment/environment_rift_final.glb";

export function MundoPvpArena() {
  const state = useModel(MUNDO_PVP_ARENA_MODEL);

  useEffect(() => {
    if (state.status === "error") {
      console.warn(`[MundoPvpArena] failed to load ${MUNDO_PVP_ARENA_MODEL}: ${state.error}`);
    }
  }, [state]);

  if (state.status !== "ready") {
    return <DodgeballArena />;
  }

  normalizeRiftArena(state.model.scene);

  return (
    <group>
      <primitive object={state.model.scene} />
      {/* The rift uses unlit (MeshBasicMaterial) baked textures, which cannot
          receive shadows. This invisible ground plane catches champion shadows
          and drops a soft contact shadow on the floor without relighting the
          arena. */}
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 0]}
      >
        <planeGeometry args={[60, 60]} />
        <shadowMaterial transparent opacity={0.34} depthWrite={false} />
      </mesh>
    </group>
  );
}

const normalizedScenes = new WeakSet<Group>();

function normalizeRiftArena(scene: Group) {
  if (normalizedScenes.has(scene)) return;
  normalizedScenes.add(scene);

  let atlas: Texture | null = null;
  const materials = new Set<ArenaSourceMaterial>();

  scene.traverse((object: any) => {
    if (!object.isMesh) return;

    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;

    for (const material of toMaterialArray(object.material)) {
      const source = material as ArenaSourceMaterial;
      materials.add(source);
      atlas ??= source.map ?? source.emissiveMap ?? null;
    }
  });

  const replacements = new Map<Material, MeshBasicMaterial>();
  for (const material of materials) {
    replacements.set(material, createShadelessArenaMaterial(material, atlas));
  }

  scene.traverse((object: any) => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material: Material) => replacements.get(material) ?? material)
      : replacements.get(object.material) ?? object.material;
  });
}

type ArenaSourceMaterial = Material & {
  alphaMap?: Texture | null;
  color?: Color;
  emissiveMap?: Texture | null;
  map?: Texture | null;
};

function createShadelessArenaMaterial(material: ArenaSourceMaterial, atlas: Texture | null) {
  const isRiftChunk = material.name.startsWith("chunk_jungle");
  const map = material.map ?? material.emissiveMap ?? (isRiftChunk ? atlas : null);

  if (map) {
    map.needsUpdate = true;
  }

  const shadeless = new MeshBasicMaterial({
    name: `${material.name || "Arena_Material"}_Shadeless`,
    alphaMap: material.alphaMap ?? null,
    alphaTest: material.alphaTest,
    color: map ? new Color(0xffffff) : material.color?.clone() ?? new Color(0xffffff),
    depthWrite: material.transparent ? false : material.depthWrite,
    map,
    opacity: material.opacity,
    side: DoubleSide,
    toneMapped: false,
    transparent: material.transparent,
  });

  shadeless.needsUpdate = true;
  return shadeless;
}

function toMaterialArray(material: Material | Material[]) {
  return Array.isArray(material) ? material : [material];
}
