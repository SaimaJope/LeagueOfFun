import type { AnimationClip } from "three";

export type ActionKey =
  | "idle"
  | "idle2"
  | "move"
  | "cast"
  | "hit"
  | "flash"
  | "recall"
  | "dance"
  | "death"
  | "pull1"
  | "pull2"
  | "dash"
  | "attack"
  | "attackToIdle"
  | "attackIntoRun";

const KEYWORDS: Record<ActionKey, string[]> = {
  idle: ["idle1", "idle"],
  idle2: ["idle2", "idle_2"],
  move: ["run", "walk", "move", "jog"],
  cast: ["cast", "spell", "hook", "_q", "ability"],
  hit: ["hit", "impact", "damage", "stun"],
  flash: ["flash", "blink", "teleport"],
  recall: ["recall", "back", "home"],
  dance: ["dance", "taunt", "emote"],
  death: ["death", "die", "ko"],
  pull1: ["pull1", "pull_1", "spell_pull1", "tug"],
  pull2: ["pull2", "pull_2", "spell_pull2", "tug"],
  dash: ["dash", "spell_dash", "leap"],
  attack: ["attack", "basic_attack"],
  attackToIdle: ["attack_to_idle", "attacktoidle"],
  attackIntoRun: ["attack_into_run", "attackintorun"],
};

/** Find the best clip match for an action, given user-mapped overrides and the model's clip list. */
export function pickClip(
  clips: AnimationClip[],
  action: ActionKey,
  overrideName?: string,
): AnimationClip | null {
  if (clips.length === 0) return null;
  if (overrideName) {
    const exact = clips.find((c) => c.name === overrideName);
    if (exact) return exact;
  }
  const kws = KEYWORDS[action];
  // exact (case-insensitive) keyword match first
  for (const kw of kws) {
    const m = clips.find((c) => c.name.toLowerCase() === kw);
    if (m) return m;
  }
  // substring match
  for (const kw of kws) {
    const m = clips.find((c) => c.name.toLowerCase().includes(kw));
    if (m) return m;
  }
  // fallback: first clip for idle only
  if (action === "idle") return clips[0];
  return null;
}

export function detectClipMap(clips: AnimationClip[]): Record<ActionKey, string | null> {
  return {
    idle: pickClip(clips, "idle")?.name ?? null,
    idle2: pickClip(clips, "idle2")?.name ?? null,
    move: pickClip(clips, "move")?.name ?? null,
    cast: pickClip(clips, "cast")?.name ?? null,
    hit: pickClip(clips, "hit")?.name ?? null,
    flash: pickClip(clips, "flash")?.name ?? null,
    recall: pickClip(clips, "recall")?.name ?? null,
    dance: pickClip(clips, "dance")?.name ?? null,
    death: pickClip(clips, "death")?.name ?? null,
    pull1: pickClip(clips, "pull1")?.name ?? null,
    pull2: pickClip(clips, "pull2")?.name ?? null,
    dash: pickClip(clips, "dash")?.name ?? null,
    attack: pickClip(clips, "attack")?.name ?? null,
    attackToIdle: pickClip(clips, "attackToIdle")?.name ?? null,
    attackIntoRun: pickClip(clips, "attackIntoRun")?.name ?? null,
  };
}
