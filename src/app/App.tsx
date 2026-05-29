import { Scene } from "@/game/core/Scene";
import { DodgeballScene } from "@/game/core/DodgeballScene";
import { PvpScene } from "@/game/core/PvpScene";
import { HUD } from "@/game/ui/HUD";
import { DodgeballHUD } from "@/game/ui/DodgeballHUD";
import { FlashScreenOverlay } from "@/game/ui/FlashScreenOverlay";
import { PvpLobby } from "@/game/ui/PvpLobby";
import { PvpHud } from "@/game/ui/PvpHud";
import { PvpShop } from "@/game/ui/PvpShop";
import { PvpCountdown } from "@/game/ui/PvpCountdown";
import { DamageIndicator } from "@/game/ui/DamageIndicator";
import { DeathFilter } from "@/game/ui/DeathFilter";
import { PvpMatchController } from "@/game/network/PvpMatchController";
import { FlashScreenOverlay as PvpFlashScreenOverlay } from "@/game/ui/FlashScreenOverlay";
import { AssetManager } from "@/game/ui/AssetManager";
import { Settings } from "@/game/ui/Settings";
import { AnalysisPanel } from "@/game/ui/AnalysisPanel";
import { ModeBar } from "@/game/ui/ModeBar";
import { FinalScore } from "@/game/ui/FinalScore";
import { ChromaMenu } from "@/game/ui/ChromaMenu";
import { TrainerSwitcher } from "@/game/ui/TrainerSwitcher";
import { VolumeSlider } from "@/game/ui/VolumeSlider";
import { LoadingScreen } from "@/game/ui/LoadingScreen";
import { FpsCounter } from "@/game/ui/FpsCounter";
import { useTrainerStore } from "@/stores/trainerStore";
import { useEffect, useRef } from "react";
import { joinMatch } from "@/game/network/peerNetwork";
import { usePvpStore } from "@/stores/pvpStore";
import { publicAsset } from "@/game/assets/publicPath";
import { playUiClick } from "@/game/audio/uiSounds";

export function App() {
  const trainer = useTrainerStore((s) => s.trainer);
  const setTrainer = useTrainerStore((s) => s.setTrainer);
  const autoJoinedRef = useRef(false);

  useEffect(() => {
    const cursorUrl = publicAsset("assets/cursor.png");
    const root = document.documentElement;

    root.style.setProperty("--app-cursor", `url("${cursorUrl}") 3 1, auto`);
    root.style.setProperty("--app-cursor-pointer", `url("${cursorUrl}") 3 1, pointer`);

    return () => {
      root.style.removeProperty("--app-cursor");
      root.style.removeProperty("--app-cursor-pointer");
    };
  }, []);

  // Shareable invite links: opening "…/?join=CODE" drops the friend straight
  // into PvP and auto-connects to the host's room, no code typing required.
  useEffect(() => {
    if (autoJoinedRef.current) return;
    let code = "";
    try {
      code = (new URLSearchParams(window.location.search).get("join") ?? "").trim();
    } catch {
      /* ignore */
    }
    if (!code) return;
    autoJoinedRef.current = true;
    setTrainer("pvp");
    // Strip the param so a later refresh doesn't silently re-dial a dead room.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("join");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
    if (usePvpStore.getState().role === "none") joinMatch(code);
  }, [setTrainer]);

  // Play a click sound on any menu button press (movement uses right-click on
  // the canvas, which isn't a <button>, so it's naturally excluded). Buttons
  // that play their own sound opt out via [data-no-click-sound].
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("button");
      if (!btn || btn.disabled || btn.closest("[data-no-click-sound]")) return;
      playUiClick();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      {trainer === "hookTrainer" && <Scene />}
      {trainer === "dodgeball" && <DodgeballScene />}
      {trainer === "pvp" && <PvpScene />}
      <TrainerSwitcher />
      {trainer === "hookTrainer" && (
        <>
          <HUD />
          <ModeBar />
          <AnalysisPanel />
          <FinalScore />
          <AssetManager />
          <Settings />
        </>
      )}
      {trainer === "dodgeball" && (
        <>
          <DodgeballHUD />
          <FlashScreenOverlay />
        </>
      )}
      {trainer === "pvp" && (
        <>
          <PvpMatchController />
          <DeathFilter />
          <DamageIndicator />
          <PvpLobby />
          <PvpCountdown />
          <PvpShop />
          <PvpHud />
          <PvpFlashScreenOverlay />
        </>
      )}
      <ChromaMenu />
      <VolumeSlider />
      <FpsCounter />
      <LoadingScreen />
    </div>
  );
}
