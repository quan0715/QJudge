import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, InlineNotification } from "@carbon/react";
import { ThumbsUp, ThumbsDown } from "@carbon/icons-react";
import { useDocsFramework } from "../contexts/DocsFrameworkContext";
import styles from "./DocFeedback.module.scss";

export interface DocFeedbackProps {
  docSlug: string;
}

const DocFeedback: React.FC<DocFeedbackProps> = ({ docSlug }) => {
  const { t } = useTranslation("docs");
  const { onFeedback } = useDocsFramework();
  const [submitted, setSubmitted] = useState(false);

  const handleFeedback = (type: "helpful" | "not-helpful") => {
    setSubmitted(true);
    if (onFeedback) {
      onFeedback(docSlug, type);
    } else {
      console.log(`Feedback for ${docSlug}: ${type}`);
    }
  };

  if (submitted) {
    return (
      <div className={styles.submittedContainer}>
        <InlineNotification
          kind="success"
          title={t("feedback.thanks")}
          hideCloseButton
          lowContrast
        />
      </div>
    );
  }

  return (
    <div className={styles.promptContainer}>
      <span className={styles.promptLabel}>{t("feedback.title")}</span>

      <div className={styles.actions}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ThumbsUp}
          onClick={() => handleFeedback("helpful")}
          hasIconOnly={false}
        >
          {t("feedback.helpful")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ThumbsDown}
          onClick={() => handleFeedback("not-helpful")}
          hasIconOnly={false}
        >
          {t("feedback.notHelpful")}
        </Button>
      </div>
    </div>
  );
};

export default DocFeedback;
