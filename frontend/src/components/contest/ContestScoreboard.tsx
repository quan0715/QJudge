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
  Loading
} from '@carbon/react';

export interface ProblemInfo {
  id: number;
  title: string;
  order: number;
  label: string;
  score?: number;
  problem_id?: number;
}

export interface ProblemStats {
  status: 'AC' | 'WA' | 'attempted' | null;
  tries: number;
  time: number;
  pending: boolean;
}

export interface StandingRow {
  rank: number;
  user: {
    id: number;
    username: string;
  };
  solved: number;
  total_score: number;
  time: number;
  problems: Record<string, ProblemStats>;
}

interface ContestScoreboardProps {
  problems: ProblemInfo[];
  standings: StandingRow[];
  loading?: boolean;
  className?: string;
}

const ContestScoreboard: React.FC<ContestScoreboardProps> = ({
  problems,
  standings,
  loading = false,
  className
}) => {
  const getCellColor = (stats: ProblemStats) => {
    if (stats.status === 'AC') return '#e6fffa'; // Light green
    if (stats.status === 'WA') return '#fff0f6'; // Light pink/yellow? Or maybe yellow for pending
    if (stats.pending) return '#fff0f6'; // Light pink/yellow? Or maybe yellow for pending
    if (stats.tries > 0) return '#fff1f0'; // Light red
    return 'transparent';
  };

  // Prepare headers for DataTable
  const headers = [
    { key: 'rank', header: '排名' },
    { key: 'user', header: '參與者' },
    { key: 'solved', header: '解題數' },
    { key: 'total_score', header: '總分' },
    { key: 'time', header: '罰時' },
    ...problems.map(p => ({
      key: `problem_${p.id}`,
      header: p.label
    }))
  ];

  const rows = standings.map(s => {
      const row: any = {
          id: s.user.id.toString(),
          rank: s.rank,
          user: s.user.username,
          solved: s.solved,
          total_score: s.total_score,
          time: s.time
      };
      
      problems.forEach(p => {
          const stats = s.problems[p.id] || s.problems[p.id.toString()];
          row[`problem_${p.id}`] = stats;
      });
      
      return row;
  });

  const renderCell = (cell: any) => {
    // Check if it's a problem column
    if (cell.info.header.startsWith('problem_')) {
      const stats = cell.value as ProblemStats | null;
      if (!stats) return null;

      const bgColor = getCellColor(stats);
      const textColor = stats.status === 'AC' ? '#00524d' : 
                       stats.pending ? '#8a3ffc' : '#a61e4d';

      return (
        <div style={{ 
          backgroundColor: bgColor,
          height: '100%',
          width: '100%',
          display: 'flex',
          textAlign: 'center',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0.5rem',
          minHeight: '60px',
          minWidth: '60px' // Ensure minimum width
        }}>
          {stats.status === 'AC' && (
            <>
              <div style={{ fontWeight: 'bold', fontSize: '1.1em', color: textColor }}> AC </div>
              <div style={{ fontSize: '0.8em', color: textColor }}>
                {stats.tries === 1 ? '1 try' : `${stats.tries} tries`}
              </div>
            </>
          )}
          {stats.status === 'WA' && (
            <>
              <div style={{ fontWeight: 'bold', fontSize: '1.1em', color: textColor }}> WA </div>
              <div style={{ fontSize: '0.8em', color: textColor }}>
                {stats.tries === 1 ? '1 try' : `${stats.tries} tries`}
              </div>
            </>
          )}
          {stats.pending && (
            <>
              <div style={{ fontWeight: 'bold', color: textColor }}>Pending</div>
              <div style={{ fontSize: '0.8em', color: textColor }}>{stats.tries} tries</div>
            </>
          )}
          {!stats.status && !stats.pending && stats.tries > 0 && (
             <div style={{ fontSize: '0.8em', color: textColor }}>
                {stats.tries === 1 ? '1 try' : `${stats.tries} tries`}
             </div>
          )}
        </div>
      );
    }

    // Default rendering for other columns
    if (cell.info.header === 'rank') {
      return <div style={{ fontWeight: 'bold', textAlign: 'left', width: '40px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'solved') {
      return <div style={{ fontWeight: 'bold', textAlign: 'left', width: '60px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'total_score') {
      return <div style={{ fontWeight: 'bold', textAlign: 'left', width: '60px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'time') {
      return <div style={{ fontWeight: 'bold', textAlign: 'left', width: '80px' }}>{cell.value}</div>;
    }
    if (cell.info.header === 'user') {
       return <div style={{ fontWeight: 600, textAlign: 'left' }}>{cell.value}</div>;
    }

    return cell.value;
  };

  if (loading) return <Loading />;

  return (
    <div className={className} style={{ overflowX: 'auto' }}>
      <DataTable rows={rows} headers={headers}>
        {({
          rows,
          headers,
          getTableProps,
          getHeaderProps,
          getRowProps
        }: any) => (
          <TableContainer>
            <Table {...getTableProps()} isSortable className="contest-scoreboard-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
                <TableRow>
                  {headers.map((header: any) => {
                    const headerProps = getHeaderProps({ header });
                    return (
                      <TableHeader 
                          {...headerProps} 
                          key={header.key} 
                          className={`${headerProps.className || ''} ${header.key === 'user' ? 'text-left' : ''}`}
                          style={{ 
                              textAlign: header.key === 'user' ? 'left' : 'center',
                              width: header.key === 'rank' ? '80px' : 
                                     header.key === 'solved' ? '80px' : 
                                     header.key === 'total_score' ? '80px' : 
                                     header.key === 'time' ? '80px' : 
                                     header.key.startsWith('problem_') ? '80px' : 'auto'
                          }}
                      >
                        <p style={{ 
                          textAlign: header.key.startsWith('problem_') ? 'center' : 'left',
                          fontWeight: 'bold',
                          fontSize: '14px',
                        }}>
                          {header.header}
                        </p>
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell: any) => (
                      <TableCell 
                        key={cell.id} 
                        style={{ 
                            padding: cell.info.header.startsWith('problem_') ? 0 : '1rem',
                            textAlign: 'center'
                        }}
                      >
                        {renderCell(cell)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
};

export default ContestScoreboard;
