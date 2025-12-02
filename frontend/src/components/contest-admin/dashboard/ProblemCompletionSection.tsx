import React from 'react';
import { SimpleBarChart } from '@carbon/charts-react';
import { DataTable, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer } from '@carbon/react';
import type { ProblemStats } from './types';
import ContainerCard from '@/components/contest/layout/ContainerCard';
import '@carbon/charts/styles.css';

interface ProblemCompletionSectionProps {
  problems: ProblemStats[];
  totalParticipants: number;
}

const ProblemCompletionSection: React.FC<ProblemCompletionSectionProps> = ({ problems, totalParticipants }) => {
  // Chart Data Preparation
  const chartData = problems.map(p => ({
    group: 'Completion Rate',
    key: `P${p.index} - ${p.title}`,
    value: totalParticipants > 0 ? (p.acceptedUsers / totalParticipants) * 100 : 0,
    // Custom tooltip data can be handled via options or creating a more complex structure if needed
    // But SimpleBarChart takes group/key/value.
  }));

  const chartOptions = {
    title: 'Problem Completion Rate (%)',
    axes: {
      left: { mapsTo: 'key', scaleType: 'labels' },
      bottom: { mapsTo: 'value' }
    },
    height: '400px',
    color: {
      scale: {
        'Completion Rate': '#0f62fe' // Carbon Blue 60
      }
    }
  };

  // Table Headers
  const headers = [
    { key: 'index', header: '#' },
    { key: 'title', header: 'Title' },
    { key: 'completionRate', header: 'Completion (%)' },
    { key: 'acceptedUsers', header: 'AC Users' },
    { key: 'attemptedUsers', header: 'Attempted' },
    { key: 'totalSubmissions', header: 'Total Subs' },
  ];

  // Table Rows
  const rows = problems.map(p => ({
    id: p.problemId,
    index: p.index,
    title: p.title,
    completionRate: totalParticipants > 0 ? ((p.acceptedUsers / totalParticipants) * 100).toFixed(1) : '0.0',
    acceptedUsers: p.acceptedUsers,
    attemptedUsers: p.attemptedUsers,
    totalSubmissions: p.totalSubmissions,
  }));

  return (
    <ContainerCard title="Problem Completion Rate">
      <div style={{ marginBottom: '1rem', color: 'var(--cds-text-secondary)' }}>
        Completion Rate = Accepted Users / Total Participants
      </div>
      
      <div style={{ marginBottom: '2rem' }}>
        {/* @ts-ignore - Carbon Charts types can be tricky */}
        <SimpleBarChart data={chartData} options={chartOptions} />
      </div>

      <DataTable rows={rows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <TableContainer title="Problem Statistics">
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
                  <TableRow {...getRowProps({ row })} key={row.id}>
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
    </ContainerCard>
  );
};

export default ProblemCompletionSection;
