
import React, { useState, useEffect } from 'react';
import { InlineNotification, Modal } from '@carbon/react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import type { ProblemDetail as Problem, LanguageConfig } from '@/core/entities/problem.entity';
import type { SubmissionDetail } from '@/core/entities/submission.entity';
import { LANGUAGE_OPTIONS, DEFAULT_TEMPLATES } from '@/constants/codeTemplates';

// Layout Components
import ProblemHero from './layout/ProblemHero';
import ProblemTabs from './layout/ProblemTabs';

// Tab Contents
import ProblemCodingTab from './solver/ProblemCodingTab';
import { ProblemDescriptionTab, ProblemHistoryTab, ProblemStatsTab, ProblemSettingsTab } from './solver/ProblemTabsContent';
import { type TestCase } from './solver/TestCasePanel';
import { SubmissionDetailModal } from '@/components/submission/SubmissionDetailModal';

interface ProblemSolverProps {
  problem: Problem;
  initialCode?: string;
  initialLanguage?: string;
  onSubmit: (code: string, language: string, isTest: boolean, customTestCases?: any[]) => Promise<SubmissionDetail | void>;
  isContestMode?: boolean;
  contestId?: string;
  readOnly?: boolean;
  hideHero?: boolean;
}

const ProblemSolver: React.FC<ProblemSolverProps> = ({
  problem,
  initialCode = '',
  initialLanguage = '',
  onSubmit,
  contestId,
  hideHero = false
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  
  // -- State: Tabs --
  const [activeTab, setActiveTab] = useState(0); // 0: Description, 1: Solver, 2: History, 3: Stats, 4: Settings

  // -- State: Code & Language --
  const [activeLanguage, setActiveLanguage] = useState<string>(initialLanguage || 'python');
  const [code, setCode] = useState<string>(initialCode);
  const [languageConfigs, setLanguageConfigs] = useState<LanguageConfig[]>([]);

  // -- State: Test Cases --
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  
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
    const publicCases: TestCase[] = (problem.testCases || [])
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


    let customCases: TestCase[] = [];
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
      const newCase: TestCase = {
          id: `custom_${Date.now()}`,
          input,
          output,
          source: 'custom',
          enabled: true
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

  const handleToggleTestCase = (id: string, enabled: boolean) => {
      setTestCases(prev => {
          const next = prev.map(tc => tc.id === id ? { ...tc, enabled } : tc);
          saveCustomCases(next); // Save enabled state too? Requirement says "enabled state"
          return next;
      });
  };

  const saveCustomCases = (cases: TestCase[]) => {
      if (typeof window === 'undefined') return;
      const customOnly = cases.filter(c => c.source === 'custom');
      localStorage.setItem(getCustomCasesKey(), JSON.stringify(customOnly));
  };


  // -- Action Handlers --
  const handleRunTest = async () => {
      setSubmitting(true);
      setError(null);
      try {
          // Prepare payload: filter enabled cases, AND EXCLUDE public/sample cases
          // (Backend automatically includes sample cases for test runs)
          const customPayload = testCases
            .filter(tc => tc.enabled && tc.source !== 'public')
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
                onToggleTestCase={handleToggleTestCase}
                onRunTest={handleRunTest}
                onSubmit={() => setIsSubmitModalOpen(true)} // Open modal for full submit
                running={submitting}
                theme={theme}
            />
          );
          case 2: return <ProblemHistoryTab problemId={problem.id as string} />;
          case 3: return <ProblemStatsTab />;
          case 4: return <ProblemSettingsTab />;
          default: return null;
      }
  };

  const isAdmin = user && (user.role === 'admin' || user.role === 'teacher'); // Simple role check

  return (
    <div style={{ minHeight: '100vh', paddingBottom: '3rem' }}>
       {/* Hero */}
       {!hideHero && (
         <ProblemHero 
            problem={problem} 
            bottomContent={
                <ProblemTabs 
                    selectedIndex={activeTab} 
                    onChange={setActiveTab} 
                    isAdmin={!!isAdmin}
                />
            }
       />
       )}
       
       {/* If Hero is hidden, we might still need the tabs! 
           But wait, if Hero is hidden, usually the parent renders the Hero AND the Tabs.
           Or maybe we want ProblemSolver to ONLY be the "Content".
           Let's assume if hideHero is true, the parent handles Tabs too? 
           Actually, the Tabs switch the content view *inside* ProblemSolver (Description vs Solver etc).
           So we definitely need the Tabs.
           If hideHero is true, we should probably render the Tabs standalone at the top.
       */}
       {hideHero && (
          <div style={{ backgroundColor: 'var(--cds-layer-01)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <ProblemTabs 
                    selectedIndex={activeTab} 
                    onChange={setActiveTab} 
                    isAdmin={!!isAdmin}
                />
          </div>
       )}
       
       {/* Error Banner */}
       {error && (
            <div style={{ maxWidth: '100%', padding: '1rem 2.5rem' }}>
                <InlineNotification
                kind="error"
                title="Error"
                subtitle={error}
                onClose={() => setError(null)}
                />
            </div>
        )}

       {/* Content Area */}
        <div style={{ 
            marginTop: '0', // Tabs stick to hero, so content starts immediately
            padding: '2rem 2.5rem',
            backgroundColor: 'var(--cds-background)', // or transparent 
            minHeight: '400px'
        }}>
            <div style={{ 
                backgroundColor: 'var(--cds-layer-01)', 
                minHeight: '100%',
                padding: activeTab === 1 ? '0' : '2rem', // No padding for Solver Tab (full width/height)
                boxShadow: '0 1px 2px 0 rgba(0,0,0,0.1)'
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
