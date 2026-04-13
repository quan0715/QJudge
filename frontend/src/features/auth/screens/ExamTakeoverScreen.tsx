import { useState, useEffect, useRef } from "react";
import { Button, InlineLoading } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { resolveLoginConflict } from "@/infrastructure/api/repositories/auth.repository";
import {
  PENDING_ACTIONS,
  getPendingAction,
  clearPendingAction,
} from "@/features/auth/pending-actions";
import { useAuthLayoutMetadata } from "../contexts/AuthLayoutContext";

const TAKEOVER_ACTION = PENDING_ACTIONS.find((a) => a.key === "exam_takeover")!;

const TAKEOVER_STEPS = [
  "auth.takeover.stepInvalidate",
  "auth.takeover.stepRegister",
  "auth.takeover.stepRedirect",
] as const;

const STEP_INTERVAL_MS = 1200;

const ExamTakeoverScreen = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectingRef = useRef(false);
  const [conflictToken] = useState(() => getPendingAction(TAKEOVER_ACTION.storageKey));

  useAuthLayoutMetadata({
    title: t("auth.pendingAction.examTakeoverTitle"),
    subtitle: error || t("auth.pendingAction.examTakeoverSubtitle"),
  });

  useEffect(() => {
    if (!conflictToken && !redirectingRef.current) {
      window.location.href = "/login";
    }
  }, [conflictToken]);

  useEffect(() => {
    if (!loading) return;
    setStepIndex(0);
    stepTimerRef.current = setInterval(() => {
      setStepIndex((prev) =>
        prev < TAKEOVER_STEPS.length - 1 ? prev + 1 : prev
      );
    }, STEP_INTERVAL_MS);
    return () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); };
  }, [loading]);

  const handleTakeover = async () => {
    if (!conflictToken || redirectingRef.current) return;
    setLoading(true);
    setError("");
    try {
      const response = await resolveLoginConflict(conflictToken);
      if (response.success) {
        redirectingRef.current = true;
        const { active_exam, ...safeData } = response.data;
        localStorage.setItem("user", JSON.stringify(safeData.user));
        clearPendingAction(TAKEOVER_ACTION.storageKey);
        if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        setStepIndex(TAKEOVER_STEPS.length - 1);
        await new Promise((r) => setTimeout(r, 800));
        window.location.href = active_exam?.resume_path || "/dashboard";
        return;
      }
      setError(t("auth.callback.takeoverFailed", "接管失敗，請重新登入後再試。"));
    } catch {
      clearPendingAction(TAKEOVER_ACTION.storageKey);
      setError(t("auth.callback.takeoverExpired", "接管憑證已過期，請重新登入。"));
    } finally {
      if (!redirectingRef.current) {
        if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        setLoading(false);
      }
    }
  };

  if (!conflictToken && !redirectingRef.current) return null;

  return (
    <div className="auth-form">
      {error ? (
        <Button
          kind="secondary"
          className="auth-submit-btn"
          onClick={() => {
            clearPendingAction(TAKEOVER_ACTION.storageKey);
            window.location.href = "/login";
          }}
          renderIcon={ArrowRight}
        >
          {t("auth.campusSso.backToLogin", "返回登入")}
        </Button>
      ) : loading ? (
        <InlineLoading description={t(TAKEOVER_STEPS[stepIndex])} />
      ) : (
        <Button
          kind="danger"
          className="auth-submit-btn"
          onClick={handleTakeover}
          renderIcon={ArrowRight}
          data-testid="auth-exam-takeover-btn"
        >
          {t("auth.callback.takeover", "接管並恢復考試")}
        </Button>
      )}
    </div>
  );
};

export default ExamTakeoverScreen;
