import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@carbon/react";

import { useContest } from "@/features/contest/contexts/ContestContext";
import {
  useExamAutoSave,
  type FieldSaveState,
} from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";
import AdminContestSettingsContent from "@/features/contest/components/admin/AdminContestSettingsContent";
import { GlobalSaveStatus } from "@/shared/ui/autoSave/GlobalSaveStatus";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { useToast } from "@/shared/contexts/ToastContext";
import {
  archiveContest,
  deleteContest,
  exportContestResults,
  publishContestProblemsToPractice,
  getContestAdmins,
  addContestAdmin,
  removeContestAdmin,
} from "@/infrastructure/api/repositories";
import { AddAdminModal } from "@/features/contest/components/modals/AddAdminModal";
import { DEFAULT_DEVICE_POLICY } from "@/features/contest/domain/anticheatModulePolicy";
import s from "./AdminContestSettingsPanel.module.scss";

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
      required: typeof src.required === "boolean" ? src.required : fallback.required,
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

interface Admin {
  id: string;
  username: string;
}

const toTimeInput = (dateStr: string): string => {
  const date = new Date(dateStr);
  let hours = date.getHours() % 12;
  hours = hours || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours.toString().padStart(2, "0")}:${minutes}`;
};

const toDateInput = (dateStr: string): string => {
  const date = new Date(dateStr);
  return `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
    .getDate()
    .toString()
    .padStart(2, "0")}/${date.getFullYear()}`;
};

const isPM = (dateStr: string): boolean => new Date(dateStr).getHours() >= 12;

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
  const { showToast } = useToast();

  const autoSave = useExamAutoSave({
    contestId: contestId || "",
    debounceMs: 1500,
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const initializedRef = useRef(false);
  const initializedContestIdRef = useRef<string | null>(null);

  const adminRows = [
    ...(contest?.ownerUsername
      ? [{ id: "__owner__", username: contest.ownerUsername, role: "owner" as const }]
      : []),
    ...admins.map((admin) => ({ id: admin.id, username: admin.username, role: "co-admin" as const })),
  ];

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
  formRef.current = form;

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
    ) => {
      const value = event.target.value;
      setInput(value);
      if (value.length !== 5 || !value.includes(":")) return;

      const [hours, minutes] = value.split(":").map(Number);
      if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes) ||
        hours < 1 ||
        hours > 12 ||
        minutes < 0 ||
        minutes > 59
      ) {
        return;
      }

      const current = form[field] ? new Date(form[field] as string) : new Date();
      const currentlyPm = current.getHours() >= 12;
      const normalizedHours = currentlyPm
        ? (hours === 12 ? 12 : hours + 12)
        : (hours === 12 ? 0 : hours);
      current.setHours(normalizedHours);
      current.setMinutes(minutes);
      handleChange(field, current.toISOString());
    },
    [form, handleChange],
  );

  const handleMeridiemChange = useCallback(
    (value: string, field: "startTime" | "endTime") => {
      const date = form[field] ? new Date(form[field] as string) : new Date();
      let hours = date.getHours();
      if (value === "PM" && hours < 12) hours += 12;
      if (value === "AM" && hours >= 12) hours -= 12;
      date.setHours(hours);
      handleChange(field, date.toISOString());
    },
    [form, handleChange],
  );

  const handleDateChange = useCallback(
    (
      dates: Date[],
      field: "startTime" | "endTime",
      setInput: (value: string) => void,
    ) => {
      if (!dates?.length) return;
      const selectedDate = dates[0];
      const current = form[field] ? new Date(form[field] as string) : new Date();
      selectedDate.setHours(current.getHours());
      selectedDate.setMinutes(current.getMinutes());
      const iso = selectedDate.toISOString();
      handleChange(field, iso);
      setInput(toDateInput(iso));
    },
    [form, handleChange],
  );

  const loadAdmins = useCallback(async () => {
    if (!contestId) return;
    try {
      const data = await getContestAdmins(contestId);
      setAdmins(data);
    } catch {
      showToast({ kind: "error", title: "無法載入管理員列表" });
    }
  }, [contestId, showToast]);

  const handleAddAdmin = async (username: string) => {
    if (!contestId) return;
    try {
      await addContestAdmin(contestId, username);
      showToast({ kind: "success", title: `成功新增管理員: ${username}` });
      setAddModalOpen(false);
      await loadAdmins();
    } catch (error) {
      const message = error instanceof Error ? error.message : "新增失敗";
      showToast({ kind: "error", title: message });
      throw error;
    }
  };

  const handleRemoveAdmin = async (admin: Admin) => {
    if (!contestId) return;
    const confirmed = await confirm({
      title: `確定要移除管理員 ${admin.username}？`,
      confirmLabel: "移除",
      cancelLabel: tc("button.cancel"),
      danger: true,
    });
    if (!confirmed) return;
    try {
      await removeContestAdmin(contestId, admin.id);
      showToast({ kind: "success", title: `已移除管理員: ${admin.username}` });
      await loadAdmins();
    } catch (error) {
      const message = error instanceof Error ? error.message : "移除失敗";
      showToast({ kind: "error", title: message });
    }
  };

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

  const handlePublishToPractice = async () => {
    if (!contestId) return;
    try {
      setPublishing(true);
      await publishContestProblemsToPractice(contestId);
      setPublishModalOpen(false);
      await refreshContest();
    } finally {
      setPublishing(false);
    }
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
    navigate("/contests");
  };

  const handleExport = async () => {
    if (!contestId) return;
    await exportContestResults(contestId);
  };

  useEffect(() => {
    if (!contestId) return;
    void loadAdmins();
  }, [contestId, loadAdmins]);

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
      visibility: contest.visibility || "public",
      password: contest.password || "",
      cheatDetectionEnabled: contest.cheatDetectionEnabled ?? false,
      anticheatDevicePolicy: sanitizeAnticheatPolicy(contest.anticheatDevicePolicy),
      warningTimeoutSeconds: contest.warningTimeoutSeconds ?? 20,
      scoreboardVisibleDuringContest: contest.scoreboardVisibleDuringContest ?? false,
      anonymousModeEnabled: contest.anonymousModeEnabled ?? false,
      allowMultipleJoins: contest.allowMultipleJoins ?? false,
      maxCheatWarnings: contest.maxCheatWarnings ?? 0,
      allowAutoUnlock: contest.allowAutoUnlock ?? false,
      autoUnlockMinutes: contest.autoUnlockMinutes ?? 5,
    });
    if (contest.startTime) {
      setStartTimeInput(toTimeInput(contest.startTime));
      setStartDateInput(toDateInput(contest.startTime));
    }
    if (contest.endTime) {
      setEndTimeInput(toTimeInput(contest.endTime));
      setEndDateInput(toDateInput(contest.endTime));
    }
  }, [contest]);

  if (!contest) return null;

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
          startMeridiem={form.startTime && isPM(form.startTime as string) ? "PM" : "AM"}
          endMeridiem={form.endTime && isPM(form.endTime as string) ? "PM" : "AM"}
          admins={admins}
          adminRows={adminRows}
          publishing={publishing}
          getState={getState}
          onRetry={autoSave.retrySave}
          onChange={handleChange}
          onConfirmedChange={handleConfirmedChange}
          onStartDateChange={(dates) => handleDateChange(dates, "startTime", setStartDateInput)}
          onEndDateChange={(dates) => handleDateChange(dates, "endTime", setEndDateInput)}
          onStartTimeChange={(event) => handleTimeChange(event, "startTime", setStartTimeInput)}
          onEndTimeChange={(event) => handleTimeChange(event, "endTime", setEndTimeInput)}
          onStartMeridiemChange={(value) => handleMeridiemChange(value, "startTime")}
          onEndMeridiemChange={(value) => handleMeridiemChange(value, "endTime")}
          onRefreshAdmins={() => void loadAdmins()}
          onOpenAddAdmin={() => setAddModalOpen(true)}
          onRemoveAdmin={(admin) => void handleRemoveAdmin(admin)}
          onExport={() => void handleExport()}
          onArchive={() => void handleArchive()}
          onOpenPublishToPractice={() => setPublishModalOpen(true)}
          onDelete={() => void handleDelete()}
        />

        <Modal
          open={publishModalOpen}
          modalHeading={t("settings.publishToPracticeConfirmTitle")}
          primaryButtonText={t("settings.publishToPracticeConfirm")}
          secondaryButtonText={tc("button.cancel")}
          primaryButtonDisabled={publishing}
          onRequestClose={() => !publishing && setPublishModalOpen(false)}
          onRequestSubmit={() => void handlePublishToPractice()}
        >
          <p style={{ marginBottom: "0.5rem" }}>{t("settings.publishToPracticeConfirmDesc")}</p>
          <p style={{ color: "var(--cds-text-secondary)" }}>
            {t("settings.publishToPracticeIrreversible")}
          </p>
        </Modal>

        <AddAdminModal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          onSubmit={handleAddAdmin}
        />
        <ConfirmModal {...modalProps} />
      </div>
    </div>
  );
};

export default AdminContestSettingsScreen;
