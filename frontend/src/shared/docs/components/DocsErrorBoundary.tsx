import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, InlineNotification, Theme } from "@carbon/react";
import { Home, Renew, Warning } from "@carbon/icons-react";
import styles from "./DocsErrorBoundary.module.scss";

export interface DocsErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  homeHref?: string;
}

interface DocsErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class DocsErrorBoundary extends Component<
  DocsErrorBoundaryProps,
  DocsErrorBoundaryState
> {
  constructor(props: DocsErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): DocsErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("DocsErrorBoundary caught an error:", error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.href = this.props.homeHref || "/";
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Theme theme="white">
          <div className={styles.root}>
            <div className={styles.card}>
              <Warning size={56} className={styles.warningIcon} />
              <h1 className={styles.heading}>Something went wrong</h1>
              <InlineNotification
                kind="error"
                title="Error"
                subtitle={
                  this.state.error?.message || "Unexpected documentation error"
                }
                hideCloseButton
                className={styles.notification}
              />
              <div className={styles.actions}>
                <Button kind="primary" renderIcon={Renew} onClick={this.handleReload}>
                  Reload
                </Button>
                <Button kind="secondary" renderIcon={Home} onClick={this.handleGoHome}>
                  Home
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

export default DocsErrorBoundary;
