
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { InlineNotification, Modal } from '@carbon/react';
import { useTheme } from '@/ui/theme/ThemeContext';
import { useAuth } from '@/domains/auth/contexts/AuthContext';
import type { ProblemDetail as Problem, LanguageConfig } from '@/core/entities/problem.entity';
import type { SubmissionDetail } from '@/core/entities/submission.entity';
import { LANGUAGE_OPTIONS, DEFAULT_TEMPLATES } from '@/domains/problem/constants/codeTemplates';

// Layout Components
import ProblemHero from './layout/ProblemHero';
import ProblemTabs from './layout/ProblemTabs';

// Tab Contents
import ProblemCodingTab from './solver/ProblemCodingTab';
import { ProblemDescriptionTab, ProblemHistoryTab, ProblemStatsTab, ProblemSettingsTab } from './solver/ProblemTabsContent';
import { type TestCaseItem } from '@/domains/problem/components/common/TestCaseList';
import { SubmissionDetailModal } from '@/domains/submission/components/SubmissionDetailModal';

interface ProblemSolverProps {
  problem: Problem;
  initialCode?: string;
  initialLanguage?: string;
  onSubmit: (code: string, language: string, isTest: boolean, customTestCases?: any[]) => Promise<SubmissionDetail | void>;
  // Contest mode props
  contestId?: string;
  contestName?: string;
  problemScore?: number;
  problemLabel?: string;
  // Callbacks
  onProblemUpdate?: (problem: Problem) => void;
}

const ProblemSolver: React.FC<ProblemSolverProps> = ({
  problem,
  initialCode = '',
  initialLanguage = '',
  onSubmit,
  contestId,
  contestName,
  problemScore,
  problemLabel,
  onProblemUpdate: _onProblemUpdate  // Will be used in Settings Tab
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Tab key to index mapping
  const TAB_KEYS = ['description', 'solver', 'history', 'stats', 'settings'];
  
  // Get initial tab from URL or default to 0
  const getInitialTab = () => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const index = TAB_KEYS.indexOf(tabParam);
      if (index !== -1) return index;
    }
    return 0;
  };
  
  // -- State: Tabs --
  const [activeTab, setActiveTab] = useState(getInitialTab);
  
  // Handle tab change with URL sync
  const handleTabChange = (index: number) => {
    setActiveTab(index);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', TAB_KEYS[index]);
    setSearchParams(newParams, { replace: true });
  };

  // -- State: Code & Language --
  const [activeLanguage, setActiveLanguage] = useState<string>(initialLanguage || 'python');
  const [code, setCode] = useState<string>(initialCode);
  const [languageConfigs, setLanguageConfigs] = useState<LanguageConfig[]>([]);

  // -- State: Test Cases --
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);
  
  // -- State: Submission --
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // -- State: Modals --
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [resultSubmissionId, setResultSubmissionId] = useState<string | null>(null);

  // -- Persistence Keys --
  const getCodeKey = (lang: string) => `qjudge:problem:${problem.id}:code:${lang}`;
  const getCustomCasesKey = () => `qjudge:problem:${problem.id}:custom_test_cases`;

  // -- Init Logic --
  useEffect(() => {
    if (!problem) return;

    // 1. Language Configs
    let configs = problem.languageConfigs || [];
    if (configs.length === 0) {
        configs = LANGUAGE_OPTIONS.map(opt => ({
            language: opt.id,
            templateCode: DEFAULT_TEMPLATES[opt.id] || '',
            isEnabled: true
        }));
    }
    setLanguageConfigs(configs);

    // 2. Select Language
    let targetLang = activeLanguage;
    if (!configs.find(c => c.language === targetLang)) {
        targetLang = configs.find(c => c.isEnabled)?.language || 'python';
        setActiveLanguage(targetLang);
    }

    // 3. Load Code (Storage -> Template)
    if (typeof window !== 'undefined') {
        const savedCode = localStorage.getItem(getCodeKey(targetLang));
        if (savedCode) {
            setCode(savedCode);
        } else {
            const tmpl = configs.find(c => c.language === targetLang)?.templateCode;
            setCode(tmpl || '');
        }
    }

    // 4. Load Test Cases (Public + Custom from Storage)
    const publicCases: TestCaseItem[] = (problem.testCases || [])
        .filter(tc => tc.isSample)
        .map((tc, idx) => ({
            id: `public_${idx}`,
            input: tc.input,
            output: tc.output,
            isSample: true,
            source: 'public',
            enabled: true
        }));
    
    // Also include problem.samples if available


    let customCases: TestCaseItem[] = [];
    if (typeof window !== 'undefined') {
        try {
            const savedCustom = localStorage.getItem(getCustomCasesKey());
            if (savedCustom) {
                const parsed = JSON.parse(savedCustom);
                if (Array.isArray(parsed)) {
                    customCases = parsed;
                }
            }
        } catch (e) {
            console.error('Failed to parse custom test cases', e);
        }
    }

    setTestCases([...publicCases, ...customCases]);

  }, [problem.id]); // Re-run if problem changes

  // -- Code Change & Persistence --
  useEffect(() => {
    if (activeLanguage && code && typeof window !== 'undefined') {
        localStorage.setItem(getCodeKey(activeLanguage), code);
    }
  }, [code, activeLanguage, problem.id]);

  // -- Language Change Handler --
  const handleLanguageChange = (newLang: string) => {
      setActiveLanguage(newLang);
      // Load code for this language
      const savedCode = localStorage.getItem(getCodeKey(newLang));
      if (savedCode) {
          setCode(savedCode);
      } else {
          const tmpl = languageConfigs.find(c => c.language === newLang)?.templateCode;
          setCode(tmpl || '');
      }
  };

  // -- Test Case Handlers --
  const handleAddTestCase = (input: string, output: string) => {
      const newCase: TestCaseItem = {
          id: `custom_${Date.now()}`,
          input,
          output,
          source: 'custom'
      };
      setTestCases(prev => {
          const next = [...prev, newCase];
          saveCustomCases(next);
          return next;
      });
  };

  const handleDeleteTestCase = (id: string) => {
      setTestCases(prev => {
          const next = prev.filter(tc => tc.id !== id);
          saveCustomCases(next);
          return next;
      });
  };



  const saveCustomCases = (cases: TestCaseItem[]) => {
      if (typeof window === 'undefined') return;
      const customOnly = cases.filter(c => c.source === 'custom');
      localStorage.setItem(getCustomCasesKey(), JSON.stringify(customOnly));
  };


  // -- Action Handlers --
  const handleRunTest = async () => {
      setSubmitting(true);
      setError(null);
      try {
          // Prepare payload: filter custom cases
          const customPayload = testCases
            .filter(tc => tc.source !== 'public')
            .map(tc => ({
                input: tc.input,
                output: tc.output || '' 
            }));
            
          const result = await onSubmit(code, activeLanguage, true, customPayload);
           if (result) {
               setResultSubmissionId((result as SubmissionDetail).id);
               setIsResultModalOpen(true);
           }
      } catch (err: any) {
          setError(err.message || 'Test Run Failed');
      } finally {
          setSubmitting(false);
      }
  };

  const handleFullSubmit = async () => {
      setSubmitting(true);
      setError(null);
      try {
          const result = await onSubmit(code, activeLanguage, false); // isTest=False, no custom cases
           if (result) {
               setIsSubmitModalOpen(false);
               setResultSubmissionId((result as SubmissionDetail).id);
               setIsResultModalOpen(true);
           }
      } catch (err: any) {
          setError(err.message || 'Submission Failed');
      } finally {
          setSubmitting(false);
      }
  };

  // -- Render Tab Content --
  const renderTabContent = () => {
      // 0: Description, 1: Solver, 2: History, 3: Stats, 4: Settings
      switch (activeTab) {
          case 0: return <ProblemDescriptionTab problem={problem} />;
          case 1: return (
            <ProblemCodingTab 
                code={code}
                setCode={setCode}
                language={activeLanguage}
                setLanguage={handleLanguageChange}
                languageConfigs={languageConfigs}
                testCases={testCases}
                onAddTestCase={handleAddTestCase}
                onDeleteTestCase={handleDeleteTestCase}
                onRunTest={handleRunTest}
                onSubmit={() => setIsSubmitModalOpen(true)}
                running={submitting}
                theme={theme}
            />
          );
          case 2: return <ProblemHistoryTab problemId={problem.id as string} contestId={contestId} />;
          case 3: return <ProblemStatsTab problem={problem} contestId={contestId} />;
          case 4: return <ProblemSettingsTab problem={problem} />;
          default: return null;
      }
  };

  const isAdmin = user && (user.role === 'admin' || user.role === 'teacher');
  const isContestMode = !!contestId;
  
  // Consistent content width for alignment
  const contentMaxWidth = '1056px';

  // Show full UI with hero and tabs for all modes
  return (
    <div style={{ minHeight: '100vh', width: '100%', paddingBottom: 'var(--cds-spacing-09, 3rem)' }}>
       {/* Hero with embedded Tabs */}
       <ProblemHero 
          problem={problem} 
          contestMode={isContestMode}
          contestId={contestId}
          contestName={contestName}
          problemScore={problemScore}
          problemLabel={problemLabel}
          maxWidth={contentMaxWidth}
          bottomContent={
              <ProblemTabs 
                  selectedIndex={activeTab} 
                  onChange={handleTabChange} 
                  isAdmin={!!isAdmin}
                  maxWidth={contentMaxWidth}
              />
          }
       />
       
       {/* Error Banner */}
       {error && (
            <div style={{ padding: 'var(--cds-spacing-05, 1rem)' }}>
                <InlineNotification
                kind="error"
                title="Error"
                subtitle={error}
                onClose={() => setError(null)}
                />
            </div>
        )}

        {/* Content Area - Aligned with Hero */}
        <div style={{ 
            minHeight: '400px',
            width: '100%',
            backgroundColor: 'var(--cds-layer-01)',
        }}>
            <div style={{
              maxWidth: contentMaxWidth,
              margin: '0 auto',
              width: '100%',
              padding: activeTab === 1 ? '0 1rem' : 'var(--cds-spacing-07, 2rem) 1rem',
            }}>
              {renderTabContent()}
            </div>
        </div>

        <Modal
            open={isSubmitModalOpen}
            modalHeading="Confirm Submission"
            primaryButtonText={submitting ? "Submitting..." : "Submit"}
            secondaryButtonText="Cancel"
            onRequestClose={() => setIsSubmitModalOpen(false)}
            onRequestSubmit={handleFullSubmit}
            danger
        >
            <p>Are you sure you want to submit your solution?</p>
            <p>This will be evaluated against all hidden test cases.</p>
        </Modal>

        <SubmissionDetailModal
            isOpen={isResultModalOpen}
            onClose={() => setIsResultModalOpen(false)}
            submissionId={resultSubmissionId}
            contestId={contestId}
        />
    </div>
  );
};

export default ProblemSolver;
