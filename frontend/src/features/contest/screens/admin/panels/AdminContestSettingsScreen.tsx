import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";


import { useContest } from "@/features/contest/contexts/ContestContext";
import { getContestSettingsBackPath } from "@/features/contest/domain/contestAdminPaths";
import {
  useExamAutoSave,
  type FieldSaveState,
} from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import AdminContestSettingsContent from "@/features/contest/components/admin/AdminContestSettingsContent";
import { GlobalSaveStatus } from "@/shared/ui/autoSave/GlobalSaveStatus";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import {
  archiveContest,
  deleteContest,
} from "@/infrastructure/api/repositories";
import { DEFAULT_DEVICE_POLICY } from "@/features/contest/domain/anticheatModulePolicy";
import { settingsPanelStyles as s } from "@/shared/layout/SettingsPanel";

const sanitizeAnticheatPolicy = (
  policy: unknown
): typeof DEFAULT_DEVICE_POLICY => {
  const raw =
    policy && typeof policy === "object" && !Array.isArray(policy)
      ? (policy as Record<string, unknown>)
      : {};

  const normalizeSource = (
    source: unknown,
    fallback: typeof DEFAULT_DEVICE_POLICY.desktop.sources.screenShare
  ) => {
    const src =
      source && typeof source === "object" && !Array.isArray(source)
        ? (source as Record<string, unknown>)
        : {};
    const interval = Number(
      src.captureIntervalSeconds ?? src.capture_interval_seconds ?? fallback.captureIntervalSeconds
    );
    return {
      enabled: typeof src.enabled === "boolean" ? src.enabled : fallback.enabled,
      captureIntervalSeconds:
        Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : fallback.captureIntervalSeconds,
    };
  };

  const normalizeDetectors = (
    detectors: unknown,
    fallback: typeof DEFAULT_DEVICE_POLICY.desktop.detectors
  ) => {
    const det =
      detectors && typeof detectors === "object" && !Array.isArray(detectors)
        ? (detectors as Record<string, unknown>)
        : {};
    return {
      pwaMode:
        typeof det.pwaMode === "boolean"
          ? det.pwaMode
          : typeof det.pwa_mode === "boolean"
          ? (det.pwa_mode as boolean)
          : fallback.pwaMode,
      fullscreen: typeof det.fullscreen === "boolean" ? det.fullscreen : fallback.fullscreen,
      focus: typeof det.focus === "boolean" ? det.focus : fallback.focus,
      tabVisibility:
        typeof det.tabVisibility === "boolean"
          ? det.tabVisibility
          : typeof det.tab_visibility === "boolean"
          ? (det.tab_visibility as boolean)
          : fallback.tabVisibility,
      multiDisplay:
        typeof det.multiDisplay === "boolean"
          ? det.multiDisplay
          : typeof det.multi_display === "boolean"
          ? (det.multi_display as boolean)
          : fallback.multiDisplay,
      mouseLeave:
        typeof det.mouseLeave === "boolean"
          ? det.mouseLeave
          : typeof det.mouse_leave === "boolean"
          ? (det.mouse_leave as boolean)
          : fallback.mouseLeave,
      viewportIntegrity:
        typeof det.viewportIntegrity === "boolean"
          ? det.viewportIntegrity
          : typeof det.viewport_integrity === "boolean"
          ? (det.viewport_integrity as boolean)
          : fallback.viewportIntegrity,
    };
  };

  const normalizeDevice = (
    device: unknown,
    fallback: typeof DEFAULT_DEVICE_POLICY.desktop
  ) => {
    const item =
      device && typeof device === "object" && !Array.isArray(device)
        ? (device as Record<string, unknown>)
        : {};
    const sources =
      item.sources && typeof item.sources === "object" && !Array.isArray(item.sources)
        ? (item.sources as Record<string, unknown>)
        : {};
    return {
      enabled: typeof item.enabled === "boolean" ? item.enabled : fallback.enabled,
      sources: {
        screenShare: normalizeSource(
          sources.screenShare ?? sources.screen_share,
          fallback.sources.screenShare
        ),
        webcam: normalizeSource(sources.webcam, fallback.sources.webcam),
      },
      detectors: normalizeDetectors(item.detectors, fallback.detectors),
    };
  };

  const sanitized = {
    desktop: normalizeDevice(raw.desktop, DEFAULT_DEVICE_POLICY.desktop),
    tablet: normalizeDevice(raw.tablet, DEFAULT_DEVICE_POLICY.tablet),
  };

  sanitized.desktop.detectors.pwaMode = false;
  sanitized.desktop.detectors.viewportIntegrity = false;
  sanitized.tablet.detectors.fullscreen = false;
  sanitized.tablet.detectors.multiDisplay = false;

  return sanitized;
};

const isValidDate = (date: Date | null | undefined): date is Date =>
  !!date && !Number.isNaN(date.getTime());

const parseDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isValidDate(date) ? date : null;
};

const toTimeInput = (date: Date): string => {
  let hours = date.getHours() % 12;
  hours = hours || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
};

const buildDateTimeIso = (
  date: Date | null,
  time: string,
  meridiem: "AM" | "PM",
): string | null => {
  if (!isValidDate(date)) return null;
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 1 ||
    hours > 12 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const next = new Date(date);
  const normalizedHours = meridiem === "PM"
    ? (hours === 12 ? 12 : hours + 12)
    : (hours === 12 ? 0 : hours);
  next.setHours(normalizedHours, minutes, 0, 0);
  return isValidDate(next) ? next.toISOString() : null;
};

const isValueEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return false;
};

const AdminContestSettingsScreen = () => {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const { contest, refreshContest } = useContest();
  const { confirm, modalProps } = useConfirmModal();
  const autoSave = useExamAutoSave({
    contestId: contestId || "",
    debounceMs: 1500,
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [startDateInput, setStartDateInput] = useState<Date | null>(null);
  const [endDateInput, setEndDateInput] = useState<Date | null>(null);
  // publish_to_practice removed — questions live in the bank now
  const initializedRef = useRef(false);
  const initializedContestIdRef = useRef<string | null>(null);

  const getState = useCallback(
    (field: string): FieldSaveState | undefined => autoSave.fieldStates[field],
    [autoSave.fieldStates],
  );

  const handleChange = useCallback(
    (field: string, value: unknown) => {
      setForm((prev) => {
        if (isValueEqual(prev[field], value)) {
          return prev;
        }
        return { ...prev, [field]: value };
      });
      // Side effect (auto-save) must be outside the state updater
      // to avoid double-invocation in React 18 Strict Mode.
      autoSave.debouncedSaveField(field, value);
    },
    [autoSave],
  );

  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; });

  const handleConfirmedChange = useCallback(
    async (field: string, value: unknown, message: string) => {
      if (isValueEqual(formRef.current[field], value)) return;
      const confirmed = await confirm({
        title: message,
        confirmLabel: tc("button.confirm"),
        cancelLabel: tc("button.cancel"),
        danger: true,
      });
      if (!confirmed) return;
      setForm((prev) => {
        if (isValueEqual(prev[field], value)) {
          return prev;
        }
        return { ...prev, [field]: value };
      });
      autoSave.saveField(field, value);
    },
    [autoSave, confirm, tc],
  );

  const handleTimeChange = useCallback(
    (
      event: ChangeEvent<HTMLInputElement>,
      field: "startTime" | "endTime",
      setInput: (value: string) => void,
      getDate: () => Date | null,
      getMeridiem: () => "AM" | "PM",
    ) => {
      const value = event.target.value;
      setInput(value);
      if (value.length !== 5 || !value.includes(":")) return;

      const iso = buildDateTimeIso(getDate(), value, getMeridiem());
      if (!iso) return;
      handleChange(field, iso);
    },
    [handleChange],
  );

  const handleMeridiemChange = useCallback(
    (
      value: string,
      field: "startTime" | "endTime",
      getDate: () => Date | null,
      getTime: () => string,
    ) => {
      const iso = buildDateTimeIso(getDate(), getTime(), value === "PM" ? "PM" : "AM");
      if (!iso) return;
      handleChange(field, iso);
    },
    [handleChange],
  );

  const handleDateChange = useCallback(
    (
      dates: Date[],
      field: "startTime" | "endTime",
      setInput: (value: Date | null) => void,
      getTime: () => string,
      getMeridiem: () => "AM" | "PM",
    ) => {
      if (!dates?.length) return;
      const selectedDate = new Date(dates[0]);
      setInput(selectedDate);
      const iso = buildDateTimeIso(selectedDate, getTime(), getMeridiem());
      if (!iso) return;
      handleChange(field, iso);
    },
    [handleChange],
  );

  const handleArchive = async () => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("settings.confirmArchive"),
      confirmLabel: tc("button.confirm"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    await archiveContest(contestId);
    await refreshContest();
  };

  const handleDelete = async () => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: t("settings.confirmDelete"),
      confirmLabel: tc("button.delete"),
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    await deleteContest(contestId);
    navigate(getContestSettingsBackPath(contestId, contest?.boundClassroomId));
  };

  useEffect(() => {
    if (contestId && initializedContestIdRef.current !== contestId) {
      initializedRef.current = false;
      initializedContestIdRef.current = contestId;
    }
  }, [contestId]);

  useEffect(() => {
    if (!contest || initializedRef.current) return;
    initializedRef.current = true;
    setForm({
      name: contest.name || "",
      description: contest.description || "",
      rules: contest.rules || "",
      startTime: contest.startTime || "",
      endTime: contest.endTime || "",
      status: contest.status || "draft",
      requiresPassword: contest.requiresPassword ?? (contest.visibility === "private"),
      visibility: contest.visibility || "public",
      password: contest.password || "",
      cheatDetectionEnabled: contest.cheatDetectionEnabled ?? false,
      anticheatDevicePolicy: sanitizeAnticheatPolicy(contest.anticheatDevicePolicy),
      warningTimeoutSeconds: contest.warningTimeoutSeconds ?? 20,
      screenShareRecoveryGraceMs: contest.screenShareRecoveryGraceMs ?? 30_000,
      scoreboardVisibleDuringContest: contest.scoreboardVisibleDuringContest ?? false,
      anonymousModeEnabled: contest.anonymousModeEnabled ?? false,
      allowMultipleJoins: contest.allowMultipleJoins ?? false,
      maxCheatWarnings: contest.maxCheatWarnings ?? 0,
      allowAutoUnlock: contest.allowAutoUnlock ?? false,
      autoUnlockMinutes: contest.autoUnlockMinutes ?? 5,
    });
    if (contest.startTime) {
      const startDate = parseDate(contest.startTime);
      setStartTimeInput(startDate ? toTimeInput(startDate) : "");
      setStartDateInput(startDate);
    }
    if (contest.endTime) {
      const endDate = parseDate(contest.endTime);
      setEndTimeInput(endDate ? toTimeInput(endDate) : "");
      setEndDateInput(endDate);
    }
  }, [contest]);

  if (!contest) return null;

  const getMeridiemFromIso = (value: unknown): "AM" | "PM" => {
    if (typeof value !== "string") return "AM";
    const date = parseDate(value);
    return date && date.getHours() >= 12 ? "PM" : "AM";
  };

  return (
    <div className={s.root}>
      <div className={s.inner}>
        <div className={s.pageHeader}>
          <h2
            style={{
              fontSize: "var(--cds-heading-04-font-size, 1.25rem)",
              fontWeight: 400,
              lineHeight: "1.625rem",
              color: "var(--cds-text-primary)",
              margin: 0,
            }}
          >
            {t("settings.title")}
          </h2>
          <GlobalSaveStatus status={autoSave.globalStatus} />
        </div>

        <AdminContestSettingsContent
          t={t}
          tc={tc}
          contest={contest}
          form={form}
          startDateInput={startDateInput}
          endDateInput={endDateInput}
          startTimeInput={startTimeInput}
          endTimeInput={endTimeInput}
          startMeridiem={getMeridiemFromIso(form.startTime)}
          endMeridiem={getMeridiemFromIso(form.endTime)}
          getState={getState}
          onRetry={autoSave.retrySave}
          onChange={handleChange}
          onConfirmedChange={handleConfirmedChange}
          onStartDateChange={(dates) =>
            handleDateChange(
              dates,
              "startTime",
              setStartDateInput,
              () => startTimeInput,
              () => getMeridiemFromIso(form.startTime),
            )
          }
          onEndDateChange={(dates) =>
            handleDateChange(
              dates,
              "endTime",
              setEndDateInput,
              () => endTimeInput,
              () => getMeridiemFromIso(form.endTime),
            )
          }
          onStartTimeChange={(event) =>
            handleTimeChange(
              event,
              "startTime",
              setStartTimeInput,
              () => startDateInput ?? parseDate(form.startTime),
              () => getMeridiemFromIso(form.startTime),
            )
          }
          onEndTimeChange={(event) =>
            handleTimeChange(
              event,
              "endTime",
              setEndTimeInput,
              () => endDateInput ?? parseDate(form.endTime),
              () => getMeridiemFromIso(form.endTime),
            )
          }
          onStartMeridiemChange={(value) =>
            handleMeridiemChange(
              value as string,
              "startTime",
              () => startDateInput,
              () => startTimeInput,
            )
          }
          onEndMeridiemChange={(value) =>
            handleMeridiemChange(
              value as string,
              "endTime",
              () => endDateInput,
              () => endTimeInput,
            )
          }
          onArchive={() => void handleArchive()}
          onDelete={() => void handleDelete()}
        />
        <ConfirmModal {...modalProps} />
      </div>
    </div>
  );
};

export default AdminContestSettingsScreen;
