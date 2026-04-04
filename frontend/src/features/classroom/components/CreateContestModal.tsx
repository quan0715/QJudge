import React, { useState } from "react";
import {
  Modal,
  TextInput,
  InlineNotification,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
  PasswordInput,
  Select,
  SelectItem,
  Toggle,
} from "@carbon/react";
import { Code, Education } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { createClassroomContest } from "@/infrastructure/api/repositories/classroom.repository";
import styles from "./CreateContestModal.module.scss";

interface CreateContestModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contestId?: string) => void;
  classroomId: string;
}

type ContestCreationType = "coding_test" | "exam";
type CreateContestStep = "select_type" | "configure_schedule" | "advanced";
type Meridiem = "AM" | "PM";

const DURATION_OPTIONS = [60, 90, 120, 180, 240];

const getDefaultSchedule = (): {
  startDate: Date;
  startTime: string;
  startMeridiem: Meridiem;
} => {
  const now = new Date();
  const rounded = new Date(now);
  rounded.setSeconds(0, 0);

  const minutes = rounded.getMinutes();
  if (minutes > 0 && minutes < 30) {
    rounded.setMinutes(30);
  } else if (minutes > 30) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  }

  // UX default: nearest half-hour slot, then +2h.
  rounded.setHours(rounded.getHours() + 2);

  const hours24 = rounded.getHours();
  const startMeridiem: Meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12Raw = hours24 % 12;
  const hours12 = hours12Raw === 0 ? 12 : hours12Raw;
  const startTime = `${String(hours12).padStart(2, "0")}:${String(
    rounded.getMinutes(),
  ).padStart(2, "0")}`;

  return {
    startDate: rounded,
    startTime,
    startMeridiem,
  };
};

const CreateContestModal: React.FC<CreateContestModalProps> = ({
  open,
  onClose,
  onCreated,
  classroomId,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const defaultSchedule = getDefaultSchedule();

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(() => defaultSchedule.startDate);
  const [startTime, setStartTime] = useState(defaultSchedule.startTime);
  const [startMeridiem, setStartMeridiem] = useState<Meridiem>(defaultSchedule.startMeridiem);
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [examModeEnabled, setExamModeEnabled] = useState(true);
  const [allowMultipleJoins, setAllowMultipleJoins] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [creationType, setCreationType] = useState<ContestCreationType | null>(null);
  const [step, setStep] = useState<CreateContestStep>("select_type");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    const nextSchedule = getDefaultSchedule();
    setName("");
    setStartDate(nextSchedule.startDate);
    setStartTime(nextSchedule.startTime);
    setStartMeridiem(nextSchedule.startMeridiem);
    setDurationMinutes("120");
    setExamModeEnabled(true);
    setAllowMultipleJoins(false);
    setRequiresPassword(false);
    setPassword("");
    setCreationType(null);
    setStep("select_type");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const combineDateTime = (
    date: Date | null,
    time: string,
    meridiem: Meridiem,
  ): string | null => {
    if (!date || Number.isNaN(date.getTime())) return null;
    const [hours, minutes] = time.split(":").map(Number);
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

    const combined = new Date(date);
    if (Number.isNaN(combined.getTime())) return null;
    const normalizedHours =
      meridiem === "PM" ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);
    combined.setHours(normalizedHours, minutes, 0, 0);
    if (Number.isNaN(combined.getTime())) return null;
    return combined.toISOString();
  };

  const startDateTime = combineDateTime(startDate, startTime, startMeridiem);
  const duration = Number.parseInt(durationMinutes, 10);
  const hasValidSchedule = !!startDate && !!startDateTime && duration > 0;
  const hasValidAdvanced = !requiresPassword || !!password.trim();
  const canCreate =
    !!creationType &&
    !!name.trim() &&
    hasValidSchedule &&
    hasValidAdvanced;

  const handleSubmit = async () => {
    if (!creationType || !name.trim() || !startDate) return;

    if (!startDateTime) {
      setError(t("validation.invalidDateTime"));
      return;
    }

    if (Number.isNaN(duration) || duration <= 0) {
      setError(t("createModal.validation.durationPositive"));
      return;
    }

    if (requiresPassword && !password.trim()) {
      setError(t("createModal.validation.passwordRequired"));
      return;
    }

    const endDateTime = new Date(
      new Date(startDateTime).getTime() + duration * 60 * 1000,
    ).toISOString();
    if (!endDateTime) {
      setError(t("createModal.validation.cannotComputeEndTime"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const createdContest = await createClassroomContest(classroomId, {
        name,
        description: "",
        start_time: startDateTime,
        end_time: endDateTime,
        contest_type: creationType === "exam" ? "paper_exam" : "coding",
        requires_password: requiresPassword,
        password: requiresPassword ? password : undefined,
        cheat_detection_enabled: creationType === "exam" ? examModeEnabled : false,
        allow_multiple_joins: allowMultipleJoins,
        results_published: false,
      });
      onCreated(createdContest.contestId);
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("error.createFailed");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const modalLabel =
    step === "select_type"
      ? "1 / 3"
      : step === "configure_schedule"
        ? "2 / 3"
        : "3 / 3";

  const modalHeading =
    step === "select_type"
      ? t("createModal.chooseTypeTitle", "建立競賽")
      : step === "configure_schedule"
        ? t("createModal.configureSchedule", "設定基本資訊")
        : t("createModal.advancedSettings", "進階條件設定");

  const primaryButtonText =
    step === "select_type"
      ? tc("button.next", "下一步")
      : step === "configure_schedule"
        ? tc("button.next", "下一步")
        : tc("button.create");

  const secondaryButtonText =
    step === "select_type"
      ? tc("button.cancel")
      : tc("button.back", "返回");

  return (
    <Modal
      open={open}
      onRequestClose={handleClose}
      modalLabel={modalLabel}
      modalHeading={modalHeading}
      primaryButtonText={primaryButtonText}
      secondaryButtonText={secondaryButtonText}
      onRequestSubmit={() => {
        if (step === "select_type") {
          if (creationType) {
            setStep("configure_schedule");
            setError("");
          }
          return;
        }
        if (step === "configure_schedule") {
          if (!name.trim()) {
            setError(t("createModal.validation.nameRequired", "請輸入競賽名稱"));
            return;
          }
          if (hasValidSchedule) {
            setStep("advanced");
            setError("");
          } else {
            setError(t("validation.invalidDateTime"));
          }
          return;
        }
        void handleSubmit();
      }}
      onSecondarySubmit={() => {
        if (step === "advanced") {
          setStep("configure_schedule");
          setError("");
          return;
        }
        if (step === "configure_schedule") {
          setStep("select_type");
          setError("");
          return;
        }
        handleClose();
      }}
      primaryButtonDisabled={
        step === "select_type"
          ? !creationType
          : step === "configure_schedule"
            ? loading
            : !canCreate || loading
      }
      size="sm"
      hasScrollingContent
      selectorPrimaryFocus={
        step === "select_type"
          ? undefined
          : step === "configure_schedule"
            ? "#contest-name"
            : "#contest-exam-mode"
      }
    >
      <>
        {error && (
          <InlineNotification
            kind="error"
            title={tc("message.error")}
            subtitle={error}
            style={{ marginBottom: "1rem" }}
            lowContrast
            hideCloseButton
          />
        )}

        {step === "select_type" && (
          <div className={styles.stepStack}>
            <p className={styles.helperText}>
              {t(
                "createModal.stepIntro",
                "請先選擇競賽類型。",
              )}
            </p>

            <div className={styles.typeSelector}>
              <button
                type="button"
                onClick={() => {
                  setCreationType("coding_test");
                  setExamModeEnabled(false);
                }}
                className={`${styles.typeOption} ${
                  creationType === "coding_test" ? styles.typeOptionActive : ""
                }`}
                aria-pressed={creationType === "coding_test"}
                aria-label={t("createModal.typeCoding")}
              >
                <Code size={20} />
                <span className={styles.typeTitle}>{t("createModal.typeCoding")}</span>
                <span className={styles.typeSubtitle}>{t("createModal.typeCodingDesc")}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreationType("exam");
                  setExamModeEnabled(true);
                }}
                className={`${styles.typeOption} ${
                  creationType === "exam" ? styles.typeOptionActive : ""
                }`}
                aria-pressed={creationType === "exam"}
                aria-label={t("createModal.typeExam")}
              >
                <Education size={20} />
                <span className={styles.typeTitle}>{t("createModal.typeExam")}</span>
                <span className={styles.typeSubtitle}>{t("createModal.typeExamDesc")}</span>
              </button>
            </div>
          </div>
        )}

        {step === "configure_schedule" && creationType && (
          <div className={styles.stepStack}>
            <div className={styles.sectionLabel}>
              {t("createModal.scheduleTitle", "設定基本資訊")}
            </div>
            <p className={styles.helperText}>
              {t(
                "createModal.scheduleIntro",
                "請填寫競賽基本資訊與應試時段。建立完成後，仍可於競賽管理頁面調整。",
              )}
            </p>

            <TextInput
              id="contest-name"
              labelText={t("createModal.contestName", "競賽名稱")}
              placeholder={t("createModal.contestNamePlaceholder", "例如：114-2 期中評量")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={styles.nameInput}
            />

            <div className={styles.fieldStack}>
              <DatePicker
                datePickerType="single"
                onChange={([date]) => setStartDate(date)}
                value={startDate ? [startDate] : []}
                className={styles.dateField}
              >
                <DatePickerInput
                  id="start-date"
                  labelText={t("createModal.startDateLabel", "開始日期")}
                  placeholder={t("createModal.startDatePlaceholder", "YYYY/MM/DD")}
                />
              </DatePicker>
            </div>

            <div className={styles.timeFieldBlock}>
              <TimePicker
                id="start-time"
                labelText={t("createModal.startTimeLabel", "開始時間")}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder={t("createModal.startTimePlaceholder", "HH:MM")}
              >
                <TimePickerSelect
                  id="start-meridiem"
                  value={startMeridiem}
                  onChange={(e) => setStartMeridiem(e.target.value as Meridiem)}
                >
                  <SelectItem value="AM" text="AM" />
                  <SelectItem value="PM" text="PM" />
                </TimePickerSelect>
              </TimePicker>
              <div className={styles.fieldHint}>
                {t(
                  "createModal.timeFormatExample",
                  "請使用 12 小時制時間格式 HH:MM，並選擇上午或下午（例如 09:30 AM）。",
                )}
              </div>
            </div>

            <div className={styles.durationFieldBlock}>
              <Select
                id="duration-minutes"
                labelText={t("createModal.duration")}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              >
                {DURATION_OPTIONS.map((minutes) => (
                  <SelectItem
                    key={minutes}
                    value={String(minutes)}
                    text={`${minutes} ${t("createModal.durationUnit", "分鐘")}`}
                  />
                ))}
              </Select>
            </div>
          </div>
        )}

        {step === "advanced" && creationType && (
          <div className={styles.stepStack}>
            <div className={styles.helperText}>
              {t(
                "createModal.advancedIntro",
                "請依監考與參與規範設定進階條件。",
              )}
            </div>

            <div className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <div className={styles.questionCopy}>
                  <div className={styles.questionTitle} id="contest-exam-mode-label">
                    {t("createModal.examModeTitle", "啟用考試模式")}
                  </div>
                  <div className={styles.questionHint}>
                    {t("createModal.examModeHint", "啟用後將套用考試所需的監考與防作弊設定。")}
                  </div>
                </div>
                <Toggle
                  id="contest-exam-mode"
                  aria-labelledby="contest-exam-mode-label"
                  labelText=""
                  hideLabel
                  toggled={examModeEnabled}
                  onToggle={(checked: boolean) => setExamModeEnabled(checked)}
                  labelA=""
                  labelB=""
                />
              </div>
            </div>

            <div className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <div className={styles.questionCopy}>
                  <div className={styles.questionTitle} id="contest-rejoin-label">
                    {t("createModal.rejoinTitle", "允許重新加入")}
                  </div>
                  <div className={styles.questionHint}>
                    {t("createModal.rejoinHint", "啟用後，學生離開競賽後可再次加入。")}
                  </div>
                </div>
                <Toggle
                  id="contest-allow-multiple-joins"
                  aria-labelledby="contest-rejoin-label"
                  labelText=""
                  hideLabel
                  toggled={allowMultipleJoins}
                  onToggle={(checked: boolean) => setAllowMultipleJoins(checked)}
                  labelA=""
                  labelB=""
                />
              </div>
            </div>

            <div className={styles.questionCard}>
              <div className={styles.questionHeader}>
                <div className={styles.questionCopy}>
                  <div className={styles.questionTitle} id="contest-password-toggle-label">
                    {t("createModal.passwordTitle", "要求競賽密碼")}
                  </div>
                  <div className={styles.questionHint}>
                    {t("createModal.passwordHint", "啟用後，學生在加入或進入競賽時需輸入密碼。")}
                  </div>
                </div>
                <Toggle
                  id="contest-requires-password"
                  aria-labelledby="contest-password-toggle-label"
                  labelText=""
                  hideLabel
                  toggled={requiresPassword}
                  onToggle={(checked: boolean) => setRequiresPassword(checked)}
                  labelA=""
                  labelB=""
                />
              </div>
              {requiresPassword && (
                <PasswordInput
                  id="contest-password"
                  labelText={t("createModal.passwordInputLabel", "競賽密碼")}
                  placeholder={t("createModal.passwordInputPlaceholder", "請輸入競賽密碼")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={styles.passwordInput}
                  showPasswordLabel={t("createModal.showPassword", "顯示密碼")}
                  hidePasswordLabel={t("createModal.hidePassword", "隱藏密碼")}
                />
              )}
            </div>
          </div>
        )}
      </>
    </Modal>
  );
};

export default CreateContestModal;
