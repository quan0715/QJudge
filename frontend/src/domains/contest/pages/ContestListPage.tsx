import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Grid,
  Column,
  Tag,
  Modal,
  SkeletonText,
} from "@carbon/react";
import { useNavigate } from "react-router-dom";
import { getContests } from "@/services/contest";
import { useAuth } from "@/domains/auth/contexts/AuthContext";
import type { Contest } from "@/core/entities/contest.entity";
import { PageHeader } from "@/ui/layout/PageHeader";
import TeacherContestList from "../components/TeacherContestList";

const ContestListPage: React.FC = () => {
  const { t } = useTranslation('contest');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationModal, setNotificationModal] = useState({
    open: false,
    title: "",
    message: "",
    kind: "info" as "info" | "error" | "warning",
  });

  useEffect(() => {
    fetchContests();
  }, []);

  const fetchContests = async () => {
    try {
      const data = await getContests();
      setContests(data);
    } catch (error) {
      console.error("Failed to fetch contests", error);
    } finally {
      setLoading(false);
    }
  };

  const handleContestClick = async (contest: Contest) => {
    // Always navigate to contest page - registration can happen there
    navigate(`/contests/${contest.id}`);
  };

  const headers = [
    { key: "name", header: tc('form.name') },
    { key: "startTime", header: tc('form.startTime') },
    { key: "endTime", header: tc('form.endTime') },
    { key: "status", header: tc('table.status') },
    { key: "userStatus", header: "您的狀態" },
    { key: "action", header: tc('table.actions') },
  ];

  /* Processing logic for contest lists (ongoing, upcoming, past) */
  /* Exclude inactive contests from public listing */
  const now = new Date();
  const activeContests = contests.filter((c) => c.status !== "inactive");

  const ongoingContests = activeContests.filter((c) => {
    const start = new Date(c.startTime);
    const end = new Date(c.endTime);
    return start <= now && end >= now;
  });

  const upcomingContests = activeContests.filter((c) => {
    const start = new Date(c.startTime);
    return start > now;
  });

  const pastContests = activeContests.filter((c) => {
    const end = new Date(c.endTime);
    return end < now;
  });

  /* Render Helpers */
  const renderContestTable = (data: Contest[]) => (
    <DataTable
      rows={data.map((c: any) => ({ ...c, id: c.id.toString() }))}
      headers={headers}
    >
      {({
        rows,
        headers,
        getHeaderProps,
        getRowProps,
        getTableProps,
        onInputChange,
      }: any) => (
        <TableContainer>
          <TableToolbar>
            <TableToolbarContent>
              <TableToolbarSearch onChange={onInputChange} />
            </TableToolbarContent>
          </TableToolbar>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((header: any) => {
                  const { key, ...headerProps } = getHeaderProps({ header });
                  return (
                    <TableHeader key={key} {...headerProps}>
                      {header.header}
                    </TableHeader>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row: any) => {
                const contest = contests.find(
                  (c) => c.id.toString() === row.id
                );
                if (!contest) return null;
                const { key, ...rowProps } = getRowProps({ row });
                return (
                  <TableRow
                    key={key}
                    {...rowProps}
                    onClick={() => handleContestClick(contest)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <div style={{ fontWeight: 500, fontSize: "1rem" }}>
                        {contest.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--cds-text-secondary)",
                        }}
                      >
                        {new Date(contest.startTime).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--cds-text-secondary)",
                        }}
                      >
                        {new Date(contest.endTime).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tag
                        type={contest.status === "active" ? "green" : "gray"}
                      >
                        {contest.status}
                      </Tag>
                    </TableCell>
                    <TableCell>
                      {contest.isRegistered && <Tag type="green">{t('hero.register')}ed</Tag>}
                      {!contest.isRegistered && <Tag type="gray">未報名</Tag>}
                    </TableCell>
                    <TableCell>
                      {/* Action Buttons Logic */}
                      <Button
                        size="sm"
                        kind="tertiary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContestClick(contest);
                        }}
                      >
                        查看詳情
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );

  const renderEmptyState = (message: string) => (
    <div
      style={{
        padding: "3rem",
        textAlign: "center",
        color: "var(--cds-text-secondary)",
      }}
    >
      <p style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>{message}</p>
    </div>
  );

  // Skeleton loading for table
  const renderSkeletonTable = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            {headers.map((header) => (
              <TableHeader key={header.key}>{header.header}</TableHeader>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={`skeleton-${index}`}>
              {headers.map((header) => (
                <TableCell key={header.key}>
                  <SkeletonText />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        backgroundColor: "var(--cds-background)",
      }}
    >
      {/* Centered Max-width Container */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
        <Grid>
          <Column lg={16} md={8} sm={4} style={{ padding: 0 }}>
            <PageHeader
              title={tc('page.contests')}
              subtitle="參加競賽，與其他同學切磋程式解題技巧。"
            />

            {/* If Teacher, show Teacher List */}
            {(user?.role === "teacher" || user?.role === "admin") && (
              <div style={{ marginBottom: "3rem" }}>
                <h2 style={{ marginBottom: "1rem", fontSize: "1.5rem" }}>
                  管理競賽
                </h2>
                {loading ? (
                  renderSkeletonTable()
                ) : (
                  <TeacherContestList contests={contests} />
                )}
              </div>
            )}

            {/* Student/Public List */}
            <Tabs>
              <TabList aria-label="Contest types">
                <Tab>{tc('dashboard.contests.ongoing')} {!loading && `(${ongoingContests.length})`}</Tab>
                <Tab>{tc('dashboard.contests.upcoming')} {!loading && `(${upcomingContests.length})`}</Tab>
                <Tab>{tc('dashboard.contests.ended')} {!loading && `(${pastContests.length})`}</Tab>
              </TabList>
              <TabPanels>
                <TabPanel>
                  {loading
                    ? renderSkeletonTable()
                    : ongoingContests.length > 0
                    ? renderContestTable(ongoingContests)
                    : renderEmptyState("目前並沒有可報名的競賽")}
                </TabPanel>
                <TabPanel>
                  {loading
                    ? renderSkeletonTable()
                    : upcomingContests.length > 0
                    ? renderContestTable(upcomingContests)
                    : renderEmptyState("沒有即將開始的競賽")}
                </TabPanel>
                <TabPanel>
                  {loading
                    ? renderSkeletonTable()
                    : pastContests.length > 0
                    ? renderContestTable(pastContests)
                    : renderEmptyState("沒有已結束的競賽")}
                </TabPanel>
              </TabPanels>
            </Tabs>

            {/* Generic Notification Modal */}
            <Modal
              open={notificationModal.open}
              modalHeading={notificationModal.title}
              passiveModal
              onRequestClose={() =>
                setNotificationModal((prev) => ({ ...prev, open: false }))
              }
            >
              <p
                style={{
                  fontSize: "1rem",
                  color:
                    notificationModal.kind === "error"
                      ? "var(--cds-text-error)"
                      : "inherit",
                }}
              >
                {notificationModal.message}
              </p>
            </Modal>
          </Column>
        </Grid>
      </div>
    </div>
  );
};

export default ContestListPage;
