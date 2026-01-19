import { Button, Theme } from "@carbon/react";
import { Home, ArrowLeft } from "@carbon/icons-react";
import type { FC } from "react";

export interface NotFoundProps {
  title?: string;
  description?: string;
  theme?: "white" | "g10" | "g90" | "g100";
  onBack?: () => void;
  onHome?: () => void;
  backLabel?: string;
  homeLabel?: string;
}

/**
 * 404 Not Found 通用版組件（Gate 1/Shared）
 * - 提供返回上一頁 / 返回首頁行為，外部注入 handler
 * - 不綁定路由，方便在不同頁面重用
 */
export const NotFound: FC<NotFoundProps> = ({
  title = "頁面不存在",
  description = "您要找的頁面可能已被移除、名稱已更改，或是暫時無法使用。",
  theme = "white",
  onBack,
  onHome,
  backLabel = "上一頁",
  homeLabel = "返回首頁",
}) => {
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
              color: theme === "g100" ? "#6366f1" : "#0f62fe",
              fontFamily: "var(--cds-code-font-family, monospace)",
              letterSpacing: "-0.05em",
            }}
          >
            404
          </div>

          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background:
                theme === "g100"
                  ? "rgba(99, 102, 241, 0.15)"
                  : "rgba(15, 98, 254, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
            }}
          >
            <span style={{ fontSize: "2.5rem" }}>🔍</span>
          </div>

          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 600,
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              fontSize: "1rem",
              marginBottom: "2.5rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            {description}
          </p>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Button
              kind="primary"
              size="lg"
              renderIcon={Home}
              onClick={onHome}
            >
              {homeLabel}
            </Button>

            <Button
              kind="tertiary"
              size="lg"
              renderIcon={ArrowLeft}
              onClick={onBack}
            >
              {backLabel}
            </Button>
          </div>
        </div>
      </div>
    </Theme>
  );
};

export default NotFound;
