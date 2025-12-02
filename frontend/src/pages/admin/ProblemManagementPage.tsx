import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InlineLoading,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel
} from '@carbon/react';
import { authFetch } from '@/services/auth';
import ProblemImportModal from '@/components/ProblemImportModal';
import ProblemTable from '@/components/common/ProblemTable';

interface Problem {
  id: number;
  title: string;
  difficulty: string;
  submission_count: number;
  accepted_count: number;
  is_visible: boolean;
  created_by: string;
  created_at: string;

  is_practice_visible?: boolean;
  created_in_contest?: any;
}

const ProblemManagementPage = () => {
  const navigate = useNavigate();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    fetchProblems();
  }, []);

  const fetchProblems = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await authFetch('/api/v1/problems/?scope=manage');
      
      if (res.ok) {
        const data = await res.json();
        setProblems(data.results || data);
      } else {
        setError('Failed to load problems');
      }
    } catch (err) {
      setError('Failed to load problems');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImportProblem = async (problemData: any) => {
    try {
      const res = await authFetch('/api/v1/problems/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(problemData)
      });

      if (res.ok) {
        const createdProblem = await res.json();
        // Refresh the problem list
        fetchProblems();
        return createdProblem.id; // Return the problem ID
      } else {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to create problem');
      }
    } catch (error: any) {
      throw error;
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        <InlineLoading description="Loading problems..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          題目管理
        </h1>
        <p style={{ color: 'var(--cds-text-secondary)' }}>
          管理您建立的題目
        </p>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fff1f1', border: '1px solid #da1e28', borderRadius: '4px', color: '#da1e28' }}>
          {error}
        </div>
      )}

      <Tabs selectedIndex={selectedTab} onChange={({ selectedIndex }) => setSelectedTab(selectedIndex)}>
        <TabList aria-label="Problem type tabs">
          <Tab>全部題目 ({problems.length})</Tab>
          <Tab>練習題目 ({problems.filter(p => p.is_practice_visible).length})</Tab>
          <Tab>競賽題目 ({problems.filter(p => !p.is_practice_visible).length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>{renderTable(problems)}</TabPanel>
          <TabPanel>{renderTable(problems.filter(p => p.is_practice_visible))}</TabPanel>
          <TabPanel>{renderTable(problems.filter(p => !p.is_practice_visible))}</TabPanel>
        </TabPanels>
      </Tabs>

      <ProblemImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportProblem}
      />
    </div>
  );

  function renderTable(filteredProblems: Problem[]) {
    return (
      <ProblemTable
        problems={filteredProblems}
        mode="admin"
        onAction={handleAction}
        onImport={() => setImportModalOpen(true)}
        onAdd={() => navigate('/admin/problems/new')}
      />
    );
  }

  function handleAction(action: string, problem: any) {
    if (action === 'view') {
      navigate(`/problems/${problem.id}`);
    } else if (action === 'edit') {
      navigate(`/admin/problems/${problem.id}/edit`);
    } else if (action === 'delete') {
      handleDelete(problem);
    }
  }

  async function handleDelete(problem: any) {
    if (confirm(`確定要刪除題目「${problem.title}」嗎？`)) {
      try {
        const res = await authFetch(`/api/v1/problems/${problem.id}/`, {
          method: 'DELETE'
        });
      
        if (res.ok) {
          fetchProblems();
        } else {
          alert('刪除失敗');
        }
      } catch (err) {
        alert('刪除失敗');
        console.error(err);
      }
    }
  }
};

export default ProblemManagementPage;
