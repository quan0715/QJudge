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
  Tag,
  Button
} from '@carbon/react';
import { View } from '@carbon/icons-react';

export interface SubmissionRow {
  id: string;
  status: string;
  problem_id?: number;
  problem_title?: string;
  username?: string;
  language: string;
  score: number;
  exec_time: number;
  created_at: string;
}

interface SubmissionTableProps {
  submissions: SubmissionRow[];
  onViewDetails: (submissionId: string) => void;
  showProblem?: boolean;
  showUser?: boolean;
  showScore?: boolean;
}

export const SubmissionTable: React.FC<SubmissionTableProps> = ({
  submissions,
  onViewDetails,
  showProblem = true,
  showUser = true,
  showScore = true
}) => {
  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { type: any; label: string }> = {
      'AC': { type: 'green', label: 'AC' },
      'WA': { type: 'red', label: 'WA' },
      'TLE': { type: 'magenta', label: 'TLE' },
      'MLE': { type: 'magenta', label: 'MLE' },
      'RE': { type: 'red', label: 'RE' },
      'CE': { type: 'gray', label: 'CE' },
      'pending': { type: 'gray', label: 'Pending' },
      'judging': { type: 'blue', label: 'Judging' },
      'SE': { type: 'red', label: 'SE' }
    };

    const config = statusConfig[status] || { type: 'gray', label: status };
    return <Tag type={config.type} size="sm">{config.label}</Tag>;
  };

  const getLanguageLabel = (lang: string) => {
    const langMap: Record<string, string> = {
      'cpp': 'C++',
      'python': 'Python',
      'java': 'Java',
      'javascript': 'JavaScript',
      'c': 'C'
    };
    return langMap[lang] || lang;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Build headers dynamically based on what should be shown
  const headers: { key: string; header: string }[] = [
    { key: 'id', header: 'ID' },
    { key: 'status', header: '狀態' }
  ];

  if (showProblem) {
    headers.push({ key: 'problem', header: '題目' });
  }

  if (showUser) {
    headers.push({ key: 'username', header: '用戶' });
  }

  headers.push(
    { key: 'language', header: '語言' }
  );

  if (showScore) {
    headers.push({ key: 'score', header: '得分' });
  }

  headers.push(
    { key: 'time', header: '時間' },
    { key: 'created_at', header: '提交時間' },
    { key: 'actions', header: '操作' }
  );

  // Build rows
  const rows = submissions.map(sub => {
    const row: Record<string, any> = {
      id: sub.id,
      status: getStatusTag(sub.status),
      language: getLanguageLabel(sub.language),
      time: `${sub.exec_time} ms`,
      created_at: formatDate(sub.created_at),
      actions: (
        <Button
          kind="ghost"
          size="sm"
          renderIcon={View}
          iconDescription="查看詳情"
          hasIconOnly
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(sub.id);
          }}
        />
      )
    };

    if (showProblem && sub.problem_title) {
      row.problem = (
        <span style={{ fontWeight: 500 }}>
          {sub.problem_title}
        </span>
      );
    }

    if (showUser && sub.username) {
      row.username = sub.username;
    }

    if (showScore) {
      row.score = sub.score;
    }

    return row;
  });

  return (
    <DataTable rows={rows.map((r, i) => ({ ...r, id: r.id || i.toString() }))} headers={headers}>
      {({
        rows,
        headers,
        getTableProps,
        getHeaderProps,
        getRowProps
      }: any) => (
        <TableContainer
          title=""
          description=""
          style={{
            backgroundColor: 'transparent',
            padding: '0',
            boxShadow: 'none'
          }}
        >
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header: any) => (
                  <TableHeader {...getHeaderProps({ header })} key={header.key}>
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow
                  {...getRowProps({ row })}
                  key={row.id}
                  onClick={() => onViewDetails(row.id)}
                  style={{ cursor: 'pointer' }}
                  className="submission-row"
                >
                  {row.cells.map((cell: any) => (
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

export default SubmissionTable;
