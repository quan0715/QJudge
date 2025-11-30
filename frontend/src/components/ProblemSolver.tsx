import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  Column,
  Button,
  InlineNotification,
  Modal,
  Dropdown,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
} from '@carbon/react';
import { Send, Play } from '@carbon/icons-react';
import Editor from '@monaco-editor/react';
import ProblemPreview from './ProblemPreview';
import ProblemSubmissionList from './ProblemSubmissionList';
import TestSubmissionResultModal from './TestSubmissionResultModal';
import { authFetch } from '../services/auth';

export interface LanguageConfig {
  language: string;
  template_code: string;
  is_enabled: boolean;
}

export interface Problem {
  id: number | string;
  title: string;
  difficulty: string;
  time_limit: number;
  memory_limit: number;
  language_configs?: LanguageConfig[];
  translations?: any[];
  test_cases?: any[];
  score?: number; // For contest problems
}

export interface Submission {
  id: number;
  status: string;
  score: number;
  exec_time: number;
  memory_usage: number;
  error_message?: string;
}

interface ProblemSolverProps {
  problem: Problem;
  initialCode?: string;
  initialLanguage?: string;
  onSubmit: (code: string, language: string, isTest: boolean) => Promise<Submission | void>;
  isContestMode?: boolean;
  contestId?: string; // For fetching contest-specific submissions if needed
}

const ProblemSolver: React.FC<ProblemSolverProps> = ({
  problem,
  initialCode = '',
  initialLanguage = '',
  onSubmit,
  isContestMode = false,
  contestId
}) => {
  const [languageConfigs, setLanguageConfigs] = useState<LanguageConfig[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(initialLanguage);
  const [code, setCode] = useState<string>(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal states
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  
  // Test Result Modal state
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [testSubmission, setTestSubmission] = useState<Submission | null>(null);
  const [isPollingResult, setIsPollingResult] = useState(false);
  const pollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (problem.language_configs && problem.language_configs.length > 0) {
      setLanguageConfigs(problem.language_configs);
      if (!selectedLanguage) {
        const defaultLang = problem.language_configs.find((c: LanguageConfig) => c.is_enabled);
        if (defaultLang) {
          setSelectedLanguage(defaultLang.language);
          setCode(defaultLang.template_code || '');
        }
      }
    }
  }, [problem]);

  const handleLanguageChange = (item: any) => {
    const lang = item.selectedItem;
    setSelectedLanguage(lang.id);
    
    const config = languageConfigs.find(c => c.language === lang.id);
    if (config && (!code || code.trim() === '')) {
      setCode(config.template_code || '');
    }
  };

  const startPolling = (submissionId: number) => {
    setIsPollingResult(true);
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const url = isContestMode
              ? `/api/v1/contests/${contestId}/submissions/${submissionId}/` // Assuming this endpoint exists or similar
              : `/api/v1/submissions/${submissionId}/`;

          // Fallback to standard endpoint if contest specific one isn't distinct for polling details
          // Actually usually submission ID is unique globally so /api/v1/submissions/:id works
          const res = await authFetch(url);
        const data = await res.json();
        setTestSubmission(data);
        
        if (data.status !== 'judging' && data.status !== 'pending') {
          setIsPollingResult(false);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        }
      } catch (err) {
        console.error('Error polling submission:', err);
        setIsPollingResult(false);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      }
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleAction = async (isTest: boolean) => {
    if (!selectedLanguage) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await onSubmit(code, selectedLanguage, isTest);
      
      if (isTest && result) {
        // If it's a test submission, the parent should return the submission object
        // We handle polling here
        setIsTestModalOpen(false);
        setTestSubmission(result as Submission);
        setIsResultModalOpen(true);
        startPolling((result as Submission).id);
      } else {
        // Official submission handled by parent (redirect etc)
        setIsSubmitModalOpen(false);
      }
    } catch (err: any) {
      console.error('Submission error:', err);
      setError(err.message || '提交失敗，請稍後再試');
      setIsTestModalOpen(false);
      setIsSubmitModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const languageItems = languageConfigs
    .filter((c: LanguageConfig) => c.is_enabled)
    .map((c: LanguageConfig) => ({
      id: c.language,
      label: c.language === 'cpp' ? 'C++' : 
             c.language === 'python' ? 'Python' : 
             c.language === 'java' ? 'Java' : c.language
    }));

  return (
    <div className="problem-solver">
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>{problem.id}. {problem.title}</h2>
            {isContestMode && (
                <div style={{ fontWeight: 'bold', color: 'var(--cds-text-secondary)' }}>
                    分數: {problem.score}
                </div>
            )}
          </div>
          
          {error && (
            <InlineNotification
              kind="error"
              title="錯誤"
              subtitle={error}
              style={{ marginBottom: '1rem' }}
              onClose={() => setError(null)}
            />
          )}

          <Tabs>
            <TabList aria-label="Problem tabs">
              <Tab>題目描述</Tab>
              {!isContestMode && <Tab>提交歷史</Tab>}
            </TabList>
            <TabPanels>
              <TabPanel>
                <Grid>
                  <Column lg={8} md={8} sm={4}>
                    <ProblemPreview
                      title={problem.title}
                      difficulty={problem.difficulty}
                      timeLimit={problem.time_limit}
                      memoryLimit={problem.memory_limit}
                      translations={problem.translations}
                      testCases={problem.test_cases?.filter(tc => tc.is_sample)}
                      showLanguageToggle={problem.translations && problem.translations.length > 1}
                      compact={false}
                    />
                  </Column>

                  <Column lg={8} md={8} sm={4}>
                    <div className="editor-container" style={{ position: 'sticky', top: '2rem' }}>
                      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ width: '200px' }}>
                          <Dropdown
                            id="language-selector"
                            titleText="程式語言"
                            label="選擇語言"
                            items={languageItems}
                            itemToString={(item: any) => item ? item.label : ''}
                            selectedItem={languageItems.find(i => i.id === selectedLanguage)}
                            onChange={handleLanguageChange}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            kind="secondary"
                            renderIcon={Play}
                            onClick={() => setIsTestModalOpen(true)}
                            disabled={!selectedLanguage || submitting}
                          >
                            測試提交
                          </Button>
                          <Button
                            kind="primary"
                            renderIcon={Send}
                            onClick={() => setIsSubmitModalOpen(true)}
                            disabled={!selectedLanguage || submitting}
                          >
                            正式提交
                          </Button>
                        </div>
                      </div>

                      <div style={{ border: '1px solid #e0e0e0', height: '600px' }}>
                        <Editor
                          height="100%"
                          language={selectedLanguage === 'cpp' ? 'cpp' : selectedLanguage}
                          value={code}
                          onChange={(value) => setCode(value || '')}
                          theme="vs-dark"
                          onMount={(editor) => {
                            setTimeout(() => {
                              editor.layout();
                            }, 100);
                            document.fonts.ready.then(() => {
                              editor.layout();
                            });
                          }}
                          options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            lineHeight: 21,
                            letterSpacing: 0,
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                            fontLigatures: false,
                            fontFamily: "Consolas, 'Courier New', monospace",
                          }}
                        />
                      </div>
                    </div>
                  </Column>
                </Grid>
              </TabPanel>
              
              {!isContestMode && (
                <TabPanel>
                  <ProblemSubmissionList problemId={problem.id as number} />
                </TabPanel>
              )}
            </TabPanels>
          </Tabs>
        </Column>
      </Grid>

      <Modal
        open={isTestModalOpen}
        modalHeading="確認測試提交"
        primaryButtonText={submitting ? "提交中..." : "確認提交"}
        secondaryButtonText="取消"
        onRequestClose={() => setIsTestModalOpen(false)}
        onRequestSubmit={() => handleAction(true)}
        danger={false}
      >
        <p>測試提交將只評測公開測資，不會記錄到提交歷史中。</p>
        <p>確定要執行嗎？</p>
      </Modal>

      <Modal
        open={isSubmitModalOpen}
        modalHeading="確認正式提交"
        primaryButtonText={submitting ? "提交中..." : "確認提交"}
        secondaryButtonText="取消"
        onRequestClose={() => setIsSubmitModalOpen(false)}
        onRequestSubmit={() => handleAction(false)}
        danger={true}
      >
        <p>正式提交將評測所有測資並記錄到提交歷史中。</p>
        <p>確定要提交嗎？</p>
      </Modal>

      <TestSubmissionResultModal
        isOpen={isResultModalOpen}
        onClose={() => setIsResultModalOpen(false)}
        submission={testSubmission}
        isLoading={isPollingResult}
      />
    </div>
  );
};

export default ProblemSolver;
