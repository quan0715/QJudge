import React, { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button, InlineNotification, Theme } from "@carbon/react";
import { Renew, Home, Warning } from "@carbon/icons-react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 通用 Error Boundary（Gate 1 / shared-ui）
 * - 預設提供簡易錯誤介面，可注入 fallback 取代
 * - onError 可串接外部追蹤（Sentry 等）
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = "/";
  };

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Theme theme="white">
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
                maxWidth: "600px",
                width: "100%",
                textAlign: "center",
              }}
            >
              <Warning
                size={64}
                style={{
                  color: "var(--cds-support-error)",
                  marginBottom: "1rem",
                }}
              />

              <h1
                style={{
                  fontSize: "1.75rem",
                  fontWeight: "600",
                  marginBottom: "1rem",
                  color: "var(--cds-text-primary)",
                }}
              >
                Oops! 發生錯誤
              </h1>

              <p
                style={{
                  fontSize: "1rem",
                  marginBottom: "1.5rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                很抱歉，應用程式遇到了意外錯誤。請嘗試重新整理頁面或返回首頁。
              </p>

              <InlineNotification
                kind="error"
                title="錯誤詳情"
                subtitle={this.state.error?.message || "未知錯誤"}
                hideCloseButton
                style={{ marginBottom: "1.5rem", textAlign: "left" }}
              />

              {import.meta.env.DEV && this.state.errorInfo && (
                <details
                  style={{
                    marginBottom: "1.5rem",
                    textAlign: "left",
                    padding: "1rem",
                    backgroundColor: "var(--cds-layer-01)",
                    borderRadius: "4px",
                    border: "1px solid var(--cds-border-subtle)",
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      fontWeight: "500",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Stack Trace (Development Only)
                  </summary>
                  <pre
                    style={{
                      fontSize: "0.75rem",
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "var(--cds-code-font-family, monospace)",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Button kind="primary" renderIcon={Renew} onClick={this.handleReload}>
                  重新整理
                </Button>

                <Button kind="secondary" renderIcon={Home} onClick={this.handleGoHome}>
                  返回首頁
                </Button>

                <Button kind="ghost" onClick={this.handleReset}>
                  清除錯誤
                </Button>
              </div>
            </div>
          </div>
        </Theme>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;

export const withErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
): React.FC<P> => {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `WithErrorBoundary(${
    WrappedComponent.displayName || WrappedComponent.name || "Component"
  })`;

  return WithErrorBoundary;
};
