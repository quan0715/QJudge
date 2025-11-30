import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Button, Tile, Tag, Tabs, Tab, TabList, TabPanels, TabPanel,
  TableContainer, Table, TableHead, TableRow, TableHeader, TableBody, TableCell
} from '@carbon/react';
import { 
  Time, Close, CheckmarkFilled, WarningAlt, Bullhorn
} from '@carbon/icons-react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css';
import { mockContests, mockProblems, type Contest, type Problem } from '../services/mockData';

const ContestArenaPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contest, setContest] = useState<Contest | undefined>(undefined);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [code, setCode] = useState('// Write your code here\n');
  const [timeRemaining, setTimeRemaining] = useState('');
  const [showRightPanel, setShowRightPanel] = useState(true);

  useEffect(() => {
    const foundContest = mockContests.find(c => c.id === id);
    setContest(foundContest);
  }, [id]);

  useEffect(() => {
    if (!contest) return;

    const updateTimer = () => {
      const now = new Date();
      const diff = contest.endTime.getTime() - now.getTime();
      
      if (diff <= 0) {
        setTimeRemaining('Contest Ended');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeRemaining(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [contest]);

  if (!contest) {
    return <div style={{ padding: '2rem' }}>Contest not found</div>;
  }

  const problems = contest.problems.map(pid => mockProblems.find(p => p.id === pid)).filter(Boolean) as Problem[];
  const currentProblem = problems[currentProblemIndex];

  const handleExit = () => {
    if (window.confirm('Are you sure you want to exit the contest?')) {
      navigate('/contests');
    }
  };

  return (
    <div className="contest-arena" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Custom Header */}
      <div style={{ 
        backgroundColor: 'var(--cds-ui-01)', 
        borderBottom: '1px solid var(--cds-ui-03)',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h3 style={{ fontWeight: 'bold', margin: 0 }}>{contest.title}</h3>
          <Tag type={contest.status === 'active' ? 'green' : 'gray'}>
            {contest.status === 'active' ? 'Active' : 'Ended'}
          </Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 'bold' }}>
            <Time size={24} />
            <span>{timeRemaining}</span>
          </div>
          <Button kind="danger" renderIcon={Close} onClick={handleExit}>
            Exit Contest
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Problem Navigation */}
        <div style={{ 
          width: '250px', 
          borderRight: '1px solid var(--cds-ui-03)',
          padding: '1rem',
          overflowY: 'auto',
          backgroundColor: 'var(--cds-ui-01)'
        }}>
          <h5 style={{ marginBottom: '1rem' }}>Problems</h5>
          {problems.map((problem, index) => (
            <Tile 
              key={problem.id}
              style={{ 
                marginBottom: '0.5rem', 
                cursor: 'pointer',
                border: currentProblemIndex === index ? '2px solid var(--cds-interactive)' : 'none',
                padding: '0.75rem'
              }}
              onClick={() => setCurrentProblemIndex(index)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>Problem {String.fromCharCode(65 + index)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>
                    {problem.title}
                  </div>
                </div>
                {/* Mock: show checkmark for first problem */}
                {index === 0 && <CheckmarkFilled size={16} style={{ color: 'var(--cds-support-success)' }} />}
              </div>
            </Tile>
          ))}
        </div>

        {/* Center Panel - Problem & Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Tabs>
            <TabList aria-label="Contest problem tabs">
              <Tab>題目</Tab>
              <Tab>撰寫程式碼</Tab>
              <Tab>繳交狀況</Tab>
            </TabList>
            <TabPanels>
              {/* Problem Description */}
              <TabPanel style={{ height: 'calc(100vh - 180px)', overflowY: 'auto', overflowX: 'hidden', padding: '1.5rem' }}>
                <h2 style={{ marginBottom: '1rem' }}>
                  Problem {String.fromCharCode(65 + currentProblemIndex)}: {currentProblem?.title}
                </h2>
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {currentProblem?.description || ''}
                  </ReactMarkdown>
                </div>
              </TabPanel>

              {/* Code Editor */}
              <TabPanel style={{ height: 'calc(100vh - 180px)', overflow: 'hidden', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                  <h4>撰寫程式碼</h4>
                  <Button>提交解答</Button>
                </div>
                <div style={{ flex: 1, border: '1px solid var(--cds-ui-03)', overflow: 'hidden' }}>
                  <Editor
                    height="100%"
                    language="cpp"
                    value={code}
                    theme="vs-dark"
                    onChange={(value) => setCode(value || '')}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>
              </TabPanel>

              {/* My Submissions */}
              <TabPanel style={{ height: 'calc(100vh - 180px)', overflowY: 'auto', overflowX: 'hidden', padding: '1.5rem' }}>
                <h4 style={{ marginBottom: '1rem' }}>我的繳交紀錄</h4>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeader>提交時間</TableHeader>
                        <TableHeader>題目</TableHeader>
                        <TableHeader>狀態</TableHeader>
                        <TableHeader>執行時間</TableHeader>
                        <TableHeader>記憶體</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {/* Mock submission data */}
                      <TableRow>
                        <TableCell>11:45:23</TableCell>
                        <TableCell>Problem A</TableCell>
                        <TableCell><Tag type="green">Accepted</Tag></TableCell>
                        <TableCell>0.02s</TableCell>
                        <TableCell>12MB</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>11:32:15</TableCell>
                        <TableCell>Problem A</TableCell>
                        <TableCell><Tag type="red">Wrong Answer</Tag></TableCell>
                        <TableCell>0.01s</TableCell>
                        <TableCell>10MB</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>11:15:42</TableCell>
                        <TableCell>Problem A</TableCell>
                        <TableCell><Tag type="red">Time Limit Exceeded</Tag></TableCell>
                        <TableCell>2.00s</TableCell>
                        <TableCell>15MB</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>

        {/* Right Panel - Announcements & Leaderboard */}
        {showRightPanel && (
          <div style={{ 
            width: '320px', 
            borderLeft: '1px solid var(--cds-ui-03)',
            overflowY: 'auto',
            backgroundColor: 'var(--cds-ui-01)'
          }}>
            <div style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h5>Info</h5>
                <Button kind="ghost" size="sm" hasIconOnly renderIcon={Close} iconDescription="Close" onClick={() => setShowRightPanel(false)} />
              </div>

              <Tabs>
                <TabList aria-label="Contest info tabs">
                  <Tab>Announcements</Tab>
                  <Tab>Leaderboard</Tab>
                </TabList>
                <TabPanels>
                  {/* Announcements */}
                  <TabPanel>
                    <div style={{ padding: '1rem 0' }}>
                      <Tile style={{ marginBottom: '0.5rem', padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <Bullhorn size={16} />
                          <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>10 minutes ago</span>
                        </div>
                        <p style={{ fontSize: '0.875rem' }}>Contest will end in 1 hour. Good luck!</p>
                      </Tile>
                      <Tile style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <WarningAlt size={16} />
                          <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>30 minutes ago</span>
                        </div>
                        <p style={{ fontSize: '0.875rem' }}>Clarification for Problem A: input range is 1-1000.</p>
                      </Tile>
                    </div>
                  </TabPanel>

                  {/* Leaderboard */}
                  <TabPanel>
                    <div style={{ marginTop: '1rem' }}>
                      <TableContainer>
                        <Table size="sm">
                          <TableHead>
                            <TableRow>
                              <TableHeader>Rank</TableHeader>
                              <TableHeader>User</TableHeader>
                              <TableHeader>Solved</TableHeader>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {[1, 2, 3, 4, 5].map((rank) => (
                              <TableRow key={rank}>
                                <TableCell>{rank}</TableCell>
                                <TableCell>User{rank}</TableCell>
                                <TableCell>{4 - rank}/3</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </div>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>
          </div>
        )}
        
        {/* Collapsed Right Panel Button */}
        {!showRightPanel && (
          <div style={{ width: '40px', borderLeft: '1px solid var(--cds-ui-03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Button kind="ghost" size="sm" onClick={() => setShowRightPanel(true)}>›</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestArenaPage;
