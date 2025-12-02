import React from 'react';
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Tag
} from '@carbon/react';
import { Edit, TrashCan, View, Upload, Add } from '@carbon/icons-react';

export interface ProblemData {
  id: string | number;
  title: string;
  difficulty?: string;
  submission_count?: number;
  accepted_count?: number;
  is_visible?: boolean;
  is_practice_visible?: boolean;
  created_by?: string;
  created_at?: string;
  
  // Contest specific
  label?: string;
  order?: number;
  score?: number;
  problem_id?: number; // Real problem ID if different from contest problem ID
}

interface ProblemTableProps {
  problems: ProblemData[];
  mode: 'admin' | 'contest';
  loading?: boolean;
  onAction?: (action: string, problem: ProblemData) => void;
  // Admin specific props
  onImport?: () => void;
  onAdd?: () => void;
  // Contest specific props
  currentUserRole?: string;
}

const ProblemTable: React.FC<ProblemTableProps> = ({
  problems,
  mode,
  onAction,
  onImport,
  onAdd
}) => {

  const getDifficultyTag = (difficulty?: string) => {
    if (!difficulty) return <Tag type="gray">-</Tag>;
    const config = {
      'easy': { label: '簡單', type: 'green' },
      'medium': { label: '中等', type: 'cyan' },
      'hard': { label: '困難', type: 'red' }
    } as const;
    
    const { label, type } = config[difficulty as keyof typeof config] || { label: difficulty, type: 'gray' };
    return <Tag type={type as any}>{label}</Tag>;
  };

  const getAcceptanceRate = (problem: ProblemData) => {
    if (!problem.submission_count) return '0%';
    return `${(((problem.accepted_count || 0) / problem.submission_count) * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const getHeaders = () => {
    if (mode === 'contest') {
      return [
        { key: 'order', header: '順序' },
        { key: 'label', header: '標號' },
        { key: 'title', header: '標題' },
        { key: 'difficulty', header: '難度' },
        { key: 'score', header: '分數' },
        { key: 'actions', header: '操作' }
      ];
    }
    return [
      { key: 'id', header: 'ID' },
      { key: 'title', header: '標題' },
      { key: 'difficulty', header: '難度' },
      { key: 'type', header: '類型' },
      { key: 'stats', header: '統計' },
      { key: 'visibility', header: '狀態' },
      { key: 'created_by', header: '作者' },
      { key: 'created_at', header: '建立時間' },
      { key: 'actions', header: '操作' },
    ];
  };

  const rows = problems.map(p => ({
    ...p,
    id: p.id.toString(),
    // Ensure required fields for sorting/filtering
    title: p.title || '',
    difficulty: p.difficulty || '',
    created_at: p.created_at || ''
  }));

  return (
    <DataTable rows={rows} headers={getHeaders()}>
      {({ rows, headers, getTableProps, getHeaderProps, getRowProps, onInputChange }) => (
        <TableContainer>
          {mode === 'admin' && (
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch onChange={(e) => { if (e && typeof e !== 'string') onInputChange(e); }} placeholder="搜尋題目..." />
                {onImport && (
                  <Button kind="secondary" renderIcon={Upload} onClick={onImport}>
                    匯入 YAML
                  </Button>
                )}
                {onAdd && (
                  <Button kind="primary" renderIcon={Add} onClick={onAdd}>
                    新增題目
                  </Button>
                )}
              </TableToolbarContent>
            </TableToolbar>
          )}
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
              {rows.map((row) => {
                const problem = problems.find(p => p.id.toString() === row.id);
                if (!problem) return null;

                return (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {mode === 'contest' ? (
                      // Contest Mode Columns
                      <>
                        <TableCell>{problem.order}</TableCell>
                        <TableCell>
                          <Tag type="cyan">{problem.label}</Tag>
                        </TableCell>
                        <TableCell>{problem.title}</TableCell>
                        <TableCell>{getDifficultyTag(problem.difficulty)}</TableCell>
                        <TableCell>{problem.score}</TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button 
                              kind="ghost" 
                              size="sm" 
                              renderIcon={Edit}
                              onClick={() => onAction?.('edit', problem)}
                            >
                              編輯
                            </Button>
                            <Button 
                              kind="ghost" 
                              size="sm" 
                              renderIcon={TrashCan}
                              onClick={() => onAction?.('delete', problem)}
                              style={{ color: 'var(--cds-text-error)' }}
                            >
                              移除
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      // Admin Mode Columns
                      <>
                        <TableCell>{problem.id}</TableCell>
                        <TableCell>
                          <div style={{ fontWeight: 500 }}>{problem.title}</div>
                        </TableCell>
                        <TableCell>{getDifficultyTag(problem.difficulty)}</TableCell>
                        <TableCell>
                          {!problem.is_practice_visible ? (
                            <Tag type="purple">競賽</Tag>
                          ) : (
                            <Tag type="blue">練習</Tag>
                          )}
                        </TableCell>
                        <TableCell>
                          <div style={{ fontSize: '0.875rem', display: 'flex', gap: '1rem' }}>
                            <span>提交: <strong>{problem.submission_count}</strong></span>
                            <span>通過: <strong>{problem.accepted_count}</strong></span>
                            <span>通過率: <strong>{getAcceptanceRate(problem)}</strong></span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {problem.is_visible ? (
                            <Tag type="green">可見</Tag>
                          ) : (
                            <Tag type="gray">隱藏</Tag>
                          )}
                        </TableCell>
                        <TableCell>{problem.created_by || '-'}</TableCell>
                        <TableCell>{formatDate(problem.created_at)}</TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={View}
                              iconDescription="查看"
                              hasIconOnly
                              onClick={() => onAction?.('view', problem)}
                            />
                            {/* Check permissions locally or assume parent handles it via onAction */}
                            <Button
                              kind="ghost"
                              size="sm"
                              renderIcon={Edit}
                              iconDescription="編輯"
                              hasIconOnly
                              onClick={() => onAction?.('edit', problem)}
                            />
                            <Button
                              kind="danger--ghost"
                              size="sm"
                              renderIcon={TrashCan}
                              iconDescription="刪除"
                              hasIconOnly
                              onClick={() => onAction?.('delete', problem)}
                            />
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
};

export default ProblemTable;
