import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  InlineNotification
} from '@carbon/react';
import type { ScoreboardData, ScoreboardProblemCell } from '@/types/contest';

interface ContestScoreboardProps {
  data: ScoreboardData;
}

const ContestScoreboard: React.FC<ContestScoreboardProps> = ({ data }) => {
  const renderProblemCell = (cell: ScoreboardProblemCell | undefined, score?: number) => {
    if (!cell || cell.status === 'NS') {
      return <span style={{ color: 'var(--cds-text-disabled)' }}>-</span>;
    }

    // Common style for the cell content
    const cellStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.5rem',
      borderRadius: '4px',
      minWidth: '60px',
      fontWeight: 'bold',
      lineHeight: '1.2',
      margin: '0 auto'
    };

    if (cell.status === 'AC') {
      return (
        <div style={{
          ...cellStyle,
          backgroundColor: '#198038', // Darker Green (Green 60)
          color: '#ffffff',
        }}>
          <span style={{ fontSize: '1rem' }}>{score !== undefined ? score : cell.time}</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.9 }}>
             {score !== undefined && cell.time !== null ? `(${cell.time})` : ''}
             {cell.attempts > 1 ? ` (-${cell.attempts - 1})` : ''}
          </span>
        </div>
      );
    }

    // WA or other non-AC status
    // Status mapping
    const statusText = cell.status === 'WA' ? 'WA' :
                       cell.status === 'TLE' ? 'TLE' :
                       cell.status === 'MLE' ? 'MLE' :
                       cell.status === 'RE' ? 'RE' :
                       cell.status === 'CE' ? 'CE' : 'ERR';
    
    return (
      <div style={{
        ...cellStyle,
        backgroundColor: '#da1e28', // Red 60
        color: '#ffffff',
      }}>
        <span style={{ fontSize: '1rem' }}>{statusText}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 'normal', opacity: 0.9 }}>
          (-{cell.attempts})
        </span>
      </div>
    );
  };

  const headers = [
    { key: 'rank', header: '排名' },
    { key: 'user', header: '參賽者' },
    { key: 'solved', header: '解題數' },
    { key: 'penalty', header: '罰時' },
    ...data.problems.map(p => ({ key: `problem_${p.label}`, header: p.label }))
  ];

  const rows = data.rows.map((row, index) => {
    const rowData: any = {
      id: row.user_id,
      rank: index + 1,
      user: row.display_name,
      solved: row.solved_count,
      penalty: row.penalty
    };

    // Add problem cells
    data.problems.forEach(p => {
      rowData[`problem_${p.label}`] = renderProblemCell(row.problems[p.label], p.score);
    });

    return rowData;
  });

  if (!data.rows || data.rows.length === 0) {
    return (
      <InlineNotification
        kind="info"
        title="暫無成績"
        subtitle="目前還沒有參賽者提交解答"
        lowContrast
      />
    );
  }

  return (
    <DataTable rows={rows} headers={headers}>
      {({ rows, headers, getHeaderProps, getTableProps, getRowProps }) => (
        <TableContainer title={`${data.contest.name} - 成績排行榜`}>
          <Table {...getTableProps()} size="md">
            <TableHead>
              <TableRow>
                {headers.map((header) => (
                  <TableHeader 
                    {...getHeaderProps({ header })} 
                    key={header.key}
                    style={{ 
                      textAlign: 'center',
                      verticalAlign: 'middle'
                    }}
                  >
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const isTopThree = parseInt(row.cells[0].value) <= 3;
                return (
                  <TableRow
                    {...getRowProps({ row })}
                    key={row.id}
                    style={isTopThree ? { backgroundColor: 'var(--cds-layer-accent-01)' } : {}}
                  >
                    {row.cells.map((cell) => (
                      <TableCell 
                        key={cell.id}
                        style={{ 
                          textAlign: 'center',
                          verticalAlign: 'middle',
                          padding: '0.5rem'
                        }}
                      >
                        {cell.value}
                      </TableCell>
                    ))}
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

export default ContestScoreboard;
