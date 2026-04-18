import { useState } from "react";
import { Button, InlineLoading, Tag } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
import { getHITLRenderer } from "./hitlRendererRegistry";
import styles from "./HITLCard.module.scss";

interface HITLCardProps {
  request: ApprovalRequest;
  onDecision: (decision: "approve" | "reject") => void;
}

// Pretty JSON fallback with basic syntax colouring
function PrettyJsonFallback({ args }: { args: Record<string, unknown> }) {
  const lines = JSON.stringify(args, null, 2).split("\n");
  return (
    <pre className={styles.jsonFallback}>
      {lines.map((line, i) => {
        // colour keys differently from values
        const keyMatch = line.match(/^(\s*)("[\w-]+")\s*:/);
        if (keyMatch) {
          const [, indent, key] = keyMatch;
          const rest = line.slice(indent.length + key.length);
          return (
            <span key={i}>
              {indent}
              <span className={styles.jsonKey}>{key}</span>
              {rest}
              {"\n"}
            </span>
          );
        }
        return <span key={i}>{line}{"\n"}</span>;
      })}
    </pre>
  );
}

function ActionItem({ name, args }: { name: string; args?: Record<string, unknown> }) {
  const actionArg = typeof args?.action === "string" ? args.action : undefined;
  const renderer = getHITLRenderer(name, actionArg);
  const safeArgs = args ?? {};

  return (
    <div className={styles.actionItem}>
      <div className={styles.actionHeader}>
        <span className={styles.toolName}>{name}</span>
        {actionArg && (
          <Tag type="blue" size="sm" className={styles.actionTag}>
            {actionArg}
          </Tag>
        )}
      </div>
      <div className={styles.actionBody}>
        {renderer ? (
          renderer(safeArgs)
        ) : Object.keys(safeArgs).length > 0 ? (
          <PrettyJsonFallback args={safeArgs} />
        ) : null}
      </div>
    </div>
  );
}

export function HITLCard({ request, onDecision }: HITLCardProps) {
  const { t } = useTranslation("chatbot");
  const [submitting, setSubmitting] = useState(false);

  const actions = request.actionRequests;
  if (!actions?.length) return null;

  const handleDecision = (decision: "approve" | "reject") => {
    setSubmitting(true);
    onDecision(decision);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.headerLabel}>{t("ui.toolConfirm")}</span>
          {actions.length > 1 && (
            <Tag type="gray" size="sm">{actions.length} 個操作</Tag>
          )}
        </div>

        <div className={styles.actionsContainer}>
          {actions.map((action, idx) => (
            <ActionItem
              key={`${action.name}-${idx}`}
              name={action.name}
              args={action.args}
            />
          ))}
        </div>

        {submitting ? (
          <div className={styles.loadingFooter}>
            <InlineLoading description={t("ui.processing")} />
          </div>
        ) : (
          <div className={styles.footer}>
            <Button
              kind="primary"
              size="lg"
              className={styles.footerBtn}
              onClick={() => handleDecision("approve")}
            >
              {t("ui.confirmAction")}
            </Button>
            <Button
              kind="danger"
              size="lg"
              className={styles.footerBtn}
              onClick={() => handleDecision("reject")}
            >
              {t("ui.cancelAction")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
