import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loading, Tile, Button } from "@carbon/react";
import { ErrorFilled } from "@carbon/icons-react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { PENDING_ACTIONS, storePendingAction, clearPendingAction } from "@/features/auth/pending-actions";
import { joinClassroom } from "@/infrastructure/api/repositories/classroom.repository";

const CJ = PENDING_ACTIONS.find((a) => a.key === "classroom_join")!;

const ClassroomJoinScreen = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("classroom");
  const { user, loading: authLoading } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!code) {
      setError(t("joinLink.invalidLink"));
      setJoining(false);
      return;
    }

    // Not authenticated — store code and redirect to login
    if (!user) {
      storePendingAction(CJ.storageKey, code);
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;

    const doJoin = async () => {
      try {
        const classroom = await joinClassroom(code);
        // Clear the stored code only after successful join
        clearPendingAction(CJ.storageKey);
        if (!cancelled) {
          navigate(`/classrooms/${classroom.id}`, { replace: true });
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || t("joinLink.joinFailed"));
          setJoining(false);
        }
      }
    };

    void doJoin();
    return () => {
      cancelled = true;
    };
  }, [code, user, authLoading, navigate, t]);

  if (authLoading || joining) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "1rem" }}>
        <Loading withOverlay={false} description={t("joinLink.joining")} />
        <p>{t("joinLink.joining")}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem" }}>
      <Tile style={{ maxWidth: "480px", textAlign: "center", padding: "2rem" }}>
        <ErrorFilled size={48} style={{ color: "var(--cds-support-error)", marginBottom: "1rem" }} />
        <h3 style={{ marginBottom: "0.5rem" }}>{t("joinLink.errorTitle")}</h3>
        <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>{error}</p>
        <Button kind="primary" onClick={() => navigate("/dashboard", { replace: true })}>
          {t("joinLink.backToDashboard")}
        </Button>
      </Tile>
    </div>
  );
};

export default ClassroomJoinScreen;
