import { useEffect } from "react";
import { recordExamEvent } from "@/infrastructure/api/repositories/exam.repository";

export function usePaperExamAntiCheat({
  contestId,
  isInProgress,
}: {
  contestId: string | undefined;
  isInProgress: boolean;
}) {
  useEffect(() => {
    if (!contestId || !isInProgress) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        recordExamEvent(contestId, "tab_hidden").catch(() => {});
      }
    };
    const onBlur = () => {
      recordExamEvent(contestId, "window_blur").catch(() => {});
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        recordExamEvent(contestId, "exit_fullscreen").catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [contestId, isInProgress]);
}
