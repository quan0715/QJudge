import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, InlineNotification } from "@carbon/react";
import { ThumbsUp, ThumbsDown } from "@carbon/icons-react";

interface DocFeedbackProps {
  docSlug: string;
}

const DocFeedback: React.FC<DocFeedbackProps> = ({ docSlug }) => {
  const { t } = useTranslation("docs");
  const [_feedback, setFeedback] = useState<"helpful" | "not-helpful" | null>(
    null
  );
  const [submitted, setSubmitted] = useState(false);

  const handleFeedback = (type: "helpful" | "not-helpful") => {
    setFeedback(type);
    setSubmitted(true);

    // Here you could send feedback to your analytics or backend
    console.log(`Feedback for ${docSlug}: ${type}`);
  };

  if (submitted) {
    return (
      <div
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--cds-border-subtle-01)",
        }}
      >
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
    <div
      style={{
        marginTop: "3rem",
        paddingTop: "1.5rem",
        borderTop: "1px solid var(--cds-border-subtle-01)",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <span
        className="cds--type-body-compact-01"
        style={{ color: "var(--cds-text-secondary)" }}
      >
        {t("feedback.title")}
      </span>

      <div style={{ display: "flex", gap: "0.5rem" }}>
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
