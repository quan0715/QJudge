import React, { useState } from 'react';
import { Button, Dropdown } from '@carbon/react';
import { Send, Play, Add } from '@carbon/icons-react';
import { QJudgeEditor } from '@/ui/components/QJudgeEditor';
import { TestCaseList, type TestCaseItem } from '@/domains/problem/components/common/TestCaseList';
import { type LanguageConfig } from '@/core/entities/problem.entity';
import ContainerCard from '@/ui/components/layout/ContainerCard';

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
  code, setCode,
  language, setLanguage,
  languageConfigs,
  testCases,
  onAddTestCase, onDeleteTestCase,
  onRunTest, onSubmit, running,
  submissionDisabled
}) => {
  const [isAddingTestCase, setIsAddingTestCase] = useState(false);

  const languageItems = languageConfigs
    .filter((c) => c.isEnabled)
    .map((c) => ({
      id: c.language,
      label: c.language === 'cpp' ? 'C++' : 
             c.language === 'python' ? 'Python' : 
             c.language === 'java' ? 'Java' : c.language
    }));

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1rem',
      padding: '1rem 0'
    }}>
      {/* Code Editor Section */}
      <ContainerCard
        title="程式碼編輯器"
        action={
          <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              padding: '0 1rem',
              borderRight: '1px solid var(--cds-border-subtle)',
              height: '100%'
            }}>
              <Dropdown
                id="language-selector"
                titleText=""
                label="Select Language"
                type="inline"
                size="sm"
                items={languageItems}
                itemToString={(item: any) => item ? item.label : ''}
                selectedItem={languageItems.find(i => i.id === language)}
                onChange={(e: any) => setLanguage(e.selectedItem.id)}
              />
            </div>
            <Button 
              kind="primary" 
              renderIcon={Send} 
              onClick={onSubmit}
              disabled={running || submissionDisabled}
              style={{ height: '100%', borderRadius: 0 }}
              title={submissionDisabled ? 'Submission is disabled' : 'Submit Solution'}
            >
              繳交
            </Button>
          </div>
        }
        noPadding
      >
        <div style={{ height: '400px' }}>
          <QJudgeEditor 
            // Use key to force re-mount when language changes (needed for defaultValue)
            key={language}
            value={code}
            language={language === 'cpp' ? 'cpp' : language}
            onChange={(val) => setCode(val || '')}
          />
        </div>
      </ContainerCard>

      {/* Test Cases Section */}
      <ContainerCard
        title="測試案例"
        action={
          <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
            <Button 
              kind="ghost" 
              renderIcon={Add}
              onClick={() => setIsAddingTestCase(true)}
              style={{ height: '100%', borderRadius: 0 }}
            >
              新增測資
            </Button>
            <Button 
              kind="primary" 
              renderIcon={Play}
              onClick={onRunTest}
              disabled={running || testCases.length === 0}
              style={{ height: '100%', borderRadius: 0 }}
            >
              {running ? '執行中...' : '執行測試'}
            </Button>
          </div>
        }
        noPadding
      >
        <div style={{ 
          maxHeight: '350px', 
          overflowY: 'auto',
        }}>

          <TestCaseList 
            mode="solver"
            items={testCases}
            onAdd={(input, output) => onAddTestCase(input, output)}
            onDelete={onDeleteTestCase}
            onUpdate={(id, input, output) => {
              // Find and update the test case
              const tc = testCases.find(t => t.id === id);
              if (tc && tc.source === 'custom') {
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
