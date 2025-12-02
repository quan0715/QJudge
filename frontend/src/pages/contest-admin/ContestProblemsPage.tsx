import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Button, InlineNotification, Modal, TextInput } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import { api } from '@/services/api';
import type { ContestDetail } from '@/models/contest';
import ContainerCard from '@/components/contest/layout/ContainerCard';
import ProblemTable from '@/components/common/ProblemTable';

interface ContestAdminContext {
  contest: ContestDetail;
  refreshContest: () => void;
}

const ContestProblemsPage: React.FC = () => {
  const { contest, refreshContest } = useOutletContext<ContestAdminContext>();
  const navigate = useNavigate();
  
  const [problems, setProblems] = useState<any[]>([]);
  const [notification, setNotification] = useState<{ kind: 'success' | 'error', message: string } | null>(null);
  
  const [addProblemModalOpen, setAddProblemModalOpen] = useState(false);
  const [newProblemTitle, setNewProblemTitle] = useState('');
  const [newProblemId, setNewProblemId] = useState('');

  useEffect(() => {
    if (contest && contest.problems) {
      setProblems(contest.problems);
    }
  }, [contest]);

  const loadProblems = async () => {
    if (!contest.id) return;
    try {
      const data = await api.getContest(contest.id.toString());
      if (data && data.problems) {
        setProblems(data.problems);
        // Also refresh the parent context if needed, but local state is enough for the table
        refreshContest(); 
      }
    } catch (error) {
      console.error('Failed to load problems', error);
    }
  };

  const handleAddProblem = async () => {
    if (!contest.id) return;
    try {
      if (newProblemId) {
        await api.addContestProblem(contest.id.toString(), { problem_id: newProblemId });
      } else if (newProblemTitle) {
        await api.addContestProblem(contest.id.toString(), { title: newProblemTitle });
      }
      setAddProblemModalOpen(false);
      setNewProblemId('');
      setNewProblemTitle('');
      loadProblems();
      setNotification({ kind: 'success', message: '題目已新增' });
    } catch (error) {
      console.error('Failed to add problem', error);
      setNotification({ kind: 'error', message: '新增題目失敗' });
    }
  };

  const handleRemoveProblem = async (problemId: string) => {
    if (!contest.id || !confirm('確定要從競賽中移除此題目嗎？')) return;
    try {
      await api.removeContestProblem(contest.id.toString(), problemId);
      loadProblems();
      setNotification({ kind: 'success', message: '題目已移除' });
    } catch (error) {
      console.error('Failed to remove problem', error);
      setNotification({ kind: 'error', message: '移除題目失敗' });
    }
  };

  return (
    <div>
      {notification && (
        <InlineNotification
          kind={notification.kind}
          title={notification.kind === 'success' ? '成功' : '錯誤'}
          subtitle={notification.message}
          onClose={() => setNotification(null)}
          style={{ marginBottom: '1rem', maxWidth: '100%' }}
        />
      )}

      <ContainerCard 
        title="題目列表" 
        action={
          <Button size="sm" renderIcon={Add} onClick={() => setAddProblemModalOpen(true)}>
            新增題目
          </Button>
        }
        noPadding
      >
        <ProblemTable
          problems={problems.map(p => ({
            ...p,
            id: p.problem_id?.toString() || p.id.toString(),
            label: p.label || '-',
            order: p.order || 0,
            score: p.score || 0
          }))}
          mode="contest"
          onAction={(action, problem) => {
            if (action === 'edit') {
              navigate(`/teacher/contests/${contest.id}/problems/${problem.id}/edit`);
            } else if (action === 'delete') {
              handleRemoveProblem(problem.id.toString());
            }
          }}
          onAdd={() => setAddProblemModalOpen(true)}
        />
      </ContainerCard>

      {/* Add Problem Modal */}
      <Modal
        open={addProblemModalOpen}
        modalHeading="新增題目"
        primaryButtonText="新增"
        secondaryButtonText="取消"
        onRequestSubmit={handleAddProblem}
        onRequestClose={() => setAddProblemModalOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TextInput
            id="problem-id"
            labelText="題目 ID (可選)"
            placeholder="輸入現有題目 ID"
            value={newProblemId}
            onChange={(e) => setNewProblemId(e.target.value)}
          />
          <div style={{ textAlign: 'center', color: 'var(--cds-text-secondary)' }}>- 或 -</div>
          <TextInput
            id="problem-title"
            labelText="題目名稱 (建立新題目)"
            placeholder="輸入新題目名稱"
            value={newProblemTitle}
            onChange={(e) => setNewProblemTitle(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ContestProblemsPage;
