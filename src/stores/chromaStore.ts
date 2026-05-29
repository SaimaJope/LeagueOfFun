import { create } from "zustand";

export interface ChromaPreset {
  id: string;
  name: string;
  texturePath: string | null;
  target: "thresh" | "mundo";
  /** Emissive color of the hook + chain when this chroma is selected. */
  hookGlow: string;
}

export const CHROMAS: ChromaPreset[] = [
  { id: "default", name: "Default", texturePath: "/assets/chromas/Default.png", target: "thresh", hookGlow: "#52ff9a" },
  { id: "classic", name: "Classic", texturePath: "/assets/chromas/classic.png", target: "thresh", hookGlow: "#52ff9a" },
  { id: "cute", name: "Cute", texturePath: "/assets/chromas/cute.png", target: "thresh", hookGlow: "#52ff9a" },
  { id: "ice", name: "Ice", texturePath: "/assets/chromas/ice.png", target: "thresh", hookGlow: "#8ad9ff" },
  { id: "purple", name: "Purple", texturePath: "/assets/chromas/purple.png", target: "thresh", hookGlow: "#b985ff" },
  { id: "mundo_default", name: "Default", texturePath: null, target: "mundo", hookGlow: "#52ff9a" },
  { id: "hulk_green", name: "Hulk Green", texturePath: "/assets/chromas/Hulk_green.png", target: "mundo", hookGlow: "#6cff63" },
  { id: "hulk_red", name: "Hulk Red", texturePath: "/assets/chromas/Hulk_red.png", target: "mundo", hookGlow: "#ff5f5f" },
  { id: "mundo_basketball", name: "Basketball", texturePath: "/assets/chromas/mundo_basketball.png", target: "mundo", hookGlow: "#ff9f2f" },
  { id: "mundo_mspaint", name: "MS Paint", texturePath: "/assets/chromas/mundo_mspaint.png", target: "mundo", hookGlow: "#b985ff" },
];

interface ChromaState {
  open: boolean;
  selectedId: string;
  toggleOpen: () => void;
  close: () => void;
  setChroma: (id: string) => void;
}

export const useChromaStore = create<ChromaState>((set) => ({
  open: false,
  selectedId: "default",
  toggleOpen: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
  setChroma: (id) => set({ selectedId: id }),
}));

export function chromasForTarget(target: ChromaPreset["target"]) {
  return CHROMAS.filter((chroma) => chroma.target === target);
}

export function selectedChromaTexturePath(id: string, target: ChromaPreset["target"] = "thresh") {
  const targetChromas = chromasForTarget(target);
  return targetChromas.find((chroma) => chroma.id === id)?.texturePath ?? targetChromas[0]?.texturePath ?? null;
}

export function selectedChromaHookGlow(id: string, target: ChromaPreset["target"] = "thresh") {
  const targetChromas = chromasForTarget(target);
  return targetChromas.find((chroma) => chroma.id === id)?.hookGlow ?? targetChromas[0]?.hookGlow ?? "#52ff9a";
}
