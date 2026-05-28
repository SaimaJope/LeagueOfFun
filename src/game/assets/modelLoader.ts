import { useEffect, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { AnimationClip, Group } from "three";
import { publicAsset } from "@/game/assets/publicPath";

export interface LoadedModel {
  scene: Group;
  clips: AnimationClip[];
  /** Detected clip names (uppercase preserved) */
  clipNames: string[];
}

export type ModelLoadState =
  | { status: "loading"; error: null }
  | { status: "ready"; model: LoadedModel; error: null }
  | { status: "error"; error: string };

const cache = new Map<string, Promise<LoadedModel>>();

export function loadModel(path: string): Promise<LoadedModel> {
  const cached = cache.get(path);
  if (cached) return cached;

  const resolved = publicAsset(path);
  const p = new Promise<LoadedModel>((resolve, reject) => {
    const lower = path.toLowerCase();
    if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
      const loader = new GLTFLoader();
      loader.load(
        resolved,
        (gltf) => {
          const scene = gltf.scene as Group;
          scene.traverse((o: any) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          resolve({
            scene,
            clips: gltf.animations || [],
            clipNames: (gltf.animations || []).map((c) => c.name),
          });
        },
        undefined,
        (err) => reject(err),
      );
    } else if (lower.endsWith(".fbx")) {
      const loader = new FBXLoader();
      loader.load(
        resolved,
        (fbx) => {
          fbx.traverse((o: any) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          resolve({
            scene: fbx as unknown as Group,
            clips: fbx.animations || [],
            clipNames: (fbx.animations || []).map((c) => c.name),
          });
        },
        undefined,
        (err) => reject(err),
      );
    } else {
      reject(new Error(`Unsupported model format: ${path}`));
    }
  });

  cache.set(path, p);
  // If load fails, drop cache so a later retry can succeed.
  p.catch(() => cache.delete(path));
  return p;
}

/**
 * Try to load a model. Returns the model on success, or null + error string on failure.
 * Components should render a placeholder when this returns null.
 */
export function useModel(path: string | null | undefined): ModelLoadState {
  const [state, setState] = useState<ModelLoadState>({ status: "loading", error: null });

  useEffect(() => {
    if (!path) {
      setState({ status: "error", error: "no path" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", error: null });
    loadModel(path)
      .then((model) => {
        if (!cancelled) {
          // Clone the scene so multiple users of the same path get independent transforms.
          const cloned = cloneSkeleton(model.scene) as Group;
          setState({
            status: "ready",
            model: { scene: cloned, clips: model.clips, clipNames: model.clipNames },
            error: null,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn(`[modelLoader] failed to load ${path}:`, err);
          setState({ status: "error", error: String(err?.message ?? err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
