import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Grid,
  Column,
  InlineNotification,
} from '@carbon/react';
import { getProblems, createProblem } from '@/services/problem';
import ProblemImportModal from '@/domains/problem/components/ProblemImportModal';
import CreateProblemModal from '@/domains/problem/components/CreateProblemModal';
import ProblemTable from '@/domains/problem/components/ProblemTable';
import type { Problem } from '@/core/entities/problem.entity';

const ProblemManagementPage = () => {
  const navigate = useNavigate();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    fetchProblems();
  }, []);

  const fetchProblems = async () => {
    setLoading(true);
    setError('');
    
    try {
      const rawProblems = await getProblems('manage');
      setProblems(rawProblems);
    } catch (err) {
      setError('Failed to load problems');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportProblem = async (problemData: any) => {
    try {
      const createdProblem = await createProblem(problemData);
      fetchProblems();
      return createdProblem.id;
    } catch (error: any) {
      throw error;
    }
  };

  const handleAction = (action: string, problem: any) => {
    if (action === 'edit') {
      // Navigate to problem page with settings tab
      navigate(`/problems/${problem.id}?tab=settings`);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', backgroundColor: 'var(--cds-background)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <div style={{ marginTop: '3rem', marginBottom: '2rem' }}>
              <h1 style={{ 
                fontSize: 'var(--cds-productive-heading-05, 2rem)', 
                fontWeight: 400, 
                color: 'var(--cds-text-primary)' 
              }}>
                題目管理
              </h1>
            </div>

            {error && (
              <InlineNotification
                kind="error"
                title="Error"
                subtitle={error}
                onClose={() => setError('')}
                lowContrast
                style={{ marginBottom: '1rem' }}
              />
            )}

            <Tabs selectedIndex={selectedTab} onChange={({ selectedIndex }: any) => setSelectedTab(selectedIndex)}>
              <TabList aria-label="Problem tabs">
                <Tab>所有題目 ({problems.length})</Tab>
                <Tab>練習題目 ({problems.filter(p => p.isPracticeVisible).length})</Tab>
                <Tab>競賽題目 ({problems.filter(p => !p.isPracticeVisible).length})</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                  <ProblemTable
                    problems={problems as any}
                    mode="admin"
                    loading={loading}
                    onAction={handleAction}
                    onImport={() => setImportModalOpen(true)}
                    onAdd={() => setCreateModalOpen(true)}
                  />
                </TabPanel>
                <TabPanel>
                  <ProblemTable
                    problems={problems.filter(p => p.isPracticeVisible) as any}
                    mode="admin"
                    loading={loading}
                    onAction={handleAction}
                    onImport={() => setImportModalOpen(true)}
                    onAdd={() => setCreateModalOpen(true)}
                  />
                </TabPanel>
                <TabPanel>
                  <ProblemTable
                    problems={problems.filter(p => !p.isPracticeVisible) as any}
                    mode="admin"
                    loading={loading}
                    onAction={handleAction}
                    onImport={() => setImportModalOpen(true)}
                    onAdd={() => setCreateModalOpen(true)}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>

            <ProblemImportModal
              open={importModalOpen}
              onClose={() => setImportModalOpen(false)}
              onImport={handleImportProblem}
            />

            <CreateProblemModal
              open={createModalOpen}
              onClose={() => setCreateModalOpen(false)}
              onCreated={fetchProblems}
            />
          </Column>
        </Grid>
      </div>
    </div>
  );
};

export default ProblemManagementPage;
