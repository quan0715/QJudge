import { Button, Theme } from "@carbon/react";
import { Renew, Home } from "@carbon/icons-react";
import type { FC } from "react";

export interface ServerErrorProps {
  statusCode?: number;
  message?: string;
  timestamp?: string;
  theme?: "white" | "g10" | "g90" | "g100";
  onRetry?: () => void;
  onHome?: () => void;
}

const getStatusMessage = (code: number): string => {
  switch (code) {
    case 500:
      return "內部伺服器錯誤";
    case 502:
      return "閘道錯誤";
    case 503:
      return "服務暫時無法使用";
    case 504:
      return "閘道逾時";
    default:
      return "伺服器錯誤";
  }
};

/**
 * 5xx Server Error 通用版組件（Gate 1/Shared）
 * - 提供重新整理 / 返回首頁行為，外部注入 handler
 * - 不綁定路由，方便在不同頁面重用
 */
export const ServerError: FC<ServerErrorProps> = ({
  statusCode = 500,
  message,
  timestamp,
  theme = "white",
  onRetry,
  onHome,
}) => {
  const displayMessage = message || getStatusMessage(statusCode);

  return (
    <Theme theme={theme}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          backgroundColor: "var(--cds-background)",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "10rem",
              fontWeight: 800,
              lineHeight: 1,
              marginBottom: "2rem",
              color: theme === "g100" ? "#ef4444" : "#dc2626",
              fontFamily: "var(--cds-code-font-family, monospace)",
              letterSpacing: "-0.05em",
            }}
          >
            {statusCode}
          </div>

          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background:
                theme === "g100"
                  ? "rgba(239, 68, 68, 0.15)"
                  : "rgba(220, 38, 38, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <span style={{ fontSize: "2.5rem" }}>⚡</span>
          </div>

          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {displayMessage}
          </h1>

          <p
            style={{
              fontSize: "1rem",
              marginBottom: "2.5rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            伺服器暫時無法處理您的請求，請稍後再試或聯繫系統管理員。
          </p>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Button kind="primary" size="lg" renderIcon={Renew} onClick={onRetry}>
              重新整理
            </Button>

            <Button kind="tertiary" size="lg" renderIcon={Home} onClick={onHome}>
              返回首頁
            </Button>
          </div>

          {timestamp && (
            <p
              style={{
                marginTop: "2rem",
                fontSize: "0.75rem",
                color: "var(--cds-text-helper)",
                fontFamily: "var(--cds-code-font-family, monospace)",
              }}
            >
              錯誤時間：{timestamp}
            </p>
          )}
        </div>
      </div>
    </Theme>
  );
};

export default ServerError;
