import MarkdownRenderer from "@/ui/components/common/MarkdownRenderer";
import type {
  TestCase,
  Translation,
  Tag as TagType,
} from "@/core/entities/problem.entity";
import { useContentLanguage } from "@/contexts/ContentLanguageContext";
import { useTranslation } from "react-i18next";
import "@/styles/markdown.css";

interface ProblemPreviewProps {
  title?: string;
  difficulty?: string;
  timeLimit?: number;
  memoryLimit?: number;
  translations?: Translation[];
  testCases?: TestCase[];
  tags?: TagType[];
  showLanguageToggle?: boolean;
  compact?: boolean;
  forbiddenKeywords?: string[];
  requiredKeywords?: string[];
}

const ProblemPreview = ({
  title,
  difficulty: _difficulty = "medium",
  timeLimit: _timeLimit = 1000,
  memoryLimit: _memoryLimit = 128,
  translations = [],
  testCases = [],
  tags: _tags = [],
  showLanguageToggle: _showLanguageToggle = true,
  compact = false,
  forbiddenKeywords = [],
  requiredKeywords = [],
}: ProblemPreviewProps) => {
  const { contentLanguage } = useContentLanguage();
  const { t } = useTranslation(["problem", "common"]);
  const currentLang = contentLanguage;

  const translation =
    translations.find((trans) => trans.language === currentLang) ||
    (currentLang === "zh-TW"
      ? translations.find((trans) => trans.language === "zh-hant")
      : null) ||
    translations[0];

  const sampleCases = testCases.filter((tc) => tc.isSample);

  return (
    <article className="problem-preview markdown-body">
      {/* H0 - Problem Title (Special, largest heading with underline) */}
      {!compact && (
        <h1 className="problem-title">
          {translation?.title || title || t("common:message.noData")}
        </h1>
      )}

      {translation && (
        <>
          {/* H1 - Description Section */}
          {translation.description && (
            <section>
              <h2>{t("problem:section.description")}</h2>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.description}
              </MarkdownRenderer>
            </section>
          )}

          {/* H1 - Input Description Section */}
          {translation.inputDescription && (
            <section>
              <h2>{t("problem:section.inputDescription")}</h2>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.inputDescription}
              </MarkdownRenderer>
            </section>
          )}

          {/* H1 - Output Description Section */}
          {translation.outputDescription && (
            <section>
              <h2>{t("problem:section.outputDescription")}</h2>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.outputDescription}
              </MarkdownRenderer>
            </section>
          )}

          {/* H1 - Sample Test Cases Section */}
          {sampleCases.length > 0 && (
            <section>
              <h2>{t("problem:section.sampleTestCases")}</h2>
              {sampleCases.map((tc, index) => (
                <div key={index} className="sample-case">
                  <div className="sample-case__header">
                    {t("problem:sample.example", { index: index + 1 })}
                  </div>
                  <div className="sample-case__content">
                    <div className="sample-case__column">
                      <h4 className="sample-case__label">
                        {t("problem:sample.input")}
                      </h4>
                      <pre className="sample-case__code">
                        {tc.input || t("problem:sample.empty")}
                      </pre>
                    </div>
                    <div className="sample-case__column">
                      <h4 className="sample-case__label">
                        {t("problem:sample.output")}
                      </h4>
                      <pre className="sample-case__code">
                        {tc.output || t("problem:sample.empty")}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* H1 - Hint Section */}
          {translation.hint && (
            <section>
              <h2>{t("problem:section.hint")}</h2>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.hint}
              </MarkdownRenderer>
            </section>
          )}

          {/* H1 - Code Restrictions Section */}
          {(requiredKeywords.length > 0 || forbiddenKeywords.length > 0) && (
            <section>
              <h2>{t("problem:section.codeRestrictions")}</h2>

              {requiredKeywords.length > 0 && (
                <div className="keyword-group">
                  <h3>{t("problem:section.requiredKeywords")}</h3>
                  <div className="keyword-tags">
                    {requiredKeywords.map((kw, index) => (
                      <code key={index} className="keyword-tag keyword-tag--success">
                        {kw}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {forbiddenKeywords.length > 0 && (
                <div className="keyword-group">
                  <h3>{t("problem:section.forbiddenKeywords")}</h3>
                  <div className="keyword-tags">
                    {forbiddenKeywords.map((kw, index) => (
                      <code key={index} className="keyword-tag keyword-tag--error">
                        {kw}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {!translation && (
        <p className="empty-state">{t("common:message.noData")}</p>
      )}
    </article>
  );
};

export default ProblemPreview;
