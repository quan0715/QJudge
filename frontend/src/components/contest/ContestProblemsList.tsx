import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  Button
} from '@carbon/react';
import { ArrowUp, ArrowDown, Launch } from '@carbon/icons-react';
import type { ContestProblemSummary } from '@/types/contest';
import { useNavigate } from 'react-router-dom';

interface ContestProblemsListProps {
  contestId: string;
  problems: ContestProblemSummary[];
  isTeacherView?: boolean;
  onReorder?: (problemId: string, direction: 'up' | 'down') => void;
  onPublish?: (problemId: string) => void;
  showPublishButton?: boolean;
  canViewProblems?: boolean;
}

const ContestProblemsList: React.FC<ContestProblemsListProps> = ({
  contestId,
  problems,
  isTeacherView = false,
  onReorder,
  onPublish,
  showPublishButton = false,
  canViewProblems = true
}) => {
  const navigate = useNavigate();

  const getStatusTag = (status?: string) => {
    switch (status) {
      case 'AC':
        return <Tag type="green">已通過</Tag>;
      case 'WA':
      case 'attempted':
        return <Tag type="magenta">嘗試中</Tag>;
      default:
        return <Tag type="gray">未解</Tag>;
    }
  };

  const headers = [
    { key: 'label', header: '編號' },
    { key: 'title', header: '題目' },
    { key: 'status', header: '狀態' },
    ...(isTeacherView ? [{ key: 'actions', header: '操作' }] : [])
  ];

  const rows = problems.map((problem, index) => ({
    id: problem.id,
    problem_id: problem.problem_id,
    label: problem.label,
    title: problem.title,
    status: getStatusTag(problem.user_status),
    actions: isTeacherView ? (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {onReorder && index > 0 && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowUp}
            iconDescription="上移"
            hasIconOnly
            onClick={(e) => {
              e.stopPropagation();
              onReorder(problem.id, 'up');
            }}
          />
        )}
        {onReorder && index < problems.length - 1 && (
          <Button
            kind="ghost"
            size="sm"
            renderIcon={ArrowDown}
            iconDescription="下移"
            hasIconOnly
            onClick={(e) => {
              e.stopPropagation();
              onReorder(problem.id, 'down');
            }}
          />
        )}
        {showPublishButton && onPublish && (
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Launch}
            onClick={(e) => {
              e.stopPropagation();
              onPublish(problem.id);
            }}
          >
            發布到練習
          </Button>
        )}
      </div>
    ) : null
  }));

  return (
    <DataTable rows={rows} headers={headers}>
      {({ rows, headers, getHeaderProps, getTableProps, getRowProps }) => (
        <TableContainer title="競賽題目">
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader {...getHeaderProps({ header })} key={header.key}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  {...getRowProps({ row })}
                  key={row.id}
                  onClick={() => {
                    if (!canViewProblems && !isTeacherView) {
                        alert('請先開始競賽以查看題目');
                        return;
                    }
                    const problem = problems.find(p => p.id === row.id);
                    if (problem) {
                      const searchParams = new URLSearchParams(window.location.search);
                      navigate({
                        pathname: `/contests/${contestId}/problems/${problem.problem_id}`,
                        search: searchParams.toString()
                      });
                    }
                  }}
                  style={{ cursor: (canViewProblems || isTeacherView) ? 'pointer' : 'not-allowed' }}
                >
                  {row.cells.map((cell) => (
                    <TableCell key={cell.id}>{cell.value}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
};

export default ContestProblemsList;
