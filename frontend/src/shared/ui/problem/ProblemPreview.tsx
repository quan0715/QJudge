import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import type { ProblemDetail } from "@/core/entities/problem.entity";
import { useContentLanguage } from "@/shared/contexts/ContentLanguageContext";
import { useTranslation } from "react-i18next";
import { Tag, Tile, IconButton } from "@carbon/react";
import { Copy, Checkmark } from "@carbon/icons-react";
import { useState } from "react";
import "@/styles/markdown.css";
import styles from "./ProblemPreview.module.scss";

export interface ProblemPreviewProps {
  /** Problem data to display */
  problem?: ProblemDetail;
  /** Show language toggle */
  showLanguageToggle?: boolean;
  /** Compact mode - hide title */
  compact?: boolean;
}

/**
 * ProblemPreview - Displays problem content with markdown rendering.
 * Accepts a ProblemDetail entity for cleaner API.
 */
const ProblemPreview = ({
  problem,
  showLanguageToggle: _showLanguageToggle = true,
  compact = false,
}: ProblemPreviewProps) => {
  const { contentLanguage } = useContentLanguage();
  const { t } = useTranslation(["problem", "common"]);

  if (!problem) {
    return <p className={styles.emptyState}>{t("common:message.noData")}</p>;
  }

  const {
    title,
    translations = [],
    testCases = [],
    forbiddenKeywords = [],
    requiredKeywords = [],
  } = problem;

  const translation =
    translations.find((trans) => trans.language === contentLanguage) ||
    (contentLanguage === "zh-TW"
      ? translations.find((trans) => trans.language === "zh-hant")
      : null) ||
    translations[0];

  const sampleCases = testCases.filter((tc) => tc.isSample);

  return (
    <article className={`${styles.problemPreview} markdown-body`}>
      {/* Problem Title */}
      {!compact && (
        <h2 className={styles.problemTitle}>
          {translation?.title || title || t("common:message.noData")}
        </h2>
      )}

      {translation && (
        <div className={styles.sections}>
          {/* Description Section */}
          {translation.description && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("problem:section.description")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.description}
              </MarkdownRenderer>
            </section>
          )}

          {/* Input Description Section */}
          {translation.inputDescription && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("problem:section.inputDescription")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.inputDescription}
              </MarkdownRenderer>
            </section>
          )}

          {/* Output Description Section */}
          {translation.outputDescription && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("problem:section.outputDescription")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.outputDescription}
              </MarkdownRenderer>
            </section>
          )}

          {/* Sample Test Cases Section */}
          {sampleCases.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("problem:section.sampleTestCases")}</h3>
              <div className={styles.sampleCases}>
                {sampleCases.map((tc, index) => (
                  <SampleCaseCard
                    key={index}
                    index={index + 1}
                    input={tc.input}
                    output={tc.output}
                    t={t}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Hint Section */}
          {translation.hint && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("problem:section.hint")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.hint}
              </MarkdownRenderer>
            </section>
          )}

          {/* Code Restrictions Section */}
          {(requiredKeywords.length > 0 || forbiddenKeywords.length > 0) && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("problem:section.codeRestrictions")}</h3>

              {requiredKeywords.length > 0 && (
                <div className={styles.keywordGroup}>
                  <h4 className={styles.keywordLabel}>{t("problem:section.requiredKeywords")}</h4>
                  <div className={styles.keywordTags}>
                    {requiredKeywords.map((kw, index) => (
                      <Tag key={index} type="green" size="md">
                        <code>{kw}</code>
                      </Tag>
                    ))}
                  </div>
                </div>
              )}

              {forbiddenKeywords.length > 0 && (
                <div className={styles.keywordGroup}>
                  <h4 className={styles.keywordLabel}>{t("problem:section.forbiddenKeywords")}</h4>
                  <div className={styles.keywordTags}>
                    {forbiddenKeywords.map((kw, index) => (
                      <Tag key={index} type="red" size="md">
                        <code>{kw}</code>
                      </Tag>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {!translation && (
        <p className={styles.emptyState}>{t("common:message.noData")}</p>
      )}
    </article>
  );
};

/** Sample Case Card - Carbon-styled test case display */
interface SampleCaseCardProps {
  index: number;
  input?: string;
  output?: string;
  t: (key: string) => string;
}

const SampleCaseCard = ({ index, input, output, t }: SampleCaseCardProps) => {
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const handleCopy = async (text: string, type: "input" | "output") => {
    await navigator.clipboard.writeText(text);
    if (type === "input") {
      setCopiedInput(true);
      setTimeout(() => setCopiedInput(false), 2000);
    } else {
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  return (
    <Tile className={styles.sampleCase}>
      <div className={styles.sampleCaseHeader}>
        <span className={styles.sampleCaseTitle}>
          {t("problem:sample.example").replace("{{index}}", String(index))}
        </span>
      </div>
      <div className={styles.sampleCaseContent}>
        <div className={styles.sampleCaseColumn}>
          <div className={styles.sampleCaseLabelRow}>
            <span className={styles.sampleCaseLabel}>{t("problem:sample.input")}</span>
            <IconButton
              kind="ghost"
              size="sm"
              label={copiedInput ? "Copied" : "Copy"}
              onClick={() => handleCopy(input || "", "input")}
              className={styles.copyButton}
            >
              {copiedInput ? <Checkmark size={16} /> : <Copy size={16} />}
            </IconButton>
          </div>
          <pre className={styles.sampleCaseCode}>
            {input || t("problem:sample.empty")}
          </pre>
        </div>
        <div className={styles.sampleCaseColumn}>
          <div className={styles.sampleCaseLabelRow}>
            <span className={styles.sampleCaseLabel}>{t("problem:sample.output")}</span>
            <IconButton
              kind="ghost"
              size="sm"
              label={copiedOutput ? "Copied" : "Copy"}
              onClick={() => handleCopy(output || "", "output")}
              className={styles.copyButton}
            >
              {copiedOutput ? <Checkmark size={16} /> : <Copy size={16} />}
            </IconButton>
          </div>
          <pre className={styles.sampleCaseCode}>
            {output || t("problem:sample.empty")}
          </pre>
        </div>
      </div>
    </Tile>
  );
};

export default ProblemPreview;
