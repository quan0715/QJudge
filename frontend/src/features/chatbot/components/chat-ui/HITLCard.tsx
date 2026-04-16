import { useState } from "react";
import { Tile, Button, InlineLoading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ApprovalRequest } from "@/core/types/chatbot.types";
import styles from "./HITLCard.module.scss";

interface HITLCardProps {
  request: ApprovalRequest;
  onDecision: (decision: "approve" | "reject") => void;
}

export function HITLCard({ request, onDecision }: HITLCardProps) {
  const { t } = useTranslation("chatbot");
  const [submitting, setSubmitting] = useState(false);

  const action = request.actionRequests[0];
  if (!action) return null;

  const handleDecision = (decision: "approve" | "reject") => {
    setSubmitting(true);
    onDecision(decision);
  };

  return (
    <div className={styles.wrapper}>
      <Tile className={styles.card}>
        <div className={styles.title}>
          {t("ui.toolConfirm")}：<code>{action.name}</code>
        </div>
        {action.args && Object.keys(action.args).length > 0 && (
          <pre className={styles.args}>
            {JSON.stringify(action.args, null, 2)}
          </pre>
        )}

        {submitting ? (
          <InlineLoading description={t("ui.processing")} />
        ) : (
          <div className={styles.actions}>
            <Button
              kind="primary"
              size="sm"
              onClick={() => handleDecision("approve")}
            >
              {t("ui.confirmAction")}
            </Button>
            <Button
              kind="danger"
              size="sm"
              onClick={() => handleDecision("reject")}
            >
              {t("ui.cancelAction")}
            </Button>
          </div>
        )}
      </Tile>
    </div>
  );
}
