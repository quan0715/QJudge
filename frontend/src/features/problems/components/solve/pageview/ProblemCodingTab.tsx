import React, { useState } from "react";
import { Button, Dropdown } from "@carbon/react";
import { Send, Play, Add } from "@carbon/icons-react";
import { QJudgeEditor } from "@/shared/ui/editor/QJudgeEditor";
import { TestCaseList } from "@/features/problems/components/common/TestCaseList";
import { type TestCaseItem } from "@/core/entities/testcase.entity";
import { type LanguageConfig } from "@/core/entities/problem.entity";
import ContainerCard from "@/shared/layout/ContainerCard";
import "./ProblemCodingTab.scss";

interface ProblemCodingTabProps {
  code: string;
  setCode: (code: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  languageConfigs: LanguageConfig[];
  testCases: TestCaseItem[];
  onAddTestCase: (input: string, output: string) => void;
  onDeleteTestCase: (id: string) => void;
  onRunTest: () => void;
  onSubmit: () => void;
  running: boolean;
  theme: string;
  submissionDisabled?: boolean;
}

const ProblemCodingTab: React.FC<ProblemCodingTabProps> = ({
  code,
  setCode,
  language,
  setLanguage,
  languageConfigs,
  testCases,
  onAddTestCase,
  onDeleteTestCase,
  onRunTest,
  onSubmit,
  running,
  submissionDisabled,
}) => {
  const [isAddingTestCase, setIsAddingTestCase] = useState(false);

  const languageItems = languageConfigs
    .filter((c) => c.isEnabled)
    .map((c) => ({
      id: c.language,
      label:
        c.language === "cpp"
          ? "C++"
          : c.language === "python"
            ? "Python"
            : c.language === "java"
              ? "Java"
              : c.language,
    }));

  return (
    <div className="problem-coding-tab">
      {/* Code Editor Section */}
      <ContainerCard
        title="程式碼編輯器"
        action={
          <div className="problem-coding-tab__actions">
            <div className="problem-coding-tab__language-selector">
              <Dropdown
                id="language-selector"
                titleText=""
                label="Select Language"
                type="inline"
                size="sm"
                items={languageItems}
                itemToString={(item: { id: string; label: string } | null) =>
                  item ? item.label : ""
                }
                selectedItem={languageItems.find((i) => i.id === language)}
                onChange={(e: {
                  selectedItem: { id: string; label: string } | null;
                }) => {
                  if (e.selectedItem) {
                    setLanguage(e.selectedItem.id);
                  }
                }}
              />
            </div>
            <Button
              kind="primary"
              renderIcon={Send}
              onClick={onSubmit}
              disabled={running || submissionDisabled}
              className="problem-coding-tab__action-button"
              title={
                submissionDisabled ? "Submission is disabled" : "Submit Solution"
              }
            >
              繳交
            </Button>
          </div>
        }
        noPadding
      >
        <div className="problem-coding-tab__editor-container">
          <QJudgeEditor
            // Use key to force re-mount when language changes (needed for defaultValue)
            key={language}
            value={code}
            language={language === "cpp" ? "cpp" : language}
            onChange={(val) => setCode(val || "")}
          />
        </div>
      </ContainerCard>

      {/* Test Cases Section */}
      <ContainerCard
        title="測試案例"
        action={
          <div className="problem-coding-tab__actions">
            <Button
              kind="ghost"
              renderIcon={Add}
              onClick={() => setIsAddingTestCase(true)}
              className="problem-coding-tab__action-button"
            >
              新增測資
            </Button>
            <Button
              kind="primary"
              renderIcon={Play}
              onClick={onRunTest}
              disabled={running || testCases.length === 0}
              className="problem-coding-tab__action-button"
            >
              {running ? "執行中..." : "執行測試"}
            </Button>
          </div>
        }
        noPadding
      >
        <div className="problem-coding-tab__test-cases-container">
          <TestCaseList
            mode="solver"
            items={testCases}
            onAdd={(input, output) => onAddTestCase(input, output)}
            onDelete={onDeleteTestCase}
            onUpdate={(id, input, output) => {
              // Find and update the test case
              const tc = testCases.find((t) => t.id === id);
              if (tc && tc.source === "custom") {
                onDeleteTestCase(id);
                onAddTestCase(input, output);
              }
            }}
            isAdding={isAddingTestCase}
            onCancelAdd={() => setIsAddingTestCase(false)}
          />
        </div>
      </ContainerCard>
    </div>
  );
};

export default ProblemCodingTab;
