
import React from 'react';
import { Grid, Column, Button, Dropdown } from '@carbon/react';
import { Send } from '@carbon/icons-react';
import { QJudgeEditor } from '@/components/common/QJudgeEditor';
import TestCasePanel, { type TestCase } from './TestCasePanel';
import { type LanguageConfig } from '@/core/entities/problem.entity';

interface ProblemCodingTabProps {
  code: string;
  setCode: (code: string) => void;
  language: string;
  setLanguage: (lang: string) => void;
  languageConfigs: LanguageConfig[];
  testCases: TestCase[];
  onAddTestCase: (input: string, output: string) => void;
  onDeleteTestCase: (id: string) => void;
  onToggleTestCase: (id: string, enabled: boolean) => void;
  onRunTest: () => void;
  onSubmit: () => void;
  running: boolean;
  theme: string;
}

const ProblemCodingTab: React.FC<ProblemCodingTabProps> = ({
  code, setCode,
  language, setLanguage,
  languageConfigs,
  testCases,
  onAddTestCase, onDeleteTestCase, onToggleTestCase,
  onRunTest, onSubmit, running
}) => {
  const languageItems = languageConfigs
    .filter((c) => c.isEnabled)
    .map((c) => ({
      id: c.language,
      label: c.language === 'cpp' ? 'C++' : 
             c.language === 'python' ? 'Python' : 
             c.language === 'java' ? 'Java' : c.language
    }));

  return (
    <div style={{ height: 'calc(100vh - 250px)', display: 'flex', flexDirection: 'column' }}>
       {/* Toolbar */}
       <div style={{ 
           padding: '0.5rem 0', 
           display: 'flex', 
           justifyContent: 'space-between', 
           alignItems: 'center',
           borderBottom: '1px solid var(--cds-border-subtle-01)',
           marginBottom: '0.5rem'
       }}>
            <div style={{ width: '200px' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button 
                    kind="primary" 
                    size="sm" 
                    renderIcon={Send} 
                    onClick={onSubmit}
                    disabled={running}
                >
                    繳交
                </Button>
            </div>
       </div>

      {/* Split Pane */}
      <Grid narrow fullWidth style={{ flex: 1, minHeight: 0 }}>
        <Column lg={10} md={5} sm={4} style={{ height: '100%', paddingRight: 0 }}>
          <QJudgeEditor 
            value={code}
            language={language === 'cpp' ? 'cpp' : language}
            onChange={(val) => setCode(val || '')}
          />
        </Column>
        <Column lg={6} md={3} sm={4} style={{ height: '100%', paddingLeft: 0 }}>
          <div style={{ height: '100%', border: '1px solid var(--cds-border-subtle-01)', borderLeft: 'none', backgroundColor: 'var(--cds-layer-01)' }}>
            <TestCasePanel 
              testCases={testCases}
              onAddTestCase={onAddTestCase}
              onDeleteTestCase={onDeleteTestCase}
              onToggleTestCase={onToggleTestCase}
              onRunTest={onRunTest}
              running={running}
            />
          </div>
        </Column>
      </Grid>
    </div>
  );
};

export default ProblemCodingTab;
