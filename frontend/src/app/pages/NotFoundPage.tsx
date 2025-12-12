import { Button, Theme } from "@carbon/react";
import { Home, ArrowLeft } from "@carbon/icons-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/ui/theme/ThemeContext";

/**
 * 404 Not Found Page
 * Displayed when user navigates to a non-existent route
 */
const NotFoundPage = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/dashboard");
    }
  };

  const handleGoHome = () => {
    navigate("/dashboard");
  };

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
          {/* 404 Title */}
          <div
            style={{
              fontSize: "10rem",
              fontWeight: "800",
              lineHeight: 1,
              marginBottom: "2rem",
              color: theme === "g100" ? "#6366f1" : "#0f62fe",
              fontFamily: "var(--cds-code-font-family, monospace)",
              letterSpacing: "-0.05em",
            }}
          >
            404
          </div>

          {/* Icon */}
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
              fontWeight: "600",
              marginBottom: "0.75rem",
              color: "var(--cds-text-primary)",
            }}
          >
            頁面不存在
          </h1>

          <p
            style={{
              fontSize: "1rem",
              marginBottom: "2.5rem",
              color: "var(--cds-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            您要找的頁面可能已被移除、名稱已更改，
            <br />
            或是暫時無法使用。
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
              onClick={handleGoHome}
            >
              返回首頁
            </Button>

            <Button
              kind="tertiary"
              size="lg"
              renderIcon={ArrowLeft}
              onClick={handleGoBack}
            >
              上一頁
            </Button>
          </div>
        </div>
      </div>
    </Theme>
  );
};

export default NotFoundPage;
