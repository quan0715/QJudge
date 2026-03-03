import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Button,
  Tag,
  MultiSelect,
  SkeletonText,
  SkeletonPlaceholder,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { StackedBarChart } from "@carbon/charts-react";
import { ScaleTypes } from "@carbon/charts";
import "@carbon/charts-react/styles.css";
import type { ExamEvent } from "@/core/entities/contest.entity";
import { useContestAdmin } from "@/features/contest/contexts";
import ContainerCard from "@/shared/layout/ContainerCard";
import SurfaceSection from "@/shared/layout/SurfaceSection";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import styles from "./ContestLogsScreen.module.scss";

// --- Event type config ---
type Severity = "violation" | "lifecycle" | "submission" | "admin";

// Tag color follows severity category:
// violation=red, lifecycle=green, submission=blue, admin=purple
const SEVERITY_TAG: Record<Severity, "red" | "green" | "blue" | "purple"> = {
  violation: "red",
  lifecycle: "green",
  submission: "blue",
  admin: "purple",
};

const EVENT_MAP: Record<string, { label: string; severity: Severity }> = {
  join: { label: "加入", severity: "lifecycle" },
  register: { label: "註冊", severity: "lifecycle" },
  unregister: { label: "取消註冊", severity: "admin" },
  enter_contest: { label: "進入競賽", severity: "lifecycle" },
  leave: { label: "離開競賽", severity: "lifecycle" },
  start_exam: { label: "開始考試", severity: "lifecycle" },
  end_exam: { label: "結束考試", severity: "lifecycle" },
  auto_submit: { label: "自動提交", severity: "lifecycle" },
  resume_exam: { label: "繼續考試", severity: "lifecycle" },
  reopen_exam: { label: "重新開放考試", severity: "lifecycle" },
  pause_exam: { label: "暫停考試", severity: "lifecycle" },
  submit: { label: "提交", severity: "submission" },
  submit_code: { label: "提交程式碼", severity: "submission" },
  tab_switch: { label: "切換分頁", severity: "violation" },
  tab_hidden: { label: "隱藏分頁", severity: "violation" },
  window_blur: { label: "離開視窗", severity: "violation" },
  exit_fullscreen: { label: "退出全螢幕", severity: "violation" },
  forbidden_focus_event: { label: "禁止焦點事件", severity: "violation" },
  forbidden_action: { label: "禁止操作", severity: "violation" },
  multiple_displays: { label: "多螢幕偵測", severity: "violation" },
  cheat_warning: { label: "違規警告", severity: "violation" },
  lock: { label: "鎖定", severity: "violation" },
  lock_user: { label: "鎖定用戶", severity: "violation" },
  unlock: { label: "解鎖", severity: "admin" },
  unlock_user: { label: "解鎖用戶", severity: "admin" },
  ask_question: { label: "提問", severity: "lifecycle" },
  reply_question: { label: "回覆提問", severity: "admin" },
  announce: { label: "發布公告", severity: "admin" },
  update_contest: { label: "更新競賽設定", severity: "admin" },
  update_problem: { label: "更新題目", severity: "admin" },
  update_participant: { label: "更新參與者", severity: "admin" },
  publish_problem_to_practice: { label: "發布到練習區", severity: "admin" },
  other: { label: "其他", severity: "admin" },
};

const getEventConfig = (type: string) => {
  const entry = EVENT_MAP[type] || { label: type, severity: "admin" as Severity };
  return { ...entry, tagType: SEVERITY_TAG[entry.severity] };
};

const SEVERITY_CLASS: Record<Severity, string> = {
  violation: styles.severityViolation,
  lifecycle: styles.severityLifecycle,
  submission: styles.severitySubmission,
  admin: styles.severityAdmin,
};

// --- Category filter ---
const EVENT_FILTER_OPTIONS = [
  { id: "violation", label: "違規事件", types: ["tab_hidden", "window_blur", "exit_fullscreen", "forbidden_focus_event", "forbidden_action", "multiple_displays", "lock_user", "cheat_warning", "lock", "tab_switch"] },
  { id: "submission", label: "程式提交", types: ["submit", "submit_code"] },
  { id: "lifecycle", label: "考試狀態", types: ["register", "enter_contest", "start_exam", "end_exam", "auto_submit", "resume_exam", "reopen_exam", "pause_exam", "leave", "join", "ask_question"] },
  { id: "admin", label: "管理操作", types: ["unregister", "unlock_user", "unlock", "update_participant", "update_contest", "update_problem", "announce", "reply_question", "publish_problem_to_practice", "other"] },
];

const EVENT_CATEGORIES = {
  violation: EVENT_FILTER_OPTIONS[0].types,
  submission: EVENT_FILTER_OPTIONS[1].types,
  lifecycle: EVENT_FILTER_OPTIONS[2].types,
  admin: EVENT_FILTER_OPTIONS[3].types,
};

const PAGE_SIZE = 50;
const SLOT_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const parseMs = (value?: string | null): number | null => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
};

// --- Helpers ---
function formatSlotLabel(ts: string) {
  const d = new Date(ts);
  const slotMs = Math.floor(d.getTime() / SLOT_MS) * SLOT_MS;
  const slot = new Date(slotMs);
  const mm = (slot.getMonth() + 1).toString().padStart(2, "0");
  const dd = slot.getDate().toString().padStart(2, "0");
  const hh = slot.getHours().toString().padStart(2, "0");
  const mi = slot.getMinutes().toString().padStart(2, "0");
  return { key: slotMs, label: `${mm}/${dd} ${hh}:${mi}` };
}

function groupByTimeSlot(events: ExamEvent[]) {
  const groups: { key: number; label: string; events: ExamEvent[] }[] = [];
  let currentKey = -1;
  for (const ev of events) {
    const { key, label } = formatSlotLabel(ev.timestamp);
    if (key !== currentKey) {
      currentKey = key;
      groups.push({ key, label, events: [] });
    }
    groups[groups.length - 1].events.push(ev);
  }
  return groups;
}

// --- Skeleton placeholder ---
const LogsSkeleton = () => (
  <div className={styles.twoColumn}>
    <div className={styles.chartsCol}>
      <ContainerCard title={<SkeletonText width="80px" />}>
        <div className={styles.summaryGrid}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.summaryItem}>
              <SkeletonText width="100%" />
            </div>
          ))}
        </div>
      </ContainerCard>
      <ContainerCard title={<SkeletonText width="100px" />}>
        <SkeletonPlaceholder style={{ width: "100%", height: "280px" }} />
      </ContainerCard>
    </div>
    <div className={styles.timelineCol}>
      <ContainerCard title={<SkeletonText width="80px" />}>
        <div style={{ marginBottom: "1rem" }}>
          <SkeletonText paragraph lineCount={3} />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ marginBottom: "0.5rem" }}>
            <SkeletonText width="30%" />
            <SkeletonText paragraph lineCount={2} />
          </div>
        ))}
      </ContainerCard>
    </div>
  </div>
);

// --- Component ---
const ContestAdminLogsPage = () => {
  const { examEvents, isRefreshing, refreshAdminData } = useContestAdmin();
  const { theme } = useTheme();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [indicatorTime, setIndicatorTime] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  // --- Sorting & Filtering ---
  const sortedEvents = useMemo(
    () =>
      [...examEvents].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      ),
    [examEvents],
  );

  const selectedTypes = useMemo(() => {
    if (selectedEventTypes.length === 0) return null;
    const types: string[] = [];
    selectedEventTypes.forEach((catId) => {
      const cat = EVENT_FILTER_OPTIONS.find((o) => o.id === catId);
      if (cat) types.push(...cat.types);
    });
    return types;
  }, [selectedEventTypes]);

  const filteredEvents = useMemo(() => {
    let result = sortedEvents;
    if (selectedTypes && selectedTypes.length > 0) {
      result = result.filter((e) => selectedTypes.includes(e.eventType));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (e) =>
          e.userName?.toLowerCase().includes(q) ||
          e.eventType?.toLowerCase().includes(q) ||
          e.reason?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [sortedEvents, selectedTypes, searchTerm]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedEventTypes, searchTerm]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const timeSlotGroups = useMemo(() => groupByTimeSlot(visibleEvents), [visibleEvents]);
  const hasMore = visibleCount < filteredEvents.length;

  // --- Infinite scroll ---
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
      { root: container, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, handleLoadMore]);

  // --- Time indicator: track topmost visible event on scroll ---
  const handleTimelineScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const cards = container.querySelectorAll("[data-timestamp]");
    if (!cards.length) return;

    const containerTop = container.getBoundingClientRect().top;
    let closest: string | null = null;
    for (const card of cards) {
      const rect = (card as HTMLElement).getBoundingClientRect();
      if (rect.top >= containerTop - 4) {
        closest = (card as HTMLElement).dataset.timestamp || null;
        break;
      }
    }
    // If scrolled past all cards, use the last one
    if (!closest && cards.length > 0) {
      closest = (cards[cards.length - 1] as HTMLElement).dataset.timestamp || null;
    }
    setIndicatorTime(closest);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("scroll", handleTimelineScroll, { passive: true });
    // Set initial indicator
    handleTimelineScroll();
    return () => container.removeEventListener("scroll", handleTimelineScroll);
  }, [handleTimelineScroll, filteredEvents]);

  // --- Summary counts ---
  const summaryCounts = useMemo(() => {
    const counts = { violation: 0, submission: 0, lifecycle: 0, admin: 0 };
    examEvents.forEach((e) => {
      if (EVENT_CATEGORIES.violation.includes(e.eventType)) counts.violation++;
      else if (EVENT_CATEGORIES.submission.includes(e.eventType)) counts.submission++;
      else if (EVENT_CATEGORIES.lifecycle.includes(e.eventType)) counts.lifecycle++;
      else counts.admin++;
    });
    return counts;
  }, [examEvents]);

  const chartWindow = useMemo(() => {
    const eventTimes = examEvents
      .map((event) => parseMs(event.timestamp))
      .filter((ms): ms is number => ms !== null)
      .sort((a, b) => a - b);

    if (eventTimes.length === 0) return null;

    const startMs = eventTimes[0];
    const endMs = eventTimes[eventTimes.length - 1];

    return { startMs, endMs };
  }, [examEvents]);

  // --- Chart data ---
  const chartData = useMemo(() => {
    if (!chartWindow) return [];
    const { startMs, endMs } = chartWindow;

    // Hour-based buckets anchored to natural hour boundaries.
    const bucketStartMs = Math.floor(startMs / HOUR_MS) * HOUR_MS;
    const bucketEndMs = Math.floor(endMs / HOUR_MS) * HOUR_MS;
    const intervals = new Map<number, { violation: number; submission: number; lifecycle: number; admin: number }>();

    let t = bucketStartMs;
    while (t <= bucketEndMs) {
      intervals.set(t, { violation: 0, submission: 0, lifecycle: 0, admin: 0 });
      t += HOUR_MS;
    }

    examEvents.forEach((event) => {
      const et = parseMs(event.timestamp);
      if (et === null || et < startMs || et > endMs) return;
      const slot =
        Math.floor(et / HOUR_MS) * HOUR_MS;
      if (!intervals.has(slot))
        intervals.set(slot, { violation: 0, submission: 0, lifecycle: 0, admin: 0 });
      const c = intervals.get(slot)!;
      if (EVENT_CATEGORIES.violation.includes(event.eventType)) c.violation++;
      else if (EVENT_CATEGORIES.submission.includes(event.eventType)) c.submission++;
      else if (EVENT_CATEGORIES.lifecycle.includes(event.eventType)) c.lifecycle++;
      else c.admin++;
    });

    const data: { group: string; key: string; value: number }[] = [];
    Array.from(intervals.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([ts, counts]) => {
        const d = new Date(ts);
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        const hh = d.getHours().toString().padStart(2, "0");
        const label = `${month}/${day} ${hh}:00`;
        data.push({ group: "違規事件", key: label, value: counts.violation });
        data.push({ group: "程式提交", key: label, value: counts.submission });
        data.push({ group: "考試狀態", key: label, value: counts.lifecycle });
        data.push({ group: "管理操作", key: label, value: counts.admin });
      });
    return data;
  }, [examEvents, chartWindow]);

  // --- Compute time indicator Y position on chart ---
  const indicatorPosition = useMemo(() => {
    if (!indicatorTime || !chartWindow) return null;
    const { startMs, endMs } = chartWindow;
    const range = endMs - startMs;
    if (range <= 0) return null;

    const eventMs = parseMs(indicatorTime);
    if (eventMs === null) return null;
    const ratio = Math.max(0, Math.min(1, (eventMs - startMs) / range));

    const d = new Date(indicatorTime);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ss = d.getSeconds().toString().padStart(2, "0");

    return { ratio, label: `${hh}:${mm}:${ss}` };
  }, [indicatorTime, chartWindow]);

  const chartBarCount = useMemo(() => {
    const keys = new Set(chartData.map((d) => d.key));
    return keys.size;
  }, [chartData]);

  const chartOptions = useMemo(
    () => ({
      title: "",
      axes: {
        left: { mapsTo: "key", scaleType: ScaleTypes.LABELS },
        bottom: { mapsTo: "value", title: "事件數量", scaleType: ScaleTypes.LINEAR, stacked: true },
      },
      height: `${Math.max(280, chartBarCount * 18)}px`,
      theme,
      color: {
        scale: {
          "違規事件": "#da1e28",
          "程式提交": "#0f62fe",
          "考試狀態": "#24a148",
          "管理操作": "#8a3ffc",
        },
      },
      legend: { alignment: "center" as const, position: "bottom" as const },
      toolbar: { enabled: false },
      tooltip: { showTotal: true },
      bars: { maxWidth: 16 },
    }),
    [theme, chartBarCount],
  );

  const loading = examEvents.length === 0 && isRefreshing;

  // --- Render ---
  return (
    <SurfaceSection maxWidth="1400px" style={{ flex: 1, minHeight: "100%" }}>
      {loading ? (
        <LogsSkeleton />
      ) : (
        <div className={styles.twoColumn}>
          {/* Left Column: Charts */}
          <div className={styles.chartsCol}>
            <ContainerCard title="事件摘要">
              <div className={styles.summaryGrid}>
                {([
                  { key: "violation" as const, label: "違規事件", color: "#da1e28" },
                  { key: "submission" as const, label: "程式提交", color: "#0f62fe" },
                  { key: "lifecycle" as const, label: "考試狀態", color: "#24a148" },
                  { key: "admin" as const, label: "管理操作", color: "#8a3ffc" },
                ]).map(({ key, label, color }) => (
                  <div key={key} className={styles.summaryItem} style={{ borderLeftColor: color }}>
                    <span className={styles.summaryDot} style={{ background: color }} />
                    <span className={styles.summaryLabel}>{label}</span>
                    <span className={styles.summaryCount}>{summaryCounts[key]}</span>
                  </div>
                ))}
              </div>
            </ContainerCard>

            <ContainerCard title="事件時序圖">
              {chartData.length > 0 ? (
                <div className={styles.chartBody}>
                  <div className={styles.chartWrapper}>
                    <div className={styles.chartScroll} ref={chartScrollRef}>
                      <StackedBarChart data={chartData} options={chartOptions} />
                    </div>
                    {indicatorPosition && (
                      <div
                        className={styles.timeIndicator}
                        style={{ top: `${indicatorPosition.ratio * 100}%` }}
                      >
                        <div className={styles.timeIndicatorLine} />
                        <span className={styles.timeIndicatorLabel}>
                          {indicatorPosition.label}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={styles.chartMeta}>
                    <span>每 1 小時統計</span>
                    {chartWindow ? (
                      <span>開始：{new Date(chartWindow.startMs).toLocaleString()}</span>
                    ) : null}
                    {chartWindow ? (
                      <span>結束：{new Date(chartWindow.endMs).toLocaleString()}</span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={styles.chartEmpty}>
                  暫無事件資料可供視覺化
                </div>
              )}
            </ContainerCard>
          </div>

          {/* Right Column: Timeline */}
          <div className={styles.timelineCol}>
            <ContainerCard
              title="事件紀錄"
              action={
                <Button
                  kind="ghost"
                  renderIcon={Renew}
                  onClick={refreshAdminData}
                  hasIconOnly
                  iconDescription="重新整理"
                  disabled={isRefreshing}
                />
              }
            >
              <div className={styles.toolbar}>
                <div className={styles.searchWrapper}>
                  <input
                    className={styles.searchInput}
                    type="text"
                    placeholder="搜尋使用者、事件類型、原因…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className={styles.filterWrapper}>
                  <MultiSelect
                    id="event-type-filter-timeline"
                    titleText=""
                    label="篩選事件類型"
                    items={EVENT_FILTER_OPTIONS}
                    itemToString={(item: { label: string } | null) => item?.label || ""}
                    selectedItems={EVENT_FILTER_OPTIONS.filter((opt) =>
                      selectedEventTypes.includes(opt.id),
                    )}
                    onChange={(data) => {
                      const items = (data.selectedItems ?? []).filter(
                        (item): item is { id: string; label: string } => item != null,
                      );
                      setSelectedEventTypes(items.map((item) => item.id));
                    }}
                    size="md"
                  />
                </div>
              </div>

              {filteredEvents.length === 0 ? (
                <div className={styles.timelineEmpty}>
                  {examEvents.length === 0 ? "暫無事件紀錄" : "無符合篩選條件的事件"}
                </div>
              ) : (
                <>
                  <div className={styles.timelineScroll} ref={scrollContainerRef}>
                    <div className={styles.timelineInner}>
                      {timeSlotGroups.map((group) => (
                        <div key={group.key} className={styles.dateGroup}>
                          <div className={styles.dateLabel}>{group.label}</div>
                          {group.events.map((event) => {
                            const config = getEventConfig(event.eventType);
                            return (
                              <div
                                key={event.id || event.timestamp + event.userId}
                                className={`${styles.eventCard} ${SEVERITY_CLASS[config.severity]}`}
                                data-timestamp={event.timestamp}
                              >
                                <div className={styles.cardHeader}>
                                  <div className={styles.cardLeft}>
                                    <Tag type={config.tagType} size="sm">
                                      {config.label}
                                    </Tag>
                                    <span className={styles.cardUser}>
                                      {event.userName || "Unknown"}
                                    </span>
                                  </div>
                                  <span className={styles.cardTime}>
                                    {new Date(event.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                {event.reason && (
                                  <div className={styles.cardReason}>
                                    {event.reason}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      <div ref={sentinelRef} className={styles.scrollSentinel} />
                    </div>
                  </div>
                  <div className={styles.statusFooter}>
                    {hasMore
                      ? `已載入 ${visibleEvents.length} / ${filteredEvents.length} 筆`
                      : `共 ${filteredEvents.length} 筆事件`}
                  </div>
                </>
              )}
            </ContainerCard>
          </div>
        </div>
      )}
    </SurfaceSection>
  );
};

export default ContestAdminLogsPage;
