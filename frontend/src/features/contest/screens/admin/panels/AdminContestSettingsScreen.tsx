import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";


import { useContest } from "@/features/contest/contexts/ContestContext";
import { getContestSettingsBackPath } from "@/features/contest/domain/contestAdminPaths";
import {
  useExamAutoSave,
  type FieldSaveState,
} from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import { GlobalSaveStatus } from "@/shared/ui/autoSave/GlobalSaveStatus";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import {
  archiveContest,
  deleteContest,
} from "@/infrastructure/api/repositories";
import { sanitizeAnticheatPolicy } from "@/features/contest/components/admin/settings/anticheatPolicyUtils";
import { ContestSettingsModal } from "@/features/contest/components/admin/settings";
import { settingsPanelStyles as s } from "@/shared/layout/SettingsPanel";

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

  const [modalOpen, setModalOpen] = useState(true);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [startDateInput, setStartDateInput] = useState<Date | null>(null);
  const [endDateInput, setEndDateInput] = useState<Date | null>(null);
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

        {!modalOpen && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "3rem" }}>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              style={{
                background: "none",
                border: "1px solid var(--cds-border-strong)",
                borderRadius: "4px",
                padding: "0.75rem 1.5rem",
                color: "var(--cds-link-primary)",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {t("settings.openSettings", "開啟競賽設定")}
            </button>
          </div>
        )}

        <ContestSettingsModal
          open={modalOpen}
          onRequestClose={() => setModalOpen(false)}
          t={t}
          tc={tc}
          contest={contest}
          form={form}
          getState={getState}
          onRetry={autoSave.retrySave}
          onChange={handleChange}
          onConfirmedChange={handleConfirmedChange}
          startDateInput={startDateInput}
          endDateInput={endDateInput}
          startTimeInput={startTimeInput}
          endTimeInput={endTimeInput}
          startMeridiem={getMeridiemFromIso(form.startTime)}
          endMeridiem={getMeridiemFromIso(form.endTime)}
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
              () => startDateInput ?? parseDate(form.startTime as string),
              () => getMeridiemFromIso(form.startTime),
            )
          }
          onEndTimeChange={(event) =>
            handleTimeChange(
              event,
              "endTime",
              setEndTimeInput,
              () => endDateInput ?? parseDate(form.endTime as string),
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
        {/* ConfirmModal must be outside SettingsModal to avoid Carbon focus-trap conflicts */}
        <ConfirmModal {...modalProps} />
      </div>
    </div>
  );
};

export default AdminContestSettingsScreen;
