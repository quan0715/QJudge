import React, { useMemo, useState } from "react";
import {
  Button,
  InlineNotification,
  Grid,
  Column,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import type { ContestDetail, ContestParticipant, ExamEvent } from "@/core/entities/contest.entity";
import { useContest } from "@/features/contest/contexts/ContestContext";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import ContainerCard from "@/shared/layout/ContainerCard";

const toDisplayTime = (value?: string) =>
  value ? new Date(value).toLocaleString() : "-";

const buildContestModelSnapshot = (contest: ContestDetail | null) => {
  if (!contest) return null;
  return {
    id: contest.id,
    name: contest.name,
    status: contest.status,
    examModeEnabled: contest.examModeEnabled,
    examStatus: contest.examStatus,
    visibility: contest.visibility,
    startTime: contest.startTime,
    endTime: contest.endTime,
    allowMultipleJoins: contest.allowMultipleJoins,
    maxCheatWarnings: contest.maxCheatWarnings,
    allowAutoUnlock: contest.allowAutoUnlock,
    autoUnlockMinutes: contest.autoUnlockMinutes,
    lockReason: contest.lockReason,
    lockedAt: contest.lockedAt,
  };
};

const buildParticipantSnapshot = (participants: ContestParticipant[]) =>
  participants.slice(0, 5).map((participant) => ({
    userId: participant.userId,
    username: participant.username,
    examStatus: participant.examStatus,
    violationCount: participant.violationCount,
    lockReason: participant.lockReason,
    joinedAt: participant.joinedAt,
  }));

const buildEventSnapshot = (events: ExamEvent[]) =>
  events.slice(0, 5).map((event) => ({
    id: event.id,
    userId: event.userId,
    userName: event.userName,
    eventType: event.eventType,
    timestamp: event.timestamp,
    reason: event.reason,
  }));

const ContestExamModelScreen: React.FC = () => {
  const {
    contest,
    participants,
    examEvents,
    refreshContest,
    refreshAdminData,
    isRefreshing,
  } = useContest();
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const contestSnapshot = useMemo(
    () => buildContestModelSnapshot(contest),
    [contest]
  );
  const participantSnapshot = useMemo(
    () => buildParticipantSnapshot(participants),
    [participants]
  );
  const eventSnapshot = useMemo(() => buildEventSnapshot(examEvents), [examEvents]);

  const handleRefresh = async () => {
    try {
      await Promise.all([refreshContest(), refreshAdminData()]);
      setNotification({ kind: "success", message: "資料模型已更新" });
    } catch {
      setNotification({ kind: "error", message: "更新失敗，請稍後再試" });
    }
  };

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: "100%" }}>
      <div style={{ width: "100%" }}>
        {notification ? (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem" }}
          />
        ) : null}

        <ContainerCard
          title="Exam Data Model（老師後台）"
          subtitle="用來驗證目前前後端模型欄位是否一致。"
          action={
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              重新整理模型資料
            </Button>
          }
        >
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type={contest?.examModeEnabled ? "green" : "gray"}>
              {contest?.examModeEnabled ? "Exam Mode: ON" : "Exam Mode: OFF"}
            </Tag>
            <Tag type="teal">{`Contest Status: ${contest?.status || "-"}`}</Tag>
            <Tag type="blue">{`Exam Status: ${contest?.examStatus || "-"}`}</Tag>
            <Tag type="purple">{`Participants: ${participants.length}`}</Tag>
            <Tag type="cool-gray">{`Events: ${examEvents.length}`}</Tag>
          </div>
        </ContainerCard>

        <Grid fullWidth style={{ marginTop: "1rem" }}>
          <Column lg={16} md={8} sm={4}>
            <ContainerCard title="Model Contract（欄位）">
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>Model</TableHeader>
                      <TableHeader>Field</TableHeader>
                      <TableHeader>Type</TableHeader>
                      <TableHeader>Source API</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Contest</TableCell>
                      <TableCell>examModeEnabled / examStatus</TableCell>
                      <TableCell>boolean / enum</TableCell>
                      <TableCell>/api/v1/contests/:id/</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>ContestParticipant</TableCell>
                      <TableCell>examStatus / violationCount / lockReason</TableCell>
                      <TableCell>enum / number / string</TableCell>
                      <TableCell>/api/v1/contests/:id/participants/</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>ExamEvent</TableCell>
                      <TableCell>eventType / timestamp / reason</TableCell>
                      <TableCell>enum / datetime / string</TableCell>
                      <TableCell>/api/v1/contests/:id/exam/events/</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </ContainerCard>
          </Column>
        </Grid>

        <Grid fullWidth style={{ marginTop: "1rem" }}>
          <Column lg={8} md={8} sm={4}>
            <ContainerCard title="Contest Live Snapshot">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.75rem",
                }}
              >
                {JSON.stringify(contestSnapshot, null, 2)}
              </pre>
            </ContainerCard>
          </Column>
          <Column lg={8} md={8} sm={4}>
            <ContainerCard title="Participants Live Snapshot (Top 5)">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.75rem",
                }}
              >
                {JSON.stringify(participantSnapshot, null, 2)}
              </pre>
            </ContainerCard>
          </Column>
        </Grid>

        <Grid fullWidth style={{ marginTop: "1rem" }}>
          <Column lg={16} md={8} sm={4}>
            <ContainerCard title="Recent Exam Events (Top 20)">
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>時間</TableHeader>
                      <TableHeader>使用者</TableHeader>
                      <TableHeader>事件類型</TableHeader>
                      <TableHeader>說明</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {examEvents.slice(0, 20).map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>{toDisplayTime(event.timestamp)}</TableCell>
                        <TableCell>{event.userName}</TableCell>
                        <TableCell>
                          <Tag type="outline">{event.eventType}</Tag>
                        </TableCell>
                        <TableCell>{event.reason || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {examEvents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>目前沒有 exam events。</TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </TableContainer>
            </ContainerCard>
          </Column>
        </Grid>

        <Grid fullWidth style={{ marginTop: "1rem" }}>
          <Column lg={16} md={8} sm={4}>
            <ContainerCard title="Exam Event Snapshot (Top 5)">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.75rem",
                }}
              >
                {JSON.stringify(eventSnapshot, null, 2)}
              </pre>
            </ContainerCard>
          </Column>
        </Grid>
      </div>
    </SurfaceSection>
  );
};

export default ContestExamModelScreen;
