import { useEffect, useMemo, useRef, useState } from "react";
import { Button, InlineLoading, InlineNotification } from "@carbon/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ActionLinkPreview, User } from "@/core/entities/auth.entity";
import type { ClassroomDetailDto } from "@/infrastructure/api/dto/classroom.dto";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useAuthLayoutMetadata } from "@/features/auth/contexts/AuthLayoutContext";
import { inspectActionLink, redeemActionLink } from "@/infrastructure/api/repositories/auth.repository";
import { mapClassroomDetailDto } from "@/infrastructure/mappers/classroom.mapper";
import { getAuthedLandingPath } from "@/features/auth/utils/onboarding";
import { PENDING_ACTIONS, storePendingAction, clearPendingAction } from "@/features/auth/pending-actions";

const ACTION_LINK_ACTION = PENDING_ACTIONS.find((a) => a.key === "action_link")!;

const purposeLabel = (purpose?: string) => {
  if (purpose === "teacher_activation") return "教師權限開通";
  if (purpose === "classroom_join") return "教室邀請";
  return "邀請連結";
};

const statusLabel = (status?: string) => {
  if (status === "pending") return "待處理";
  if (status === "consumed") return "已使用";
  if (status === "expired") return "已過期";
  if (status === "revoked") return "已停用";
  return "無法使用";
};

const isAuthRedeemResponse = (
  value: unknown,
): value is { success: true; data: { user: User }; message?: string } => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "success" in value &&
      (value as { success?: unknown }).success === true &&
      (value as { data?: { user?: User } }).data?.user,
  );
};

const InviteLinkScreen = () => {
  const navigate = useNavigate();
  const { token: rawToken } = useParams<{ token: string }>();
  const token = (rawToken || "").trim();
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<ActionLinkPreview | null>(null);
  const autoRedeemAttemptedRef = useRef(false);

  const metadata = useMemo(() => {
    if (!token) {
      return {
        title: "邀請連結無效",
        subtitle: "請確認你開啟的是完整的邀請網址。",
        backTo: "/login",
      };
    }
    if (success) {
      return {
        title: "邀請已完成",
        subtitle: success,
        backTo: "/dashboard",
      };
    }
    return {
      title: purposeLabel(preview?.purpose),
      subtitle: preview?.target?.name || "登入後即可完成此連結授權的操作。",
      backTo: user ? "/dashboard" : "/login",
    };
  }, [preview?.purpose, preview?.target?.name, success, token, user]);

  useAuthLayoutMetadata(metadata);

  useEffect(() => {
    if (!token) {
      clearPendingAction(ACTION_LINK_ACTION.storageKey);
      setLoading(false);
      setPreview(null);
      return;
    }
    storePendingAction(ACTION_LINK_ACTION.storageKey, token);

    let mounted = true;
    const loadPreview = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await inspectActionLink(token);
        if (!mounted) return;
        setPreview(response.data);
        if (response.data.status !== "pending") {
          clearPendingAction(ACTION_LINK_ACTION.storageKey);
        }
      } catch (err: any) {
        if (!mounted) return;
        setPreview(null);
        clearPendingAction(ACTION_LINK_ACTION.storageKey);
        setError(
          err?.message ||
            err?.response?.data?.error?.message ||
            "無法載入邀請連結資訊",
        );
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void loadPreview();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    if (!user && token && !loading && preview?.status === "pending") {
      navigate(`/login?action_link_token=${encodeURIComponent(token)}`, {
        replace: true,
      });
    }
  }, [navigate, preview?.status, token, user, loading]);

  const handleRedeem = async () => {
    if (!token || !preview) return;
    setRedeeming(true);
    setError("");
    try {
      const response = await redeemActionLink(token);
      clearPendingAction(ACTION_LINK_ACTION.storageKey);

      if (isAuthRedeemResponse(response)) {
        const nextUser = response.data.user;
        setUser(nextUser);
        localStorage.setItem("user", JSON.stringify(nextUser));
        window.dispatchEvent(new Event("storage"));
        setSuccess(response.message || "邀請已完成");
        window.location.href = getAuthedLandingPath(nextUser);
        return;
      }

      if (preview.purpose === "classroom_join") {
        const classroom = mapClassroomDetailDto(response as ClassroomDetailDto);
        navigate(`/classrooms/${classroom.id}`, { replace: true });
        return;
      }

      setSuccess("邀請已完成");
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      setError(
        err?.message ||
          err?.response?.data?.error?.message ||
          "邀請連結處理失敗",
      );
    } finally {
      setRedeeming(false);
    }
  };

  useEffect(() => {
    if (!user || !token || !preview || preview.status !== "pending" || !preview.can_redeem) {
      autoRedeemAttemptedRef.current = false;
      return;
    }
    if (autoRedeemAttemptedRef.current) return;
    autoRedeemAttemptedRef.current = true;
    void handleRedeem();
  }, [preview, token, user]);

  if (loading) {
    return (
      <div className="auth-form">
        <InlineLoading description="載入邀請連結資訊中..." />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="auth-form">
        <InlineNotification
          kind="error"
          title="連結無效"
          subtitle="缺少邀請 token，請重新開啟完整邀請連結。"
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
          title="無法處理邀請"
          subtitle={error}
          lowContrast
          hideCloseButton
        />
      ) : null}

      {success ? (
        <InlineNotification
          kind="success"
          title="完成"
          subtitle={success}
          lowContrast
          hideCloseButton
        />
      ) : null}

      {preview ? (
        <div className="auth-activation-summary">
          <div>
            <strong>類型</strong>
            <p>{purposeLabel(preview.purpose)}</p>
          </div>
          <div>
            <strong>狀態</strong>
            <p>{statusLabel(preview.status)}</p>
          </div>
          {preview.target ? (
            <div>
              <strong>目標</strong>
              <p>{preview.target.name}</p>
            </div>
          ) : null}
          {preview.expires_at ? (
            <div>
              <strong>有效期限</strong>
              <p>{new Date(preview.expires_at).toLocaleString("zh-TW")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!user && preview?.status === "pending" ? (
        <>
          <p className="auth-subnote">
            請先登入或註冊。完成後系統會回到此頁並執行邀請授權。
          </p>
          <div className="auth-actions auth-actions--stacked">
            <Button
              as={Link}
              to={`/login?action_link_token=${encodeURIComponent(token)}`}
              kind="primary"
            >
              前往登入
            </Button>
            <Button
              as={Link}
              to={`/register?action_link_token=${encodeURIComponent(token)}`}
              kind="secondary"
            >
              先註冊
            </Button>
          </div>
        </>
      ) : null}

      {user && preview?.status === "pending" && redeeming ? (
        <InlineLoading description="處理邀請連結中..." />
      ) : null}

      {user && preview?.status === "pending" && preview.can_redeem && !redeeming ? (
        <>
          <p className="auth-subnote">
            目前登入帳號可以使用這個邀請連結。若沒有自動完成，可手動重試。
          </p>
          <div className="auth-actions">
            <Button kind="primary" onClick={handleRedeem}>
              重新嘗試
            </Button>
          </div>
        </>
      ) : null}

      {preview?.status === "consumed" ? (
        <p className="auth-subnote">這個邀請連結已經使用過。</p>
      ) : null}

      {preview?.status === "expired" ? (
        <p className="auth-subnote">這個邀請連結已過期，請重新取得新的邀請連結。</p>
      ) : null}

      {preview?.status === "revoked" ? (
        <p className="auth-subnote">這個邀請連結已停用。</p>
      ) : null}
    </div>
  );
};

export default InviteLinkScreen;
