import { useEffect, useMemo, useState } from "react";
import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { TeacherActivationPreview, User } from "@/core/entities/auth.entity";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useAuthLayoutMetadata } from "@/features/auth/contexts/AuthLayoutContext";
import {
  consumeTeacherActivationInvite,
  previewTeacherActivationInvite,
} from "@/infrastructure/api/repositories/auth.repository";
import {
  clearPendingTeacherActivationToken,
  getAuthedLandingPath,
  storePendingTeacherActivationToken,
} from "@/features/auth/utils/onboarding";

const TeacherActivationScreen = () => {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") || "").trim();
  const [loading, setLoading] = useState(true);
  const [consuming, setConsuming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<TeacherActivationPreview | null>(null);

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
      subtitle: "使用邀請信中的同一個 Email 登入後，即可完成開通。",
      backTo: user ? "/dashboard" : "/login",
    };
  }, [success, token, user]);

  useAuthLayoutMetadata(metadata);

  useEffect(() => {
    if (!token) {
      clearPendingTeacherActivationToken();
      setLoading(false);
      setPreview(null);
      return;
    }
    storePendingTeacherActivationToken(token);

    let mounted = true;
    const loadPreview = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await previewTeacherActivationInvite(token);
        if (!mounted) return;
        setPreview(response.data);
        if (response.data.status !== "pending") {
          clearPendingTeacherActivationToken();
        }
      } catch (err: any) {
        if (!mounted) return;
        clearPendingTeacherActivationToken();
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

  const handleConsume = async () => {
    if (!token) return;
    setConsuming(true);
    setError("");
    try {
      const response = await consumeTeacherActivationInvite(token);
      const nextUser: User = response.data.user;
      clearPendingTeacherActivationToken();
      setUser(nextUser);
      localStorage.setItem("user", JSON.stringify(nextUser));
      window.dispatchEvent(new Event("storage"));
      setSuccess(response.message || "教師權限已開通");
      navigate(getAuthedLandingPath(nextUser), { replace: true });
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

  const handleSwitchAccount = async () => {
    clearPendingTeacherActivationToken();
    if (token) {
      storePendingTeacherActivationToken(token);
    }
    await logout();
    navigate("/login", { replace: true });
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
            <strong>邀請 Email</strong>
            <p>{preview.email}</p>
          </div>
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
            先使用邀請信中的 Email 登入或註冊，登入後會自動回到這個開通頁面。
          </p>
          <div className="auth-actions auth-actions--stacked">
            <Button as={Link} to="/login" kind="primary">
              前往登入
            </Button>
            <Button as={Link} to="/register" kind="secondary">
              先註冊再開通
            </Button>
          </div>
        </>
      ) : null}

      {user && preview?.status === "pending" && !preview.email_matches_current_user ? (
        <>
          <InlineNotification
            kind="warning"
            title="帳號不符"
            subtitle={`目前登入的是 ${preview.current_user_email || "未知帳號"}，請改用 ${preview.email} 登入。`}
            lowContrast
            hideCloseButton
          />
          <div className="auth-actions">
            <Button kind="secondary" onClick={handleSwitchAccount}>
              切換帳號
            </Button>
          </div>
        </>
      ) : null}

      {user && preview?.status === "pending" && preview.can_consume ? (
        <>
          <p className="auth-subnote">
            目前登入帳號符合邀請 Email。按下方按鈕後，這個帳號會升級為 teacher。
          </p>
          <div className="auth-actions">
            {consuming ? (
              <InlineLoading description="開通教師權限中..." />
            ) : (
              <Button kind="primary" onClick={handleConsume}>
                開通教師權限
              </Button>
            )}
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
