import { useTranslation } from "react-i18next";
import {
  Button,
  Column,
  Grid,
  Select,
  SelectItem,
  SkeletonText,
  Tag,
  Tile,
} from "@carbon/react";
import { Code, Play, Time } from "@carbon/icons-react";
import useMiniJudgeDemo, {
  type DemoCaseResult,
  type DemoLanguage,
} from "@/features/landing/hooks/useMiniJudgeDemo";
import "./LandingMiniJudgeSection.scss";

const LANGUAGE_ITEMS: Array<{ id: DemoLanguage; label: string }> = [
  { id: "python", label: "Python" },
  { id: "cpp", label: "C++" },
  { id: "java", label: "Java" },
];

const StatusTag = ({ result }: { result: DemoCaseResult }) => (
  <Tag type={result.status === "AC" ? "green" : "red"}>
    {result.status}
  </Tag>
);

const LandingMiniJudgeSection = () => {
  const { t } = useTranslation();
  const {
    language,
    code,
    status,
    isPreparing,
    visibleResults,
    totalResults,
    passedCount,
    canSubmit,
    onLanguageChange,
    onCodeChange,
    onSubmit,
  } = useMiniJudgeDemo();

  const running = status === "running";
  const totalCount = totalResults.length || 4;

  return (
    <section className="landing__section landing__section--mini-judge">
      <div className="landing__section-inner">
        <div className="landing__section-header">
          <p className="landing__eyebrow">
            {t("landing.miniJudge.eyebrow", { defaultValue: "互動示範" })}
          </p>
          <h2 className="landing__section-title">
            {t("landing.miniJudge.title", {
              defaultValue: "簡單體驗 QJudge：題目、寫碼、提交、看結果",
            })}
          </h2>
        </div>

        <Grid fullWidth className="landing-mini-judge">
          <Column sm={4} md={4} lg={5}>
            <Tile className="landing-mini-judge__tile">
              <div className="landing-mini-judge__tile-header">
                <h3>
                  {t("landing.miniJudge.problem.title", {
                    defaultValue: "費氏數列第 n 項",
                  })}
                </h3>
                <Tag type="cyan">Easy</Tag>
              </div>

              <p className="landing-mini-judge__problem-desc">
                {t("landing.miniJudge.problem.description", {
                  defaultValue:
                    "給定整數 n，回傳第 n 項費氏數列。費氏數列定義為 F(0)=0, F(1)=1。",
                })}
              </p>

              <div className="landing-mini-judge__problem-io">
                <h4>
                  {t("landing.miniJudge.problem.input", { defaultValue: "輸入" })}
                </h4>
                <p>{"`n`，且 `0 <= n <= 30`"}</p>
                <h4>
                  {t("landing.miniJudge.problem.output", { defaultValue: "輸出" })}
                </h4>
                <p>回傳 `F(n)`</p>
              </div>

              <div className="landing-mini-judge__samples">
                <div className="landing-mini-judge__sample">
                  <span>Sample 1</span>
                  <code>n=10 -&gt; 55</code>
                </div>
                <div className="landing-mini-judge__sample">
                  <span>Sample 2</span>
                  <code>n=20 -&gt; 6765</code>
                </div>
              </div>
            </Tile>
          </Column>

          <Column sm={4} md={4} lg={6}>
            <Tile className="landing-mini-judge__tile">
              <div className="landing-mini-judge__tile-header">
                <h3>
                  {t("landing.miniJudge.editor.title", { defaultValue: "程式碼輸入" })}
                </h3>
                <div className="landing-mini-judge__editor-controls">
                  <Select
                    id="mini-judge-language"
                    labelText=""
                    hideLabel
                    value={language}
                    size="sm"
                    onChange={(event) =>
                      onLanguageChange(event.target.value as DemoLanguage)
                    }
                  >
                    {LANGUAGE_ITEMS.map((item) => (
                      <SelectItem key={item.id} value={item.id} text={item.label} />
                    ))}
                  </Select>
                </div>
              </div>

              <textarea
                className="landing-mini-judge__editor"
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
                spellCheck={false}
                aria-label="mini-judge-code-input"
              />

              <div className="landing-mini-judge__editor-actions">
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={Play}
                  onClick={onSubmit}
                  disabled={!canSubmit}
                >
                  {t("landing.miniJudge.editor.submit", { defaultValue: "模擬提交" })}
                </Button>
                <span className="landing-mini-judge__editor-hint">
                  Demo only, no backend API call.
                </span>
              </div>
            </Tile>
          </Column>

          <Column sm={4} md={8} lg={5}>
            <Tile className="landing-mini-judge__tile">
              <div className="landing-mini-judge__tile-header">
                <h3>
                  {t("landing.miniJudge.result.title", { defaultValue: "測試結果" })}
                </h3>
                <Code size={18} />
              </div>

              <p
                className="landing-mini-judge__status-text"
                data-testid="mini-judge-status"
              >
                {isPreparing
                  ? "Preparing..."
                  : running
                    ? t("landing.miniJudge.result.running", {
                        defaultValue: "Running...",
                      })
                    : status === "done"
                      ? t("landing.miniJudge.result.summary", {
                          defaultValue: "Passed {{passed}} / {{total}}",
                          passed: passedCount,
                          total: totalCount,
                        })
                      : t("landing.miniJudge.result.idle", {
                          defaultValue: "尚未提交",
                        })}
              </p>

              <div className="landing-mini-judge__result-list" data-testid="mini-judge-results">
                {running &&
                  Array.from({ length: totalCount - visibleResults.length }).map((_, index) => (
                    <div
                      key={`skeleton-${index}`}
                      className="landing-mini-judge__result-row landing-mini-judge__result-row--pending"
                    >
                      <SkeletonText width="70%" />
                    </div>
                  ))}

                {visibleResults.map((result) => (
                  <div
                    key={result.id}
                    className="landing-mini-judge__result-row"
                    data-testid="mini-judge-result-row"
                  >
                    <span className="landing-mini-judge__result-label">{result.label}</span>
                    <span className="landing-mini-judge__result-meta">
                      <Time size={14} />
                      {result.timeMs}ms
                    </span>
                    <StatusTag result={result} />
                  </div>
                ))}
              </div>
            </Tile>
          </Column>
        </Grid>
      </div>
    </section>
  );
};

export default LandingMiniJudgeSection;
