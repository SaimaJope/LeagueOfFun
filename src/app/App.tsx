import { Scene } from "@/game/core/Scene";
import { DodgeballScene } from "@/game/core/DodgeballScene";
import { HUD } from "@/game/ui/HUD";
import { DodgeballHUD } from "@/game/ui/DodgeballHUD";
import { FlashScreenOverlay } from "@/game/ui/FlashScreenOverlay";
import { AssetManager } from "@/game/ui/AssetManager";
import { Settings } from "@/game/ui/Settings";
import { AnalysisPanel } from "@/game/ui/AnalysisPanel";
import { ModeBar } from "@/game/ui/ModeBar";
import { FinalScore } from "@/game/ui/FinalScore";
import { ChromaMenu } from "@/game/ui/ChromaMenu";
import { TrainerSwitcher } from "@/game/ui/TrainerSwitcher";
import { useTrainerStore } from "@/stores/trainerStore";

export function App() {
  const trainer = useTrainerStore((s) => s.trainer);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {trainer === "hookTrainer" ? <Scene /> : <DodgeballScene />}
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
      <ChromaMenu />
    </div>
  );
}
