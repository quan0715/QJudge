import React from 'react';
import { SimpleBarChart } from '@carbon/charts-react';
import { DataTable, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, TableContainer, Pagination } from '@carbon/react';
import type { ParticipantStats } from './types';
import ContainerCard from '@/components/contest/layout/ContainerCard';
import '@carbon/charts/styles.css';

interface ParticipantCompletionSectionProps {
  participants: ParticipantStats[];
  totalProblems: number;
}

const ParticipantCompletionSection: React.FC<ParticipantCompletionSectionProps> = ({ participants, totalProblems }) => {
  // Histogram Data Preparation
  // Buckets are 0, 1, 2, ... totalProblems
  const distribution = new Array(totalProblems + 1).fill(0);
  participants.forEach(p => {
    const solved = Math.min(p.solvedCount, totalProblems);
    distribution[solved]++;
  });

  const chartData = distribution.map((count, solvedCount) => ({
    group: 'Participants',
    key: `${solvedCount} Solved`,
    value: count
  }));

  const chartOptions = {
    title: 'Solved Count Distribution',
    axes: {
      left: { mapsTo: 'value', title: 'Number of Participants' },
      bottom: { mapsTo: 'key', scaleType: 'labels', title: 'Solved Count' }
    },
    height: '300px',
    color: {
      scale: {
        'Participants': '#198038' // Carbon Green 60
      }
    }
  };

  // Table Headers
  const headers = [
    { key: 'username', header: 'Username' },
    { key: 'solvedCount', header: 'Solved' },
    { key: 'completionRate', header: 'Rate (%)' },
    { key: 'totalSubmissions', header: 'Subs' },
  ];

  // Table Rows (Top 10 by default or all with pagination)
  // Let's sort by solved count descending
  const sortedParticipants = [...participants].sort((a, b) => b.solvedCount - a.solvedCount);
  
  const rows = sortedParticipants.map(p => ({
    id: p.userId,
    username: p.username,
    solvedCount: p.solvedCount,
    completionRate: totalProblems > 0 ? ((p.solvedCount / totalProblems) * 100).toFixed(1) : '0.0',
    totalSubmissions: p.totalSubmissions,
  }));

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  
  const paginatedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <ContainerCard title="Participant Completion Rate">
      <div style={{ marginBottom: '2rem' }}>
        {/* @ts-ignore */}
        <SimpleBarChart data={chartData} options={chartOptions} />
      </div>

      <DataTable rows={paginatedRows} headers={headers} isSortable>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps }) => (
          <TableContainer title="Participant Ranking">
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
      <Pagination
        totalItems={participants.length}
        backwardText="Previous page"
        forwardText="Next page"
        pageSize={pageSize}
        pageSizes={[5, 10, 20]}
        itemsPerPageText="Items per page"
        onChange={({ page, pageSize }) => {
          setPage(page);
          setPageSize(pageSize);
        }}
      />
    </ContainerCard>
  );
};

export default ParticipantCompletionSection;
