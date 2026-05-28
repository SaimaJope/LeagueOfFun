import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationMixer,
  Box3,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type AnimationClip,
  type AnimationAction,
  type Group,
  LoopRepeat,
  LoopOnce,
  type Texture,
} from "three";
import { loadModel, useModel } from "@/game/assets/modelLoader";
import { publicAsset } from "@/game/assets/publicPath";
import { pickClip, type ActionKey } from "@/game/animation/clipMatcher";
import type { ModelAssetConfig, AnimationSource } from "@/game/config/assets.config";

interface Props {
  config: ModelAssetConfig;
  action: ActionKey;
  fallbackColor?: string;
  clipOverrides?: Partial<Record<ActionKey, string>>;
  onClipsDetected?: (clipNames: string[]) => void;
  /** Called when the currently-playing one-shot clip finishes its last frame. */
  onActionFinished?: (action: ActionKey) => void;
  materialTexturePath?: string | null;
  actionToken?: number;
  timeScale?: number;
}

const ONESHOT: ActionKey[] = ["cast", "hit", "flash", "recall", "death", "pull1", "pull2", "dash", "idle2", "attack", "attackToIdle", "attackIntoRun"];
type ExternalClipMap = Partial<Record<ActionKey, AnimationClip>>;

function fadeDurationFor(action: ActionKey) {
  if (action === "idle") return 0.07;
  if (action === "move") return 0.08;
  if (action === "attack") return 0.08;
  if (action === "attackToIdle" || action === "attackIntoRun") return 0.14;
  if (ONESHOT.includes(action)) return 0.1;
  return 0.18;
}

/**
 * Renders the base model, runs an AnimationMixer attached to it, and plays
 * the clip for the current action. Clips can come from:
 *   1. config.animationSources[action] -> a separate GLB file (clip pulled in)
 *   2. the base model's own embedded clips, matched by config.animations[action]
 *      or fuzzy by action name
 *
 * When animationSources are used, the system loads those GLBs once and caches
 * extracted clips by source URL. Clips are renamed to "<action>" so the mixer
 * key is stable regardless of the original clip name in the source file.
 */
export function AnimatedModel({
  config,
  action,
  fallbackColor = "#9ec9ff",
  clipOverrides,
  onClipsDetected,
  onActionFinished,
  materialTexturePath,
  actionToken = 0,
  timeScale = 1,
}: Props) {
  const state = useModel(config.path);
  const groupRef = useRef<Group>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const currentClipActionRef = useRef<AnimationAction | null>(null);
  const currentActionRef = useRef<string | null>(null);
  const onClipsDetectedRef = useRef(onClipsDetected);
  const onActionFinishedRef = useRef(onActionFinished);
  const [externalClips, setExternalClips] = useState<ExternalClipMap>({});
  const [materialTexture, setMaterialTexture] = useState<Texture | null>(null);

  useEffect(() => {
    onClipsDetectedRef.current = onClipsDetected;
  }, [onClipsDetected]);

  useEffect(() => {
    onActionFinishedRef.current = onActionFinished;
  }, [onActionFinished]);

  // When the base model resolves, build mixer and start loading external clips.
  useEffect(() => {
    if (state.status !== "ready") return;
    mixerRef.current = new AnimationMixer(state.model.scene);
    currentActionRef.current = null;
    setExternalClips({});

    const sources = config.animationSources ?? {};
    const allNames = [...state.model.clipNames];
    onClipsDetectedRef.current?.(allNames);

    let cancelled = false;
    void Promise.all(
      (Object.entries(sources) as Array<[ActionKey, AnimationSource | undefined]>).map(async ([actionKey, src]) => {
        if (!src) return;
        try {
          const loaded = await loadModel(src.path);
          if (cancelled) return;
          const clip = pickClipFromSource(loaded.clips, src, actionKey);
          if (clip) {
            // Rename so the mixer / overrides see a stable name keyed to the action.
            const renamed = clip.clone();
            renamed.name = actionKey;
            setExternalClips((prev) => ({ ...prev, [actionKey]: renamed }));
            allNames.push(`${actionKey} (from ${src.path.split("/").pop()})`);
            onClipsDetectedRef.current?.(allNames);
          } else {
            console.warn(`[AnimatedModel] no clip found in ${src.path} for action "${actionKey}"`);
          }
        } catch (err) {
          console.warn(`[AnimatedModel] failed to load animation source ${src.path}:`, err);
        }
      }),
    );

    return () => {
      cancelled = true;
      mixerRef.current?.stopAllAction();
      mixerRef.current = null;
      currentClipActionRef.current = null;
    };
  }, [state, config.animationSources]);

  // Drive currently playing action
  useEffect(() => {
    if (state.status !== "ready" || !mixerRef.current) return;
    const mixer = mixerRef.current;

    const selected = selectActionClip({
      action,
      externalClips,
      baseClips: state.model.clips,
      animations: config.animations,
      clipOverrides,
    });
    if (!selected) return;

    const { clip, loopAction } = selected;
    const key = ONESHOT.includes(loopAction)
      ? `${action}->${loopAction}::${clip.name}::${actionToken}`
      : `${action}->${loopAction}::${clip.name}`;
    if (currentActionRef.current === key) {
      if (currentClipActionRef.current) currentClipActionRef.current.timeScale = timeScale;
      return;
    }

    const previousAction = currentClipActionRef.current;
    const a = mixer.clipAction(clip);
    const replayingSameClip = previousAction === a;
    const oneshot = ONESHOT.includes(loopAction);
    const fadeSeconds = fadeDurationFor(loopAction);

    if (replayingSameClip) {
      a.stop();
    } else {
      previousAction?.fadeOut(fadeSeconds);
    }

    a.reset();
    a.enabled = true;
    a.setEffectiveTimeScale(timeScale);
    a.setEffectiveWeight(1);
    a.timeScale = timeScale;
    a.setLoop(oneshot ? LoopOnce : LoopRepeat, Infinity);
    a.clampWhenFinished = oneshot;
    // Fade the old action out while the new one fades in; stopAllAction() would
    // turn this into a one-frame pose cut.
    a.fadeIn(fadeSeconds);
    a.play();
    currentClipActionRef.current = a;
    currentActionRef.current = key;

    if (oneshot) {
      const finishedAction = loopAction;
      const onFinish = (e: any) => {
        if (e.action === a) {
          mixer.removeEventListener("finished", onFinish);
          onActionFinishedRef.current?.(finishedAction);
        }
      };
      mixer.addEventListener("finished", onFinish);
      // Cleanup if effect re-runs (action changed before clip finished)
      return () => {
        mixer.removeEventListener("finished", onFinish);
      };
    }
    return undefined;
  }, [action, actionToken, timeScale, state, externalClips, clipOverrides, config.animations]);

  useEffect(() => {
    if (currentClipActionRef.current) currentClipActionRef.current.timeScale = timeScale;
  }, [timeScale]);

  useFrame((_, dt) => {
    mixerRef.current?.update(dt);
  });

  useEffect(() => {
    let cancelled = false;
    if (!materialTexturePath) {
      setMaterialTexture(null);
      return;
    }

    loadTexture(materialTexturePath)
      .then((texture) => {
        if (!cancelled) setMaterialTexture(texture);
      })
      .catch((err) => {
        console.warn(`[AnimatedModel] failed to load texture ${materialTexturePath}:`, err);
        if (!cancelled) setMaterialTexture(null);
      });

    return () => {
      cancelled = true;
    };
  }, [materialTexturePath]);

  useEffect(() => {
    if (state.status !== "ready") return;
    applyMaterialTexture(state.model.scene, materialTexture);
  }, [state, materialTexture]);

  const modelTransform = useMemo(() => {
    if (state.status !== "ready") {
      return {
        scale: config.scale,
        position: config.positionOffset,
      };
    }
    return computeModelTransform(state.model.scene, config);
  }, [state, config]);

  if (state.status !== "ready") {
    return (
      <group>
        <FallbackShape kind={config.fallback} color={fallbackColor} />
        {state.status === "error" && (
          <mesh position={[0, 2.1, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshBasicMaterial color="#ff6b6b" />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group
      ref={groupRef}
      scale={modelTransform.scale}
      rotation={config.rotation}
      position={modelTransform.position}
    >
      <primitive object={state.model.scene} />
    </group>
  );
}

const textureCache = new Map<string, Promise<Texture>>();

export function loadTexture(path: string) {
  const cached = textureCache.get(path);
  if (cached) return cached;

  const promise = new Promise<Texture>((resolve, reject) => {
    const loader = new TextureLoader();
    loader.load(
      publicAsset(path),
      (texture) => {
        texture.flipY = false;
        texture.colorSpace = SRGBColorSpace;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
  textureCache.set(path, promise);
  promise.catch(() => textureCache.delete(path));
  return promise;
}

export function applyMaterialTexture(scene: Group, texture: Texture | null) {
  scene.traverse((object: any) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const isolated = materials.map((material: any) => {
      const next = material.userData?.chromaIsolated ? material : material.clone();
      next.userData = { ...(next.userData ?? {}), chromaIsolated: true };
      if (!next.userData.baseMap) {
        next.userData.baseMap = next.map ?? null;
      }
      next.map = texture ?? next.userData.baseMap ?? null;
      if (next.color) {
        next.color.set(0xffffff);
      }
      next.needsUpdate = true;
      return next;
    });
    object.material = Array.isArray(object.material) ? isolated : isolated[0];
  });
}

function computeModelTransform(scene: Group, config: ModelAssetConfig) {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);

  const autoScale = config.autoFitHeight && size.y > 0 ? config.autoFitHeight / size.y : 1;
  const scale = config.scale * autoScale;
  const position: [number, number, number] = [
    config.positionOffset[0],
    config.positionOffset[1] - box.min.y * scale,
    config.positionOffset[2],
  ];

  return { scale, position };
}

function selectActionClip({
  action,
  externalClips,
  baseClips,
  animations,
  clipOverrides,
}: {
  action: ActionKey;
  externalClips: ExternalClipMap;
  baseClips: AnimationClip[];
  animations: ModelAssetConfig["animations"];
  clipOverrides?: Partial<Record<ActionKey, string>>;
}): { clip: AnimationClip; loopAction: ActionKey } | null {
  const direct =
    externalClips[action] ??
    pickClip(baseClips, action, clipOverrides?.[action] ?? animations[action]);
  if (direct) return { clip: direct, loopAction: action };

  const idle =
    externalClips.idle ??
    pickClip(baseClips, "idle", clipOverrides?.idle ?? animations.idle);
  if (idle) return { clip: idle, loopAction: "idle" };

  return null;
}

function pickClipFromSource(clips: AnimationClip[], src: AnimationSource, actionKey: string): AnimationClip | null {
  if (clips.length === 0) return null;
  if (src.clipName) {
    const exact = clips.find((c) => c.name === src.clipName);
    if (exact) return exact;
  }
  // fuzzy by action keyword
  const lower = actionKey.toLowerCase();
  const fuzzy = clips.find((c) => c.name.toLowerCase().includes(lower));
  if (fuzzy) return fuzzy;
  // fall back to index
  const idx = src.clipIndex ?? 0;
  return clips[idx] ?? clips[0];
}

function FallbackShape({ kind, color }: { kind: ModelAssetConfig["fallback"]; color: string }) {
  if (kind === "box") {
    return (
      <mesh castShadow position={[0, 0.9, 0]}>
        <boxGeometry args={[1, 1.8, 1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  if (kind === "sphere") {
    return (
      <mesh castShadow position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  }
  return (
    <mesh castShadow position={[0, 0.9, 0]}>
      <capsuleGeometry args={[0.45, 1.1, 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}
