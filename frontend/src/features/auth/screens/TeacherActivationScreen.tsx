import { useEffect, useMemo, useRef, useState } from "react";
import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { TeacherActivationPreview, User } from "@/core/entities/auth.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useAuthLayoutMetadata } from "@/features/auth/contexts/AuthLayoutContext";
import {
  consumeTeacherActivationInvite,
  previewTeacherActivationInvite,
} from "@/infrastructure/api/repositories/auth.repository";
import { getAuthedLandingPath } from "@/features/auth/utils/onboarding";
import { PENDING_ACTIONS, storePendingAction, clearPendingAction } from "@/features/auth/pending-actions";

const TA = PENDING_ACTIONS.find((a) => a.key === "teacher_activation")!;

const TeacherActivationScreen = () => {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [loading, setLoading] = useState(true);
  const [consuming, setConsuming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<TeacherActivationPreview | null>(null);
  const autoConsumeAttemptedRef = useRef(false);

  const metadata = useMemo(() => {
    if (!token) {
      return {
        title: "教師開通連結無效",
        subtitle: "請確認你開啟的是完整的邀請網址。",
        backTo: "/login",
      };
    }
    if (success) {
      return {
        title: "教師權限已開通",
        subtitle: success,
        backTo: "/dashboard",
      };
    }
    return {
      title: "教師權限開通",
      subtitle: "透過此連結登入或註冊後，即可完成 teacher 開通。",
      backTo: user ? "/dashboard" : "/login",
    };
  }, [success, token, user]);

  useAuthLayoutMetadata(metadata);

  useEffect(() => {
    if (!token) {
      clearPendingAction(TA.storageKey);
      setLoading(false);
      setPreview(null);
      return;
    }
    storePendingAction(TA.storageKey, token);

    let mounted = true;
    const loadPreview = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await previewTeacherActivationInvite(token);
        if (!mounted) return;
        setPreview(response.data);
        if (response.data.status !== "pending") {
          clearPendingAction(TA.storageKey);
        }
      } catch (err: any) {
        if (!mounted) return;
        // Do NOT clear the pending action here — the token may still be valid.
        // It is only cleared when preview returns a non-pending status (expired/consumed)
        // or after successful consume.
        setPreview(null);
        setError(
          err?.message ||
            err?.response?.data?.error?.message ||
            "無法載入教師開通資訊"
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPreview();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!user && token && !loading && (preview?.status === "pending" || (!preview && error))) {
      navigate(`/login?teacher_activation_token=${encodeURIComponent(token)}`, {
        replace: true,
      });
    }
  }, [navigate, preview?.status, token, user, loading, preview, error]);

  useEffect(() => {
    if (!user || !token || !preview || preview.status !== "pending" || !preview.can_consume) {
      autoConsumeAttemptedRef.current = false;
      return;
    }
    if (autoConsumeAttemptedRef.current) return;
    autoConsumeAttemptedRef.current = true;
    void handleConsume();
  }, [preview, token, user]);

  const handleConsume = async () => {
    if (!token) return;
    setConsuming(true);
    setError("");
    try {
      const response = await consumeTeacherActivationInvite(token);
      const nextUser: User = response.data.user;
      clearPendingAction(TA.storageKey);
      setUser(nextUser);
      localStorage.setItem("user", JSON.stringify(nextUser));
      window.dispatchEvent(new Event("storage"));
      setSuccess(response.message || "教師權限已開通");
      window.location.href = getAuthedLandingPath(nextUser);
    } catch (err: any) {
      setError(
        err?.message ||
          err?.response?.data?.error?.message ||
          "教師權限開通失敗"
      );
    } finally {
      setConsuming(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-form">
        <InlineLoading description="載入教師開通資訊中..." />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="auth-form">
        <InlineNotification
          kind="error"
          title="連結無效"
          subtitle="缺少教師開通 token，請從邀請信重新開啟連結。"
          lowContrast
          hideCloseButton
        />
      </div>
    );
  }

  if (!user && preview?.status === "pending") {
    return (
      <div className="auth-form">
        <InlineLoading description="跳轉至登入頁..." />
      </div>
    );
  }

  return (
    <div className="auth-form">
      {error ? (
        <InlineNotification
          kind="error"
          title="無法開通教師權限"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      ) : null}

      {success ? (
        <InlineNotification
          kind="success"
          title="開通完成"
          subtitle={success}
          lowContrast
          hideCloseButton
        />
      ) : null}

      {preview ? (
        <div className="auth-activation-summary">
          <div>
            <strong>有效期限</strong>
            <p>{new Date(preview.expires_at).toLocaleString("zh-TW")}</p>
          </div>
          <div>
            <strong>狀態</strong>
            <p>
              {preview.status === "pending"
                ? "待開通"
                : preview.status === "consumed"
                ? "已使用"
                : "已過期"}
            </p>
          </div>
        </div>
      ) : null}

      {!user && preview?.status === "pending" ? (
        <>
          <p className="auth-subnote">
            先透過此連結登入或註冊。登入完成後會自動回到這個頁面並完成 teacher 開通。
          </p>
          <div className="auth-actions auth-actions--stacked">
            <Button
              as={Link}
              to={`/login?teacher_activation_token=${encodeURIComponent(token)}`}
              kind="primary"
            >
              前往登入
            </Button>
            <Button
              as={Link}
              to={`/register?teacher_activation_token=${encodeURIComponent(token)}`}
              kind="secondary"
            >
              先註冊再開通
            </Button>
          </div>
        </>
      ) : null}

      {user && preview?.status === "pending" && consuming ? (
        <>
          <InlineLoading description="開通教師權限中..." />
        </>
      ) : null}

      {user && preview?.status === "pending" && preview.can_consume && !consuming ? (
        <>
          <p className="auth-subnote">
            目前登入帳號可以使用這個一次性開通連結。若沒有自動完成，可手動重試。
          </p>
          <div className="auth-actions">
            <Button kind="primary" onClick={handleConsume}>
              重新嘗試開通
            </Button>
          </div>
        </>
      ) : null}

      {preview?.status === "consumed" ? (
        <p className="auth-subnote">這個邀請連結已經使用過，若還需要教師權限請請管理員重新發送。</p>
      ) : null}

      {preview?.status === "expired" ? (
        <p className="auth-subnote">這個邀請連結已過期，請請管理員重新發送新的開通連結。</p>
      ) : null}
    </div>
  );
};

export default TeacherActivationScreen;
