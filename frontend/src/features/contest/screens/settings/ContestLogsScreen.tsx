import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Button,
  MultiSelect,
  SkeletonText,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@carbon/react";
import {
  Renew,
  WarningAlt,
  Policy,
  WatsonHealthAiStatusFailed,
  ImageSearch,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { useContestAdmin } from "@/features/contest/contexts";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { KpiCard } from "@/shared/ui/dataCard/KpiCard";
import {
  getEventPriority,
  getEventCategory,
} from "@/features/contest/constants/eventTaxonomy";
import IncidentCard from "@/features/contest/components/admin/IncidentCard";
import { useContestAnticheatConfig } from "@/features/contest/hooks/useContestAnticheatConfig";
import styles from "./ContestLogsScreen.module.scss";

const CATEGORY_FILTER_OPTIONS = [
  { id: "critical", label: "P0 嚴重" },
  { id: "violation", label: "P1 違規" },
  { id: "info", label: "P2 資訊" },
  { id: "system", label: "P3 系統" },
];

const PAGE_SIZE = 50;
const TAB_DEFAULT_CATEGORIES: Record<number, string[]> = {
  0: ["critical", "violation"],
  1: ["info", "system"],
};

const buildActorAggregationKey = (event: {
  eventType: string;
  userId?: string;
  userName?: string;
  id?: string;
  timestamp?: string;
}) => {
  const actorKey = event.userId || event.userName || `${event.id || event.timestamp || "unknown"}`;
  return `${event.eventType}:${actorKey}`;
};

/**
 * Enforce UI contract for external feeds:
 * - activity: never aggregated (always single rows)
 * - exam_event: always aggregated by actor+eventType within window
 */
const normalizeExternalEventFeed = (
  feed: EventFeedItem[],
  aggregationWindowMs: number
): EventFeedItem[] => {
  const incidents: EventFeedItem[] = [];
  const openIncidents = new Map<string, number>();

  const examEventSorted = [...feed]
    .filter((item) => item.source === "exam_event")
    .sort((a, b) => new Date(a.firstAt).getTime() - new Date(b.firstAt).getTime());

  for (const item of examEventSorted) {
    const itemCount = Number.isFinite(item.count) ? Math.max(1, item.count) : 1;
    const itemEvidenceCount = Number.isFinite(item.evidenceCount) ? Math.max(0, item.evidenceCount) : 0;
    const aggregateKey = buildActorAggregationKey({
      eventType: item.eventType,
      userId: item.userId,
      userName: item.userName,
      id: item.incidentKey,
      timestamp: item.firstAt,
    });
    const idx = openIncidents.get(aggregateKey);
    const firstTs = new Date(item.firstAt).getTime();
    const lastTs = new Date(item.lastAt || item.firstAt).getTime();

    if (idx !== undefined) {
      const incident = incidents[idx];
      const incidentLastTs = new Date(incident.lastAt).getTime();
      if (firstTs - incidentLastTs <= aggregationWindowMs) {
        incident.count += itemCount;
        incident.evidenceCount += itemEvidenceCount;
        incident.lastAt =
          incidentLastTs >= lastTs ? incident.lastAt : (item.lastAt || item.firstAt);
        if (item.summary) incident.summary = item.summary;
        continue;
      }
    }

    const priority = Number.isFinite(item.priority) ? item.priority : getEventPriority(item.eventType);
    incidents.push({
      incidentKey: `${aggregateKey}:${item.firstAt}`,
      eventType: item.eventType,
      priority,
      category: item.category || getEventCategory(item.eventType),
      penalized: priority <= 1 && priority >= 0,
      firstAt: item.firstAt,
      lastAt: item.lastAt || item.firstAt,
      count: itemCount,
      evidenceCount: itemEvidenceCount,
      summary: item.summary || "",
      source: "exam_event",
      userName: item.userName,
      userId: item.userId,
      metadata: item.metadata,
    });
    openIncidents.set(aggregateKey, incidents.length - 1);
  }

  const activityExpanded = feed
    .filter((item) => item.source === "activity")
    .flatMap((item) => {
      const expandedCount = Number.isFinite(item.count) ? Math.max(1, item.count) : 1;
      return Array.from({ length: expandedCount }, (_, idx) => ({
        ...item,
        incidentKey: expandedCount > 1 ? `${item.incidentKey}:${idx + 1}` : item.incidentKey,
        count: 1,
        penalized: false,
        evidenceCount: 0,
        source: "activity" as const,
      }));
    });

  incidents.push(...activityExpanded);
  incidents.sort((a, b) => new Date(b.firstAt).getTime() - new Date(a.firstAt).getTime());
  return incidents;
};

/** Group incidents by date label (e.g. "03/09") */
function groupByDate(items: EventFeedItem[]): { dateLabel: string; items: EventFeedItem[] }[] {
  const groups: { dateLabel: string; items: EventFeedItem[] }[] = [];
  let currentLabel = "";
  for (const item of items) {
    const d = new Date(item.firstAt);
    const label = `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ dateLabel: label, items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}

// --- Skeleton ---
const LogsSkeleton = () => (
  <div className={styles.root}>
    <div className={styles.kpiStrip}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.kpiSkeletonCard}>
          <SkeletonText width="100%" />
        </div>
      ))}
    </div>
    <SkeletonText paragraph lineCount={10} />
  </div>
);

interface ContestLogsScreenProps extends Partial<AdminPanelProps> {
  userIdFilter?: string;
  embedded?: boolean;
  eventFeed?: EventFeedItem[];
  onRefresh?: () => Promise<void> | void;
}

const ContestLogsScreen: React.FC<ContestLogsScreenProps> = ({
  userIdFilter,
  embedded = false,
  eventFeed: externalEventFeed,
  onRefresh,
}) => {
  const { contestId } = useParams<{ contestId: string }>();
  const { examEvents, isRefreshing, refreshAdminData } = useContestAdmin();
  const { t } = useTranslation("contest");
  const {
    config: antiCheatConfig,
    loading: antiCheatConfigLoading,
    refresh: refreshAntiCheatConfig,
  } = useContestAnticheatConfig(contestId);

  const sourceEvents = useMemo(() => {
    if (!userIdFilter) return examEvents;
    return examEvents.filter((event) => String(event.userId) === userIdFilter);
  }, [examEvents, userIdFilter]);

  const aggregationWindowMs = antiCheatConfig
    ? Math.max(1, antiCheatConfig.effective.eventFeedAggregationWindowSeconds) * 1000
    : null;

  // Build event feed from examEvents if not provided externally
  const eventFeed = useMemo(() => {
    if (aggregationWindowMs == null) return [];
    if (externalEventFeed) return normalizeExternalEventFeed(externalEventFeed, aggregationWindowMs);
    const isActivityEvent = (event: { metadata?: Record<string, unknown> }) =>
      event.metadata?.source === "activity";

    const examEventSorted = [...sourceEvents]
      .filter((e) => !isActivityEvent(e) && e.eventType !== "heartbeat")
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const activityEventSorted = [...sourceEvents]
      .filter((e) => isActivityEvent(e))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const incidents: EventFeedItem[] = [];
    const openIncidents = new Map<string, number>();

    for (const event of examEventSorted) {
      const et = event.eventType;
      const ts = new Date(event.timestamp).getTime();
      const aggregateKey = buildActorAggregationKey(event);
      const idx = openIncidents.get(aggregateKey);

      if (idx !== undefined) {
        const inc = incidents[idx];
        const lastTs = new Date(inc.lastAt).getTime();
        if (ts - lastTs <= aggregationWindowMs) {
          inc.count += 1;
          inc.lastAt = event.timestamp;
          if (event.metadata?.forced_capture_uploaded) inc.evidenceCount += 1;
          if (event.reason) inc.summary = event.reason;
          continue;
        }
      }

      const priority = getEventPriority(et);
      incidents.push({
        incidentKey: `${aggregateKey}:${event.timestamp}`,
        eventType: et,
        priority,
        category: getEventCategory(et),
        penalized: priority <= 1 && priority >= 0,
        firstAt: event.timestamp,
        lastAt: event.timestamp,
        count: 1,
        evidenceCount: event.metadata?.forced_capture_uploaded ? 1 : 0,
        summary: event.reason || "",
        source: "exam_event",
        userName: event.userName,
        userId: event.userId,
        metadata: event.metadata,
      });
      openIncidents.set(aggregateKey, incidents.length - 1);
    }

    for (const event of activityEventSorted) {
      const priority = getEventPriority(event.eventType);
      incidents.push({
        incidentKey: `activity:${event.id || `${event.userId}:${event.timestamp}:${event.eventType}`}`,
        eventType: event.eventType,
        priority,
        category: getEventCategory(event.eventType),
        penalized: false,
        firstAt: event.timestamp,
        lastAt: event.timestamp,
        count: 1,
        evidenceCount: 0,
        summary: event.reason || "",
        source: "activity",
        userName: event.userName,
        userId: event.userId,
        metadata: event.metadata,
      });
    }

    incidents.sort((a, b) => new Date(b.firstAt).getTime() - new Date(a.firstAt).getTime());
    return incidents;
  }, [aggregationWindowMs, sourceEvents, externalEventFeed]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(TAB_DEFAULT_CATEGORIES[0]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeTab, setActiveTab] = useState(0);
  const [isRefreshPending, setIsRefreshPending] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // --- KPI ---
  const kpiCounts = useMemo(() => {
    const counts = { critical: 0, violation: 0, heartbeatTimeout: 0, degraded: 0 };
    for (const inc of eventFeed) {
      if (inc.priority === 0) counts.critical++;
      if (inc.priority === 1) counts.violation++;
      if (inc.eventType === "heartbeat_timeout") counts.heartbeatTimeout++;
      if (inc.eventType === "capture_upload_degraded") counts.degraded++;
    }
    return counts;
  }, [eventFeed]);

  // --- Filter ---
  const tabFilteredFeed = useMemo(() => {
    if (activeTab === 0) return eventFeed.filter((inc) => inc.priority <= 1);
    return eventFeed.filter((inc) => inc.priority >= 2);
  }, [eventFeed, activeTab]);

  const filteredFeed = useMemo(() => {
    let result = tabFilteredFeed;
    if (selectedCategories.length > 0) {
      result = result.filter((inc) => selectedCategories.includes(inc.category));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (inc) =>
          inc.eventType.toLowerCase().includes(q) ||
          inc.summary.toLowerCase().includes(q) ||
          (inc.userName?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [tabFilteredFeed, selectedCategories, searchTerm]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [selectedCategories, searchTerm, activeTab]);
  useEffect(() => { setSelectedCategories(TAB_DEFAULT_CATEGORIES[activeTab] || []); }, [activeTab]);

  const visibleFeed = filteredFeed.slice(0, visibleCount);
  const dateGroups = useMemo(() => groupByDate(visibleFeed), [visibleFeed]);
  const hasMore = visibleCount < filteredFeed.length;

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) handleLoadMore(); },
      { root: container, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  const loading = antiCheatConfigLoading || (sourceEvents.length === 0 && isRefreshing);
  const isConfigUnavailable = !antiCheatConfig && !antiCheatConfigLoading;

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isRefreshPending || antiCheatConfigLoading) return;
    setIsRefreshPending(true);
    const tasks: Promise<unknown>[] = [];
    try {
      if (!externalEventFeed) tasks.push(Promise.resolve(refreshAdminData()));
      if (onRefresh) tasks.push(Promise.resolve(onRefresh()));
      tasks.push(Promise.resolve(refreshAntiCheatConfig()));
      if (tasks.length === 0) tasks.push(Promise.resolve(refreshAdminData()));
      await Promise.allSettled(tasks);
    } finally {
      setIsRefreshPending(false);
    }
  }, [
    antiCheatConfigLoading,
    externalEventFeed,
    isRefreshPending,
    isRefreshing,
    onRefresh,
    refreshAdminData,
    refreshAntiCheatConfig,
  ]);

  const handleKpiClick = (category: string) => {
    if (activeTab !== 0) return;
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  // ========== RENDER ==========

  if (loading) {
    if (embedded) return <div className={styles.embeddedRoot}><LogsSkeleton /></div>;
    return <SurfaceSection maxWidth="1400px" style={{ height: "100%", overflowY: "auto" }}><LogsSkeleton /></SurfaceSection>;
  }

  if (isConfigUnavailable) {
    const errorContent = (
      <div className={styles.root}>
        <div className={styles.feedSection}>
          <div className={styles.feedHeader}>
            <h4 className={styles.feedTitle}>{t("logs.eventRecords", "事件紀錄")}</h4>
            <Button
              kind="ghost"
              renderIcon={Renew}
              onClick={() => { void handleRefresh(); }}
              hasIconOnly
              iconDescription={t("common.refresh", "重新整理")}
              disabled={isRefreshPending}
              size="sm"
            />
          </div>
          <div className={styles.feedEmpty}>
            {t("logs.anticheatConfigUnavailable", "無法載入防作弊策略設定，請稍後重新整理。")}
          </div>
        </div>
      </div>
    );

    if (embedded) return <div className={styles.embeddedRoot}>{errorContent}</div>;
    return (
      <SurfaceSection maxWidth="1400px" style={{ height: "100%", overflowY: "auto" }}>
        {errorContent}
      </SurfaceSection>
    );
  }
  const effectiveConfig = antiCheatConfig!.effective;

  const kpiItems = [
    { key: "critical", icon: WarningAlt, color: "#da1e28", label: t("logs.kpi.critical", "高風險事件"), count: kpiCounts.critical, filterable: true },
    { key: "violation", icon: Policy, color: "#ff832b", label: t("logs.kpi.violation", "計罰違規"), count: kpiCounts.violation, filterable: true },
    { key: "heartbeatTimeout", icon: WatsonHealthAiStatusFailed, color: "#0f62fe", label: t("logs.kpi.heartbeatTimeout", "心跳逾時"), count: kpiCounts.heartbeatTimeout, filterable: false },
    { key: "degraded", icon: ImageSearch, color: "#8a3ffc", label: t("logs.kpi.degraded", "證據異常"), count: kpiCounts.degraded, filterable: false },
  ] as const;

  const kpiStrip = (
    <div className={styles.kpiStrip}>
      {kpiItems.map(({ key, icon: Icon, color, label, count, filterable }) => (
        <KpiCard
          key={key}
          icon={<Icon size={20} style={{ color }} />}
          value={<span style={{ color }}>{count}</span>}
          label={label}
          showBorder={false}
          active={filterable && selectedCategories.includes(key)}
          onClick={filterable ? () => handleKpiClick(key) : undefined}
        />
      ))}
    </div>
  );

  const feedPanel = (panelIndex: number) => (
    <>
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder={t("logs.searchPlaceholder", "搜尋使用者、事件類型、原因…")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className={styles.filterWrapper}>
          <MultiSelect
            id={`event-category-filter-${panelIndex}`}
            titleText=""
            label={t("logs.filterCategory", "篩選優先級")}
            items={CATEGORY_FILTER_OPTIONS}
            itemToString={(item: { label: string } | null) => item?.label || ""}
            selectedItems={CATEGORY_FILTER_OPTIONS.filter((opt) => selectedCategories.includes(opt.id))}
            onChange={(data) => {
              const items = (data.selectedItems ?? []).filter(
                (item): item is { id: string; label: string } => item != null,
              );
              setSelectedCategories(items.map((item) => item.id));
            }}
            size="md"
          />
        </div>
      </div>

      {filteredFeed.length === 0 ? (
        <div className={styles.feedEmpty}>
          {eventFeed.length === 0
            ? t("logs.noEvents", "暫無事件紀錄")
            : t("logs.noMatchingEvents", "無符合篩選條件的事件")}
        </div>
      ) : (
        <>
          <div className={styles.feedScroll} ref={scrollContainerRef}>
            {dateGroups.map((group) => (
              <div key={group.dateLabel}>
                <div className={styles.dateSeparator}>
                  <span>{group.dateLabel}</span>
                </div>
                {group.items.map((incident) => (
                  <IncidentCard
                    key={incident.incidentKey}
                    incident={incident}
                    screenshotWindowBeforeMs={effectiveConfig.incidentScreenshotWindowBeforeMs}
                    screenshotWindowAfterMs={effectiveConfig.incidentScreenshotWindowAfterMs}
                    screenshotPreviewLimit={effectiveConfig.incidentScreenshotPreviewLimit}
                    screenshotCategories={effectiveConfig.incidentScreenshotCategories}
                  />
                ))}
              </div>
            ))}
            <div ref={sentinelRef} className={styles.scrollSentinel} />
          </div>
          <div className={styles.statusFooter}>
            {hasMore
              ? t("logs.loadedCount", { loaded: visibleFeed.length, total: filteredFeed.length })
              : t("logs.totalCount", { total: filteredFeed.length })}
          </div>
        </>
      )}
    </>
  );

  const content = (
    <div className={styles.root}>
      {kpiStrip}

      <div className={styles.feedSection}>
        <div className={styles.feedHeader}>
          <h4 className={styles.feedTitle}>{t("logs.eventRecords", "事件紀錄")}</h4>
          <Button
            kind="ghost"
            renderIcon={Renew}
            onClick={() => { void handleRefresh(); }}
            hasIconOnly
            iconDescription={t("common.refresh", "重新整理")}
            disabled={isRefreshing || isRefreshPending || antiCheatConfigLoading}
            size="sm"
          />
        </div>
        <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}>
          <TabList aria-label="Event feed tabs">
            <Tab>{t("logs.tabs.abnormal", "異常事件")}</Tab>
            <Tab>{t("logs.tabs.system", "系統/管理事件")}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>{feedPanel(0)}</TabPanel>
            <TabPanel>{feedPanel(1)}</TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );

  if (embedded) {
    return <div className={styles.embeddedRoot}>{content}</div>;
  }
  return <SurfaceSection maxWidth="1400px" style={{ height: "100%", overflowY: "auto" }}>{content}</SurfaceSection>;
};

export default ContestLogsScreen;
