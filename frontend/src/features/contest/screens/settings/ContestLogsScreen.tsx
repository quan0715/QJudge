import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Button,
  Modal,
  MultiSelect,
  SkeletonText,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@carbon/react";
import {
  Policy,
  Renew,
  WarningAlt,
  WarningFilled,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { EventFeedItem } from "@/core/entities/contest.entity";
import type { AdminPanelProps } from "@/features/contest/modules/types";
import { useContestAdmin } from "@/features/contest/contexts";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { KpiCard } from "@/shared/ui/dataCard/KpiCard";
import { getEventTypeLabel } from "@/features/contest/constants/eventTaxonomy";
import EventIncidentCard from "@/features/contest/components/admin/EventIncidentCard";
import IncidentCard from "@/features/contest/components/admin/IncidentCard";
import styles from "./ContestLogsScreen.module.scss";

const CATEGORY_FILTER_OPTIONS = [
  { id: "critical", label: "P0 嚴重" },
  { id: "violation", label: "P1 違規" },
  { id: "info", label: "P2 資訊" },
  { id: "system", label: "P3 系統" },
];

const PAGE_SIZE = 50;
const TAB_DEFAULT_CATEGORIES: Record<number, string[]> = {
  0: ["critical", "violation", "info"],
  1: ["system"],
};

/** Group incidents by date label (e.g. "03/09") */
function groupByDate(
  items: EventFeedItem[],
): { dateLabel: string; items: EventFeedItem[] }[] {
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
const LogsSkeleton = ({ showKpis = true }: { showKpis?: boolean }) => (
  <div className={styles.root}>
    {showKpis ? (
      <div className={styles.kpiStrip}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.kpiSkeletonCard}>
            <SkeletonText width="100%" />
          </div>
        ))}
      </div>
    ) : null}
    <div className={styles.skeletonFeed}>
      <SkeletonText paragraph lineCount={10} />
    </div>
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
  const {
    examEvents,
    eventFeed: contestEventFeed,
    examEventsLoading,
    isRefreshing,
    refreshAdminData,
  } = useContestAdmin();
  const { t } = useTranslation("contest");

  const eventFeed = useMemo(() => {
    const source = externalEventFeed ?? contestEventFeed;
    return source
      .filter((item) => !userIdFilter || String(item.userId) === userIdFilter)
      .sort((left, right) => Date.parse(right.firstAt) - Date.parse(left.firstAt));
  }, [contestEventFeed, externalEventFeed, userIdFilter]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    embedded ? [] : TAB_DEFAULT_CATEGORIES[0],
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeTab, setActiveTab] = useState(0);
  const [isRefreshPending, setIsRefreshPending] = useState(false);
  const [selectedIncident, setSelectedIncident] =
    useState<EventFeedItem | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // --- KPI ---
  const kpiCounts = useMemo(() => {
    const counts = {
      critical: 0,
      violation: 0,
      connectivityTimeout: 0,
    };
    for (const inc of eventFeed) {
      if (inc.priority === 0) counts.critical++;
      if (inc.priority === 1) counts.violation++;
      if (inc.eventType === "connectivity_timeout") counts.connectivityTimeout++;
    }
    return counts;
  }, [eventFeed]);

  // --- Filter ---
  const getFilteredFeedForPanel = useCallback(
    (panelIndex: number | "all") => {
      let result =
        panelIndex === "all"
          ? eventFeed
          : panelIndex === 0
          ? eventFeed.filter((inc) => inc.priority <= 2)
          : eventFeed.filter((inc) => inc.priority >= 3);
      if (selectedCategories.length > 0) {
        result = result.filter((inc) =>
          selectedCategories.includes(inc.category),
        );
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
    },
    [eventFeed, selectedCategories, searchTerm],
  );

  const filteredFeed = useMemo(
    () => getFilteredFeedForPanel(embedded ? "all" : activeTab),
    [activeTab, embedded, getFilteredFeedForPanel],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategories, searchTerm, activeTab]);
  useEffect(() => {
    if (embedded) return;
    setSelectedCategories(TAB_DEFAULT_CATEGORIES[activeTab] || []);
  }, [activeTab, embedded]);

  const hasMore = visibleCount < filteredFeed.length;

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) handleLoadMore();
      },
      { root: embedded ? null : container, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [embedded, hasMore, handleLoadMore]);

  const loading = examEvents.length === 0 && (isRefreshing || examEventsLoading);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isRefreshPending) return;
    setIsRefreshPending(true);
    const tasks: Promise<unknown>[] = [];
    try {
      if (!externalEventFeed) tasks.push(Promise.resolve(refreshAdminData()));
      if (onRefresh) tasks.push(Promise.resolve(onRefresh()));
      if (tasks.length === 0) tasks.push(Promise.resolve(refreshAdminData()));
      await Promise.allSettled(tasks);
    } finally {
      setIsRefreshPending(false);
    }
  }, [
    externalEventFeed,
    isRefreshPending,
    isRefreshing,
    onRefresh,
    refreshAdminData,
  ]);


  const handleKpiClick = (category: string) => {
    if (activeTab !== 0) return;
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  // ========== RENDER ==========

  if (loading) {
    if (embedded)
      return (
        <div className={styles.embeddedRoot}>
          <LogsSkeleton showKpis={false} />
        </div>
      );
    return (
      <SurfaceSection
        maxWidth="1400px"
        style={{ height: "100%", overflowY: "auto" }}
      >
        <LogsSkeleton />
      </SurfaceSection>
    );
  }

  const kpiItems = [
    {
      key: "critical",
      icon: WarningAlt,
      color: "#da1e28",
      label: t("logs.kpi.critical", "高風險事件"),
      count: kpiCounts.critical,
      filterable: true,
    },
    {
      key: "violation",
      icon: Policy,
      color: "#ff832b",
      label: t("logs.kpi.violation", "計罰違規"),
      count: kpiCounts.violation,
      filterable: true,
    },
    {
      key: "connectivityTimeout",
      icon: WarningFilled,
      color: "#0f62fe",
      label: t("logs.kpi.connectivityTimeout", "心跳逾時"),
      count: kpiCounts.connectivityTimeout,
      filterable: false,
    },
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

  const renderCompactIncident = (incident: EventFeedItem) => {
    return (
      <EventIncidentCard
        key={incident.incidentKey}
        incident={incident}
        onSelect={setSelectedIncident}
      />
    );
  };

  const feedPanel = (panelIndex: number | "all") => {
    const panelFilteredFeed = getFilteredFeedForPanel(panelIndex);
    const panelVisibleFeed = panelFilteredFeed.slice(0, visibleCount);
    const panelDateGroups = groupByDate(panelVisibleFeed);
    const panelHasMore = visibleCount < panelFilteredFeed.length;

    return (
      <>
        {embedded ? null : (
          <div className={styles.toolbar}>
            <div className={styles.searchWrapper}>
              <input
                className={styles.searchInput}
                type="text"
                aria-label={t(
                  "logs.searchPlaceholder",
                  "搜尋使用者、事件類型、原因…",
                )}
                placeholder={t(
                  "logs.searchPlaceholder",
                  "搜尋使用者、事件類型、原因…",
                )}
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
                itemToString={(item: { label: string } | null) =>
                  item?.label || ""
                }
                selectedItems={CATEGORY_FILTER_OPTIONS.filter((opt) =>
                  selectedCategories.includes(opt.id),
                )}
                onChange={(data) => {
                  const items = (data.selectedItems ?? []).filter(
                    (item): item is { id: string; label: string } =>
                      item != null,
                  );
                  setSelectedCategories(items.map((item) => item.id));
                }}
                size="md"
              />
            </div>
          </div>
        )}

        {panelFilteredFeed.length === 0 ? (
          <div className={styles.feedEmpty}>
            {eventFeed.length === 0
              ? t("logs.noEvents", "暫無事件紀錄")
              : t("logs.noMatchingEvents", "無符合篩選條件的事件")}
          </div>
        ) : (
          <>
            <div className={styles.feedScroll} ref={scrollContainerRef}>
              {panelDateGroups.map((group) => (
                <div key={group.dateLabel}>
                  <div className={styles.dateSeparator}>
                    <span>{group.dateLabel}</span>
                  </div>
                  {embedded
                    ? group.items.map(renderCompactIncident)
                    : group.items.map((incident) => (
                        <IncidentCard
                          key={incident.incidentKey}
                          incident={incident}
                        />
                      ))}
                </div>
              ))}
              <div ref={sentinelRef} className={styles.scrollSentinel} />
            </div>
            <div className={styles.statusFooter}>
              {panelHasMore
                ? t("logs.loadedCount", {
                    loaded: panelVisibleFeed.length,
                    total: panelFilteredFeed.length,
                  })
                : t("logs.totalCount", { total: panelFilteredFeed.length })}
            </div>
          </>
        )}
      </>
    );
  };

  const selectedIncidentTitle = selectedIncident
    ? getEventTypeLabel(
        (key, fallback) => String(t(key, fallback ?? "")),
        selectedIncident.eventType,
      )
    : t("logs.eventDetail", "事件詳情");

  const content = (
    <>
      <div className={styles.root}>
        {embedded ? null : kpiStrip}

        <div className={styles.feedSection}>
          {embedded ? (
            <>
              <div className={styles.embeddedFeedHeader}>
                <h4 className={styles.feedTitle}>
                  {t("logs.eventRecords", "事件紀錄")}
                </h4>
                <Button
                  kind="ghost"
                  renderIcon={Renew}
                  onClick={() => {
                    void handleRefresh();
                  }}
                  hasIconOnly
                  iconDescription={t("action.refresh", "重新整理")}
                  disabled={isRefreshing || isRefreshPending}
                  size="sm"
                />
              </div>
              {feedPanel("all")}
            </>
          ) : (
            <>
              <div className={styles.feedHeader}>
                <h4 className={styles.feedTitle}>
                  {t("logs.eventRecords", "事件紀錄")}
                </h4>
              </div>
              <Tabs
                selectedIndex={activeTab}
                onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
              >
                <TabList aria-label="Event feed tabs">
                  <Tab>{t("logs.tabs.abnormal", "異常事件")}</Tab>
                  <Tab>{t("logs.tabs.system", "系統/管理事件")}</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>{feedPanel(0)}</TabPanel>
                  <TabPanel>{feedPanel(1)}</TabPanel>
                </TabPanels>
              </Tabs>
            </>
          )}
        </div>
      </div>
      <Modal
        open={!!selectedIncident}
        onRequestClose={() => setSelectedIncident(null)}
        modalHeading={selectedIncidentTitle}
        passiveModal
        size="lg"
      >
        {selectedIncident ? (
          <div className={styles.eventDetailModalBody}>
            <IncidentCard
              incident={selectedIncident}
              initialExpanded
              collapsible={false}
            />
          </div>
        ) : null}
      </Modal>
    </>
  );

  if (embedded) {
    return <div className={styles.embeddedRoot}>{content}</div>;
  }
  return (
    <SurfaceSection
      maxWidth="1400px"
      style={{ height: "100%", overflowY: "auto" }}
    >
      {content}
    </SurfaceSection>
  );
};

export default ContestLogsScreen;
