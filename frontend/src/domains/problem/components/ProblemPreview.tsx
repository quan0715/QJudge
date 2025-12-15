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
      {/* Problem Title - H2 */}
      {!compact && (
        <h2 className="problem-title">
          {translation?.title || title || t("common:message.noData")}
        </h2>
      )}

      {translation && (
        <>
          {/* Description Section - H3 */}
          {translation.description && (
            <section>
              <h3>{t("problem:section.description")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.description}
              </MarkdownRenderer>
            </section>
          )}

          {/* Input Description Section - H3 */}
          {translation.inputDescription && (
            <section>
              <h3>{t("problem:section.inputDescription")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.inputDescription}
              </MarkdownRenderer>
            </section>
          )}

          {/* Output Description Section - H3 */}
          {translation.outputDescription && (
            <section>
              <h3>{t("problem:section.outputDescription")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.outputDescription}
              </MarkdownRenderer>
            </section>
          )}

          {/* Sample Test Cases Section - H3 */}
          {sampleCases.length > 0 && (
            <section>
              <h3>{t("problem:section.sampleTestCases")}</h3>
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

          {/* Hint Section - H3 */}
          {translation.hint && (
            <section>
              <h3>{t("problem:section.hint")}</h3>
              <MarkdownRenderer enableMath enableHighlight>
                {translation.hint}
              </MarkdownRenderer>
            </section>
          )}

          {/* Code Restrictions Section - H3 */}
          {(requiredKeywords.length > 0 || forbiddenKeywords.length > 0) && (
            <section>
              <h3>{t("problem:section.codeRestrictions")}</h3>

              {requiredKeywords.length > 0 && (
                <div className="keyword-group">
                  <h4>{t("problem:section.requiredKeywords")}</h4>
                  <div className="keyword-tags">
                    {requiredKeywords.map((kw, index) => (
                      <code
                        key={index}
                        className="keyword-tag keyword-tag--success"
                      >
                        {kw}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {forbiddenKeywords.length > 0 && (
                <div className="keyword-group">
                  <h4>{t("problem:section.forbiddenKeywords")}</h4>
                  <div className="keyword-tags">
                    {forbiddenKeywords.map((kw, index) => (
                      <code
                        key={index}
                        className="keyword-tag keyword-tag--error"
                      >
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
