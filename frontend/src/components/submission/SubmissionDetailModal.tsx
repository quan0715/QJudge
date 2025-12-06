import React, { useState, useEffect } from 'react';
import {
  Modal,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  Tag,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  Button,
  SkeletonText,
  SkeletonPlaceholder
} from '@carbon/react';
import { Copy, Checkmark } from '@carbon/icons-react';
import Editor from '@monaco-editor/react';
import { api } from '@/services/api';
import { useCopyText } from '@/hooks/useCopyText';
import ProblemLink from '@/components/problem/ProblemLink';
import { formatDate } from '@/utils/format';
import type { SubmissionDetail } from '@/core/entities/submission.entity';
import { SubmissionStatusBadge } from '@/components/common/badges/SubmissionStatusBadge';
import { DifficultyBadge } from '@/components/common/badges/DifficultyBadge';
import DataCard from '@/components/common/data-card/DataCard';
import { getLanguageConfig } from '@/core/config/languageConfig';
import { getStatusConfig } from '@/core/config/statusConfig';
interface SubmissionDetailModalProps {
  submissionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  contestId?: string;
}

const SubmissionDetailModal = ({ submissionId, isOpen, onClose, contestId }: SubmissionDetailModalProps) => {
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isCopied, copy } = useCopyText();

  useEffect(() => {
    if (isOpen && submissionId) {
      setLoading(true);
      setError(null);
      fetchSubmission();
    } else {
      setSubmission(null);
    }
  }, [isOpen, submissionId]);

  const fetchSubmission = async () => {
    try {
      const data = await api.getSubmission(submissionId!);
      setSubmission(data);
      
      // Start polling if submission is pending or judging
      if (data.status === 'pending' || data.status === 'judging') {
        startPolling();
      }
    } catch (err: any) {
      console.error('Error:', err);
      if (err.message === 'Permission denied') {
        setError('permission_denied');
      } else {
        setError('fetch_failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    const pollInterval = setInterval(async () => {
      if (!isOpen || !submissionId) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const data = await api.getSubmission(submissionId!);
        setSubmission(data);
        
        // Stop polling if status is final
        if (data.status !== 'pending' && data.status !== 'judging') {
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000); // Poll every second

    // Clean up interval on unmount
    return () => clearInterval(pollInterval);
  };

  const handleCopyCode = () => {
    if (submission?.code) {
      copy(submission.code);
    }
  };

  const resultHeaders = [
    { key: 'test_case', header: '測試案例' },
    { key: 'status', header: '狀態' },
    { key: 'time', header: '時間 (ms)' },
    { key: 'memory', header: '記憶體 (KB)' },
    { key: 'message', header: '訊息' }
  ];

  const getResultRows = () => {
    // If we have results, show them
    if (submission?.results && submission.results.length > 0) {
      return submission.results.map((result, index) => ({
        id: result.id.toString(),
        test_case: `Test ${index + 1}`,
        status: <SubmissionStatusBadge status={result.status} size="sm" />,
        time: `${result.execTime}ms`,
        memory: `${result.memoryUsage}KB`,
        message: result.errorMessage || result.status,
        // For expansion
        is_expandable: !!(result.input || result.output || result.expectedOutput)
      }));
    }

    // If no results yet but it is a test run with custom cases (e.g., Pending), show them
    if (submission?.isTest && submission.customTestCases && submission.customTestCases.length > 0) {
        return submission.customTestCases.map((_, index) => ({
            id: `custom-${index}`,
            test_case: `Custom Test ${index + 1}`,
            status: <SubmissionStatusBadge status="pending" size="sm" />,
            time: '-',
            memory: '-',
            message: 'Pending...',
            is_expandable: true
        }));
    }
    
    return [];
  };

  // Create a map to lookup result details by ID
  const getResultById = (id: string) => {
    return submission?.results?.find(r => r.id.toString() === id);
  };

  
  return (
    <Modal
      open={isOpen}
      color='white'
      onRequestClose={onClose}
      passiveModal
      size="lg"
      style={{ minHeight: '600px'}}
    >
      {loading ? (
        <div style={{ padding: '0' }}>
          {/* Hero Skeleton */}
          <div style={{
            padding: '2rem 1rem',
            margin: '-1rem -1rem 0 -1rem',
            backgroundColor: 'var(--cds-layer-01)',
            marginBottom: '0',
            borderBottom: '1px solid var(--cds-border-subtle)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <div style={{ width: '60%' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <SkeletonText width="30%" />
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <SkeletonText heading width="80%" />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <SkeletonPlaceholder style={{ width: '80px', height: '24px' }} />
                  <SkeletonPlaceholder style={{ width: '60px', height: '24px' }} />
                  <SkeletonPlaceholder style={{ width: '100px', height: '24px' }} />
                </div>
              </div>
              <SkeletonPlaceholder style={{ width: '100px', height: '32px' }} />
            </div>
            
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
              gap: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--cds-border-subtle-01)'
            }}>
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div style={{ marginBottom: '0.25rem' }}>
                    <SkeletonText width="40px" />
                  </div>
                  <SkeletonText width="80px" heading />
                </div>
              ))}
            </div>
          </div>
          
          {/* Tabs Skeleton */}
          <div style={{ marginTop: '2rem' }}>
             <SkeletonPlaceholder style={{ width: '200px', height: '40px', marginBottom: '1rem' }} />
             <SkeletonPlaceholder style={{ width: '100%', height: '300px' }} />
          </div>
        </div>
      ) : error === 'permission_denied' ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ marginBottom: '1rem', fontSize: '4rem' }}>🔒</div>
          <h2 style={{ marginBottom: '1rem' }}>權限不足</h2>
          <p style={{ color: 'var(--cds-text-secondary)' }}>
            您沒有權限查看此提交的詳細內容。
          </p>
        </div>
      ) : !submission ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>提交不存在或無法載入</p>
        </div>
      ) : (
        <div style={{ padding: '1rem 1rem', margin: '1rem 1rem'}}>
          <div style={{
            backgroundColor: 'var(--cds-layer-01)',
            marginBottom: '0',
            borderBottom: '1px solid var(--cds-border-subtle-01)',
          }}>
            {/* Header: Title + Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
              <div>
                <div style={{ 
                  fontSize: '0.875rem', 
                  color: 'var(--cds-text-secondary)', 
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>提交 #{submission.id}</span>
                  <span>•</span>
                  <span>{formatDate(submission.createdAt)}</span>
                </div>
                <h2 style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1.2, marginBottom: '0.5rem' }}>
                  {submission.problem ? (
                    <ProblemLink
                      problemId={submission.problem.id}
                      displayId={submission.problem.displayId || submission.problem.id}
                      title={submission.problem.title}
                      contestId={contestId}
                    />
                  ) : (
                    submission.problemId
                  )}
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                   {submission.problem && <DifficultyBadge difficulty={submission.problem.difficulty} />}
                   <Tag type="gray">{getLanguageConfig(submission.language).label}</Tag>
                   <Tag type="cyan">By {submission.user?.username || submission.userId}</Tag>
                </div>
              </div>
              <div>
                <SubmissionStatusBadge status={submission.status} />
              </div>
            </div>

            {/* Data Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
              gap: '0.5rem',
              padding: '1rem 0rem',
              borderTop: '1px solid var(--cds-border-subtle-01)'
            }}>
              <DataCard title="提交狀態" value={getStatusConfig(submission.status).label} description={`本次繳交狀態`} valueStyle={{
                color: getStatusConfig(submission.status).color,
              }}/>
              <DataCard title="得分" value={submission.score || 0} unit="分" description={`題目總得分`}/>
              <DataCard title="執行時間" value={submission.execTime || 0} unit="ms" description={`題目總執行時間`}/>
              <DataCard title="記憶體使用" value={submission.memoryUsage || 0} unit="MB" description={`題目總記憶體使用`}/>

            </div>

            {submission.errorMessage && (
              <div style={{ marginTop: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  錯誤訊息
                </div>
                <pre style={{
                  padding: '1rem',
                  backgroundColor: 'var(--cds-layer-02)',
                  borderRadius: '4px',
                  fontSize: '0.875rem',
                  fontFamily: "'IBM Plex Mono', monospace",
                  whiteSpace: 'pre-wrap',
                  color: 'var(--cds-text-error)',
                  margin: 0,
                  border: '1px solid var(--cds-border-subtle)'
                }}>
                  {submission.errorMessage}
                </pre>
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs>
            <TabList contained aria-label="Submission details">
              <Tab>程式碼</Tab>
              <Tab>測試結果</Tab>
            </TabList>
            <TabPanels>
              {/* Code Tab */}
              <TabPanel>
                <div
                  style={{
                    padding: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '0.5rem',
                        right: '0.5rem',
                        left: 'auto',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Button
                        kind="primary"
                        size="sm"
                        hasIconOnly
                        renderIcon={isCopied ? Checkmark : Copy}
                        iconDescription={isCopied ? '已複製' : '複製程式碼'}
                        onClick={handleCopyCode}
                      />
                    </div>

                    <Editor
                      height="400px"
                      language={submission.language === 'cpp' ? 'cpp' : submission.language}
                      value={submission.code}
                      theme="vs-dark"
                      options={{
                        copyWithSyntaxHighlighting: true,
                        selectionClipboard: true,
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 14,
                        scrollBeyondLastLine: false,
                        domReadOnly: true,
                        lineNumbers: 'on',
                      }}
                    />
                  </div>
                </div>

              </TabPanel>

              {/* Test Results Tab */}
              <TabPanel>
                <div>
                  {(submission.results && submission.results.length > 0) || (submission.customTestCases && submission.customTestCases.length > 0) ? (
                    <DataTable rows={getResultRows()} headers={resultHeaders}>
                      {({ rows, headers, getTableProps, getHeaderProps, getRowProps, getTableContainerProps }: any) => (
                        <TableContainer {...getTableContainerProps()}>
                          <Table {...getTableProps()} size="sm">
                            <TableHead>
                              <TableRow>
                                <TableExpandHeader />
                                {headers.map((header: any) => {
                                  const { key, ...headerProps } = getHeaderProps({ header });
                                  return (
                                    <TableHeader {...headerProps} key={key}>
                                      {header.header}
                                    </TableHeader>
                                  );
                                })}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {rows.map((row: any) => (
                                <React.Fragment key={row.id}>
                                  <TableExpandRow
                                    {...getRowProps({ row })}
                                    isExpanded={row.isExpanded}
                                    expandIconDescription="顯示詳情"
                                    collapseIconDescription="隱藏詳情"
                                    disabled={!row.is_expandable}
                                  >
                                    {row.cells.map((cell: any) => (
                                      <TableCell key={cell.id}>{cell.value}</TableCell>
                                    ))}
                                  </TableExpandRow>
                                    {row.isExpanded && (() => {
                                      // Check if it's a real result or a pending custom case
                                      const result = getResultById(row.id);
                                      let input = '';
                                      let output = '';
                                      let expected = '';
                                      let status = '';

                                      if (result) {
                                          input = result.input || '';
                                          output = result.output || '';
                                          expected = result.expectedOutput || '';
                                          status = result.status;
                                      } else if (row.id.startsWith('custom-')) {
                                          // It's a pending custom case
                                          const index = parseInt(row.id.split('-')[1]);
                                          if (submission.customTestCases && submission.customTestCases[index]) {
                                              input = submission.customTestCases[index].input;
                                              expected = submission.customTestCases[index].output;
                                              status = 'pending';
                                          }
                                      }

                                      if (!input && !output && !expected) return null;
                                      
                                      return (
                                      <TableExpandedRow colSpan={headers.length + 1}>
                                        <div style={{ 
                                          padding: '1.5rem',
                                          backgroundColor: 'var(--cds-layer-01)',
                                          borderTop: '1px solid var(--cds-border-subtle-01)'
                                        }}>
                                          {input && (
                                            <div style={{ marginBottom: '1rem' }}>
                                              <div style={{ 
                                                fontSize: '0.75rem', 
                                                fontWeight: 600, 
                                                color: 'var(--cds-text-primary)', 
                                                marginBottom: '0.5rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                              }}>
                                                輸入 (Input)
                                              </div>
                                              <pre style={{
                                                padding: '1rem',
                                                backgroundColor: 'var(--cds-field)',
                                                border: '1px solid var(--cds-border-subtle)',
                                                borderRadius: '4px',
                                                fontFamily: 'monospace',
                                                fontSize: '0.875rem',
                                                whiteSpace: 'pre-wrap',
                                                margin: 0,
                                                color: 'var(--cds-text-primary)'
                                              }}>{input}</pre>
                                            </div>
                                          )}
                                          
                                          {output && (
                                            <div style={{ marginBottom: '1rem' }}>
                                              <div style={{ 
                                                fontSize: '0.75rem', 
                                                fontWeight: 600, 
                                                color: 'var(--cds-text-primary)', 
                                                marginBottom: '0.5rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                              }}>
                                                輸出 (Output)
                                              </div>
                                              <pre style={{
                                                padding: '1rem',
                                                backgroundColor: 'var(--cds-field)',
                                                border: '1px solid var(--cds-border-subtle)',
                                                borderRadius: '4px',
                                                fontFamily: 'monospace',
                                                fontSize: '0.875rem',
                                                whiteSpace: 'pre-wrap',
                                                margin: 0,
                                                color: 'var(--cds-text-primary)'
                                              }}>{output}</pre>
                                            </div>
                                          )}

                                          {expected && (status === 'WA' || status === 'AC' || status === 'pending') && (
                                            <div>
                                              <div style={{ 
                                                fontSize: '0.75rem', 
                                                fontWeight: 600, 
                                                color: 'var(--cds-text-primary)', 
                                                marginBottom: '0.5rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px'
                                              }}>
                                                預期輸出 (Expected Output)
                                              </div>
                                              <pre style={{
                                                padding: '1rem',
                                                backgroundColor: 'var(--cds-field)',
                                                border: '1px solid var(--cds-border-subtle)',
                                                borderRadius: '4px',
                                                fontFamily: 'monospace',
                                                fontSize: '0.875rem',
                                                whiteSpace: 'pre-wrap',
                                                margin: 0,
                                                color: 'var(--cds-text-primary)'
                                              }}>{expected}</pre>
                                            </div>
                                          )}
                                        </div>
                                      </TableExpandedRow>
                                      );
                                    })()}
                                </React.Fragment>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </DataTable>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                      暫無測試結果
                    </div>
                  )}
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      )}
    </Modal>
  );
};

export { SubmissionDetailModal };
