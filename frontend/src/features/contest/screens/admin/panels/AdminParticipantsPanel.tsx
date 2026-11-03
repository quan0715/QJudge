import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  ContentSwitcher,
  InlineNotification,
  Select,
  SelectItem,
  SkeletonText,
  Switch,
  TableToolbarSearch,
  Tag,
  Toggle,
} from "@carbon/react";
import { ArrowLeft, Renew, RightPanelClose, RightPanelOpen } from "@carbon/icons-react";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { EventFeedItem, ParticipantDashboard } from "@/core/entities/contest.entity";
import ParticipantAnswerReport from "@/features/contest/components/participants/ParticipantAnswerReport";
import ParticipantCardGallery from "@/features/contest/components/participants/ParticipantCardGallery";
import ParticipantQrScanButton from "@/features/contest/components/participants/ParticipantQrScanButton";
import ParticipantRail from "@/features/contest/components/participants/ParticipantRail";
import ParticipantSummaryHeader from "@/features/contest/components/participants/ParticipantSummaryHeader";
import ParticipantTable from "@/features/contest/components/participants/ParticipantTable";
import { useAdminPanelRefresh, useContestAdmin } from "@/features/contest/contexts";
import { isContestInExamWindow } from "@/features/contest/domain/examWindow";
import {
  PARTICIPANT_STATUS_FILTERS,
  filterParticipants,
  isParticipantLive,
  sortParticipantsByAttention,
  type ParticipantStatusFilter,
} from "@/features/contest/domain/participantRoster";
import { useParticipantActions } from "@/features/contest/hooks/useParticipantActions";
import { useParticipantDashboard } from "@/features/contest/hooks/useParticipantDashboard";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { useMediaQuery } from "@/shared/hooks";
import { PanelToolbar } from "@/shared/ui/list/PanelToolbar";

import ParticipantEventTimeline from "./ParticipantEventTimeline";
import { MinimalLiveStage } from "./ProctorLiveStage";
import styles from "./AdminParticipantsPanel.module.scss";

const EMPTY_EVENT_FEED: EventFeedItem[] = [];
const NOW_TICK_MS = 30000;
const DASHBOARD_REFRESH_MS = 30000;

const isStatusFilter = (value: string | null): value is ParticipantStatusFilter =>
  PARTICIPANT_STATUS_FILTERS.some((option) => option.id === value);

export default function AdminParticipantsPanel({ contestId, contest }: AdminPanelProps) {
  const { t } = useTranslation("contest");
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useMediaQuery("(max-width: 66rem)");
  const reducedMotion = !!useReducedMotion();
  const { participants, initialLoading, isRefreshing, refreshAdminData } = useContestAdmin();
  const { registerPanelRefresh } = useAdminPanelRefresh();

  const selectedUserId = searchParams.get("user");
  const problemId = searchParams.get("problem") ?? undefined;
  const query = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status: ParticipantStatusFilter = isStatusFilter(statusParam) ? statusParam : "all";
  const cardsView = searchParams.get("view") === "cards";
  const monitorRequested = searchParams.get("monitor") === "1";

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [gridSize, setGridSize] = useState<4 | 9>(4);
  const [discoveryKey, setDiscoveryKey] = useState(0);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [eventsOpen, setEventsOpen] = useState(true);
  const [lastSeenEventAt, setLastSeenEventAt] = useState(0);
  const [selectedIncidentKey, setSelectedIncidentKey] = useState("");
  const [eventDetailOpen, setEventDetailOpen] = useState(false);

  const inExamWindow = isContestInExamWindow(contest, nowMs);
  const monitorMode = monitorRequested && inExamWindow;

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          Object.entries(updates).forEach(([key, value]) => {
            if (value) next.set(key, value);
            else next.delete(key);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), NOW_TICK_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (monitorRequested && !inExamWindow) updateParams({ monitor: null });
  }, [inExamWindow, monitorRequested, updateParams]);

  const visibleParticipants = useMemo(
    () => sortParticipantsByAttention(filterParticipants(participants, { query, status })),
    [participants, query, status],
  );
  const selectedParticipant = useMemo(
    () => participants.find((participant) => participant.userId === selectedUserId) ?? null,
    [participants, selectedUserId],
  );
  const onlineCount = useMemo(() => participants.filter(isParticipantLive).length, [participants]);

  const dashboardState = useParticipantDashboard(contestId, selectedUserId, {
    refreshIntervalMs: inExamWindow ? DASHBOARD_REFRESH_MS : undefined,
  });
  const dashboard: ParticipantDashboard | null = useMemo(() => {
    const data = dashboardState.data;
    if (!data || !selectedParticipant) return data;
    return {
      ...data,
      participant: {
        ...data.participant,
        ...selectedParticipant,
        startedAt: data.participant.startedAt,
        leftAt: data.participant.leftAt,
        lockedAt: data.participant.lockedAt,
      },
    };
  }, [dashboardState.data, selectedParticipant]);
  const refreshDashboard = dashboardState.refresh;

  const refreshPanel = useCallback(async () => {
    await Promise.all([refreshAdminData(), refreshDashboard()]);
    setDiscoveryKey((key) => key + 1);
  }, [refreshAdminData, refreshDashboard]);

  useEffect(() => registerPanelRefresh("participants", refreshPanel), [refreshPanel, registerPanelRefresh]);

  const actions = useParticipantActions({
    contestId,
    userId: selectedUserId,
    classroomId: contest?.boundClassroomId,
    onChanged: refreshPanel,
  });

  const eventFeed = dashboard?.eventFeed ?? EMPTY_EVENT_FEED;
  const latestEventAt = useMemo(
    () =>
      eventFeed.reduce((latest, event) => {
        const timestamp = Date.parse(event.lastAt);
        return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
      }, 0),
    [eventFeed],
  );
  const newEventCount = eventsOpen
    ? 0
    : eventFeed.filter((event) => {
        const timestamp = Date.parse(event.lastAt);
        return Number.isFinite(timestamp) && timestamp > lastSeenEventAt;
      }).length;
  const selectedIncident =
    eventFeed.find((event) => event.incidentKey === selectedIncidentKey) ||
    eventFeed.find((event) => event.hasEvidence) ||
    eventFeed[0] ||
    null;

  const selectParticipant = useCallback(
    (userId: string) => {
      setSelectedIncidentKey("");
      setEventDetailOpen(false);
      setLastSeenEventAt(Date.now());
      updateParams({ user: userId, problem: null });
    },
    [updateParams],
  );
  const backToList = () => updateParams({ user: null, problem: null });
  const openGrading = () =>
    updateParams({
      panel: dashboard?.contestType === "coding" ? "standings" : "grading-workbench",
      user: null,
      problem: null,
    });

  const searchBox = (
    <TableToolbarSearch
      labelText={t("participants.searchLabel", "搜尋參賽者")}
      placeholder={t("participantsPanel.searchPlaceholder", "搜尋姓名或帳號...")}
      size="md"
      value={query}
      persistent
      onChange={(event) => {
        if (event && typeof event !== "string" && "target" in event) {
          updateParams({ q: event.target.value || null });
        }
      }}
    />
  );

  const listControls = (
    <div className={styles.viewControls}>
      <ContentSwitcher
        size="sm"
        selectedIndex={cardsView ? 1 : 0}
        onChange={({ index }) => updateParams({ view: index === 1 ? "cards" : null })}
      >
        <Switch name="table" text={t("participantsPanel.viewTable", "表格")} disabled={monitorMode} />
        <Switch name="cards" text={t("participantsPanel.viewCards", "卡片")} disabled={monitorMode} />
      </ContentSwitcher>
      <span className={styles.monitorToggle}>
        <Toggle
          id="participants-monitor-mode"
          size="sm"
          hideLabel
          aria-label={t("participantsPanel.monitorMode", "監考模式")}
          labelText={t("participantsPanel.monitorMode", "監考模式")}
          toggled={monitorMode}
          disabled={!inExamWindow}
          onToggle={(on) => updateParams({ monitor: on ? "1" : null })}
        />
        <span>{t("participantsPanel.monitorMode", "監考模式")}</span>
      </span>
      {monitorMode ? (
        <Select
          id="participants-grid-size"
          size="sm"
          hideLabel
          labelText={t("proctoringPanel.gridSize", "每頁監看人數")}
          value={gridSize}
          onChange={(event) => setGridSize(event.target.value === "9" ? 9 : 4)}
        >
          <SelectItem value="4" text={t("proctoringPanel.fourView", "4 人")} />
          <SelectItem value="9" text={t("proctoringPanel.nineView", "9 人")} />
        </Select>
      ) : null}
    </div>
  );

  const toolbarActions = (
    <>
      {!selectedUserId ? (
        <>
          <div className={styles.search}>{searchBox}</div>
          <Select
            id="participants-status-filter"
            size="md"
            hideLabel
            labelText={t("adminOverview.command.participants.filterStatus", "篩選狀態")}
            value={status}
            onChange={(event) => updateParams({ status: event.target.value === "all" ? null : event.target.value })}
          >
            {PARTICIPANT_STATUS_FILTERS.map((option) => (
              <SelectItem key={option.id} value={option.id} text={t(option.labelKey, option.defaultLabel)} />
            ))}
          </Select>
          <ParticipantQrScanButton contestId={contestId} participants={participants} onSelect={selectParticipant} />
        </>
      ) : null}
      <Tag type="green" size="sm">
        {t("proctoringPanel.onlineCount", "{{count}} 人在線", { count: onlineCount })}
      </Tag>
      <Button
        kind="ghost"
        size="md"
        hasIconOnly
        renderIcon={Renew}
        iconDescription={t("adminLayout.header.refresh", "重新整理")}
        disabled={isRefreshing}
        onClick={() => {
          setReconnectKey((key) => key + 1);
          void refreshPanel();
        }}
      />
      {selectedUserId && newEventCount > 0 ? (
        <Tag type="teal" size="sm">
          {t("proctoringPanel.newEventCount", "新事件 {{count}}", { count: newEventCount })}
        </Tag>
      ) : null}
      {selectedUserId && !isMobile ? (
        <Button
          kind={eventsOpen ? "primary" : "ghost"}
          size="md"
          hasIconOnly
          renderIcon={eventsOpen ? RightPanelClose : RightPanelOpen}
          iconDescription={t(
            eventsOpen ? "proctoringPanel.hideEvents" : "proctoringPanel.showEvents",
            eventsOpen ? "隱藏事件列表" : "顯示事件列表",
          )}
          onClick={() => {
            if (!eventsOpen && latestEventAt > 0) setLastSeenEventAt(latestEventAt);
            setEventsOpen((open) => !open);
          }}
        />
      ) : null}
    </>
  );

  const timeline = (
    <div className={styles.timeline}>
      <ParticipantEventTimeline
        events={eventFeed}
        loading={dashboardState.loading}
        error={dashboardState.error}
        selectedKey={selectedIncident?.incidentKey ?? ""}
        selectedIncident={selectedIncident}
        contestId={contestId}
        detailOpen={eventDetailOpen}
        reducedMotion={reducedMotion}
        onCloseDetail={() => setEventDetailOpen(false)}
        onSelect={(event) => {
          setSelectedIncidentKey(event.incidentKey);
          setEventDetailOpen(true);
        }}
      />
    </div>
  );

  const studentDashboard = (
    <div className={styles.dashboard}>
      {dashboardState.error && !dashboard ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={t("dashboard.loadFailed", "載入參賽者 dashboard 失敗")}
          subtitle={dashboardState.error}
        />
      ) : null}
      {!dashboard && !dashboardState.error ? (
        <div>
          <SkeletonText heading width="40%" />
          <SkeletonText width="65%" />
        </div>
      ) : null}
      {dashboard ? (
        <>
          <ParticipantSummaryHeader
            dashboard={dashboard}
            actions={actions}
            showViolations={!!contest?.cheatDetectionEnabled}
            attendanceEnabled={!!contest?.attendanceCheckEnabled}
            onOpenGrading={openGrading}
          />
          {inExamWindow ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t("participantsPanel.liveView", "即時畫面")}</h3>
              <div className={styles.liveStage}>
                <MinimalLiveStage
                  contestId={contestId}
                  participant={selectedParticipant}
                  discoveryRefreshKey={discoveryKey}
                  reconnectKey={reconnectKey}
                  lockActionBusy={actions.busy}
                  monitoringAvailable={inExamWindow}
                  showIdentity={false}
                />
              </div>
            </section>
          ) : null}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("participantsPanel.answerDetails", "作答詳情")}</h3>
            <ParticipantAnswerReport contestId={contestId} dashboard={dashboard} expandedProblemId={problemId} />
          </section>
        </>
      ) : null}
      {isMobile ? timeline : null}
    </div>
  );

  let body;
  if (selectedUserId) {
    body = (
      <div className={`${styles.selected} ${!eventsOpen || isMobile ? styles.selectedEventsCollapsed : ""}`}>
        {!isMobile ? (
          <aside className={styles.rail}>
            <div className={styles.railSearch}>{searchBox}</div>
            <ParticipantRail
              participants={visibleParticipants}
              selectedUserId={selectedUserId}
              onSelect={selectParticipant}
            />
          </aside>
        ) : null}
        {studentDashboard}
        {!isMobile && eventsOpen ? timeline : null}
      </div>
    );
  } else if (monitorMode) {
    body = (
      <div className={styles.monitorBody}>
        <MinimalLiveStage
          contestId={contestId}
          participant={null}
          participants={visibleParticipants}
          discoveryRefreshKey={discoveryKey}
          reconnectKey={reconnectKey}
          lockActionBusy={false}
          monitoringAvailable={inExamWindow}
          layout={gridSize}
          onLayoutChange={() => undefined}
          onSelectParticipant={selectParticipant}
        />
      </div>
    );
  } else {
    body = (
      <div className={styles.listBody}>
        {cardsView ? (
          <ParticipantCardGallery
            participants={visibleParticipants}
            loading={initialLoading}
            onSelect={selectParticipant}
          />
        ) : (
          <ParticipantTable
            participants={visibleParticipants}
            showViolations={!!contest?.cheatDetectionEnabled}
            onSelect={selectParticipant}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PanelToolbar
        className={styles.toolbar}
        leftActions={
          selectedUserId ? (
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              renderIcon={ArrowLeft}
              iconDescription={t("participantsPanel.backToList", "返回列表")}
              onClick={backToList}
            />
          ) : undefined
        }
        title={t("participantsPanel.title", "參賽者")}
        status={selectedUserId ? undefined : listControls}
        actions={toolbarActions}
      />
      {body}
    </div>
  );
}
