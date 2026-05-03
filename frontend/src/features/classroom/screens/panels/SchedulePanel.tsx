import { useCallback, useMemo, useState } from "react";
import type {
  BoundContest,
  ClassroomDetail,
} from "@/core/entities/classroom.entity";
import { ClassroomContestPreviewModal } from "../../components/ClassroomContestPreviewModal";
import {
  ClassroomMonthSchedule,
  type ClassroomScheduleViewMode,
} from "../../components/ClassroomMonthSchedule";
import {
  buildClassroomMonthSchedule,
  buildClassroomWeekSchedule,
  localDateKeyFromMs,
} from "../../domain/classroomActivityTimeline";
import "../../components/ClassroomActivitySchedule.scss";

interface SchedulePanelProps {
  classroom: ClassroomDetail;
  onNavigateExam: (contestId: string) => void;
}

export const SchedulePanel: React.FC<SchedulePanelProps> = ({
  classroom,
  onNavigateExam,
}) => {
  const [nowMs] = useState(() => Date.now());
  const [scheduleViewMode, setScheduleViewMode] =
    useState<ClassroomScheduleViewMode>("month");
  const [rangeAnchor, setRangeAnchor] = useState(() => {
    const date = new Date(nowMs);
    date.setHours(0, 0, 0, 0);
    return date;
  });
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    localDateKeyFromMs(nowMs),
  );
  const [previewContest, setPreviewContest] = useState<BoundContest | null>(
    null,
  );

  const scheduleCells = useMemo(
    () =>
      scheduleViewMode === "week"
        ? buildClassroomWeekSchedule(classroom.contests, rangeAnchor, nowMs)
        : buildClassroomMonthSchedule(classroom.contests, rangeAnchor, nowMs),
    [classroom.contests, rangeAnchor, scheduleViewMode, nowMs],
  );

  const effectiveSelectedDateKey = useMemo(() => {
    if (scheduleCells.some((cell) => cell.dateKey === selectedDateKey)) {
      return selectedDateKey;
    }
    const firstEventCell = scheduleCells.find(
      (cell) => cell.isCurrentMonth && cell.events.length > 0,
    );
    const firstCurrentMonthCell = scheduleCells.find(
      (cell) => cell.isCurrentMonth,
    );
    return (
      firstEventCell?.dateKey ??
      firstCurrentMonthCell?.dateKey ??
      scheduleCells[0]?.dateKey ??
      selectedDateKey
    );
  }, [scheduleCells, selectedDateKey]);

  const openContestPreview = (contestId: string) => {
    const contest = classroom.contests.find(
      (item) => item.contestId === contestId,
    );
    if (contest) setPreviewContest(contest);
  };

  const handleEnterPreviewContest = (contestId: string) => {
    setPreviewContest(null);
    onNavigateExam(contestId);
  };

  const handlePreviousRange = useCallback(() => {
    setRangeAnchor((current) => {
      const next = new Date(current);
      if (scheduleViewMode === "week") {
        next.setDate(current.getDate() - 7);
      } else {
        next.setMonth(current.getMonth() - 1);
      }
      return next;
    });
  }, [scheduleViewMode]);

  const handleNextRange = useCallback(() => {
    setRangeAnchor((current) => {
      const next = new Date(current);
      if (scheduleViewMode === "week") {
        next.setDate(current.getDate() + 7);
      } else {
        next.setMonth(current.getMonth() + 1);
      }
      return next;
    });
  }, [scheduleViewMode]);

  return (
    <>
      <section className="classroom-admin-section">
        <ClassroomMonthSchedule
          cells={scheduleCells}
          rangeAnchor={rangeAnchor}
          viewMode={scheduleViewMode}
          selectedDateKey={effectiveSelectedDateKey}
          onViewModeChange={setScheduleViewMode}
          onSelectDate={setSelectedDateKey}
          onOpenContest={openContestPreview}
          onPreviousRange={handlePreviousRange}
          onNextRange={handleNextRange}
        />
      </section>
      <ClassroomContestPreviewModal
        contest={previewContest}
        open={previewContest !== null}
        onClose={() => setPreviewContest(null)}
        onEnterContest={handleEnterPreviewContest}
      />
    </>
  );
};
