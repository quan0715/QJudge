import {
  Accordion,
  AccordionItem,
  Button,
  InlineNotification,
  Tag,
} from "@carbon/react";
import { Information } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { CopilotApprovalCardProps } from "@copilot";
import { getHITLRenderer } from "./hitlRendererRegistry";
import styles from "./HITLCard.module.scss";

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

type Translate = (key: string, options?: Record<string, unknown>) => string;

function summarizeValue(value: unknown, t: Translate): string {
  if (Array.isArray(value)) {
    return t("ui.toolArrayItems", { count: value.length });
  }
  if (value !== null && typeof value === "object") {
    return t("ui.toolObjectFields", { count: Object.keys(value).length });
  }
  if (value === null) return "null";
  if (typeof value === "string") return value || "—";
  return String(value);
}

function summarizeActionArguments(args: Record<string, unknown>, t: Translate) {
  return Object.entries(args)
    .filter(([key]) => key !== "action")
    .map(([key, value]) => ({
      key,
      value: summarizeValue(value, t),
    }));
}

function ActionItem({
  name,
  args,
  t,
  showIdentity,
}: {
  name: string;
  args?: Record<string, unknown>;
  t: Translate;
  showIdentity: boolean;
}) {
  const actionArg = typeof args?.action === "string" ? args.action : undefined;
  const renderer = getHITLRenderer(name, actionArg);
  const safeArgs = args ?? {};
  const summary = summarizeActionArguments(safeArgs, t);

  return (
    <div className={styles.actionItem}>
      {showIdentity && (
        <div className={styles.actionHeader}>
          <span className={styles.toolName}>{name}</span>
          {actionArg && (
            <Tag type="blue" size="sm" className={styles.actionTag}>
              {actionArg}
            </Tag>
          )}
        </div>
      )}
      {Object.keys(safeArgs).length > 0 && (
        <dl className={styles.actionSummary}>
          {summary.map(({ key, value }) => (
            <div className={styles.summaryRow} key={key}>
              <dt>{key}</dt>
              <dd title={value}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {renderer && <div className={styles.actionBody}>{renderer(safeArgs)}</div>}
      {summary.length > 0 && (
        <Accordion align="start" className={styles.technicalDetails}>
          <AccordionItem title={t("ui.toolTechnicalDetails")}>
            <PrettyJsonFallback args={safeArgs} />
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

export function HITLCard({
  request,
  interactionError,
  pending = false,
  onSubmit,
}: CopilotApprovalCardProps) {
  const { t } = useTranslation("chatbot");

  const actions = request.actions;

  if (!actions.length) return null;

  const primaryAction = actions[0];
  const confirmationTitle =
    typeof primaryAction.arguments?.action === "string"
      ? primaryAction.arguments.action
      : primaryAction.name;

  const handleDecision = (decision: "approve" | "reject") => {
    if (pending) return;
    onSubmit(decision);
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Information className={styles.headerIcon} size={20} aria-hidden="true" />
          <div className={styles.headerCopy}>
            <span className={styles.headerEyebrow}>
              {t("ui.toolConfirmationRequired")}
            </span>
            <span className={styles.headerLabel}>{confirmationTitle}</span>
          </div>
          {actions.length > 1 && (
            <Tag type="gray" size="sm" className={styles.actionCount}>
              {t("ui.toolActionCount", { count: actions.length })}
            </Tag>
          )}
        </div>

        <div className={styles.actionsContainer}>
          {actions.map((action, idx) => (
            <ActionItem
              key={`${action.name}-${idx}`}
              name={action.name}
              args={action.arguments}
              t={t}
              showIdentity={actions.length > 1}
            />
          ))}
        </div>

        {interactionError && (
          <InlineNotification
            hideCloseButton
            kind="error"
            lowContrast
            role="alert"
            title={interactionError.message ?? t("ui.interactionError", "無法送出操作，請再試一次")}
          />
        )}

        <div className={styles.footer}>
          {request.allowedDecisions.includes("approve") && (
            <Button
              kind="primary"
              className={styles.footerBtn}
              disabled={pending}
              onClick={() => handleDecision("approve")}
            >
              {pending ? t("ui.processing") : t("ui.confirmAction")}
            </Button>
          )}
          {request.allowedDecisions.includes("reject") && (
            <Button
              kind="secondary"
              className={styles.footerBtn}
              disabled={pending}
              onClick={() => handleDecision("reject")}
            >
              {t("ui.cancelAction")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
