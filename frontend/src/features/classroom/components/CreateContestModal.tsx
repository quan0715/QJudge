import React, { useState } from "react";
import {
  Modal,
  TextInput,
  InlineNotification,
  DatePicker,
  DatePickerInput,
  TimePicker,
  TimePickerSelect,
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

const CreateContestModal: React.FC<CreateContestModalProps> = ({
  open,
  onClose,
  onCreated,
  classroomId,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [startMeridiem, setStartMeridiem] = useState<Meridiem>("AM");
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
    setName("");
    setStartDate(null);
    setStartTime("09:00");
    setStartMeridiem("AM");
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
    if (!date) return null;
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
    const normalizedHours =
      meridiem === "PM" ? (hours === 12 ? 12 : hours + 12) : (hours === 12 ? 0 : hours);
    combined.setHours(normalizedHours, minutes, 0, 0);
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
      ? t("createModal.chooseTypeTitle", "建立考試")
      : step === "configure_schedule"
        ? t("createModal.configureSchedule", "設定時間")
        : t("createModal.advancedSettings", "進階要求");

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
          ? !creationType || !name.trim()
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
            ? "#start-date"
            : creationType === "exam"
              ? "#contest-exam-mode"
              : "#contest-allow-multiple-joins"
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
              先選擇競賽類型，再輸入名稱。
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

            <TextInput
              id="contest-name"
              labelText={t("createModal.contestName", "競賽名稱")}
              placeholder={t("placeholder.contestName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={styles.nameInput}
            />
          </div>
        )}

        {step === "configure_schedule" && creationType && (
          <div className={styles.stepStack}>
            <div className={styles.sectionLabel}>
              {t("createModal.scheduleTitle", "設定時間")}
            </div>

            <div className={styles.fieldStack}>
              <DatePicker
                datePickerType="single"
                onChange={([date]) => setStartDate(date)}
                value={startDate ? [startDate] : []}
                className={styles.dateField}
              >
                <DatePickerInput
                  id="start-date"
                  labelText={tc("form.startDate")}
                  placeholder="yyyy/mm/dd"
                />
              </DatePicker>
            </div>

            <div className={styles.timeFieldBlock}>
              <TimePicker
                id="start-time"
                labelText={tc("form.startTime")}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="hh:mm"
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
                例如 09:30
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
                    text={`${minutes}m`}
                  />
                ))}
              </Select>
            </div>
          </div>
        )}

        {step === "advanced" && creationType && (
          <div className={styles.stepStack}>
            <div className={styles.helperText}>
              回答這幾個條件，建立後就能直接開始使用。
            </div>

            {creationType === "exam" && (
              <div className={styles.questionCard}>
                <div className={styles.questionTitle}>考試模式</div>
                <div className={styles.questionHint}>
                  開啟後會使用考試的監考與防作弊設定。
                </div>
                <Toggle
                  id="contest-exam-mode"
                  labelText={examModeEnabled ? "已啟用" : "未啟用"}
                  toggled={examModeEnabled}
                  onToggle={(checked: boolean) => setExamModeEnabled(checked)}
                  labelA="關閉"
                  labelB="開啟"
                />
              </div>
            )}

            <div className={styles.questionCard}>
              <div className={styles.questionTitle}>重複加入</div>
              <div className={styles.questionHint}>
                學生離開後，是否還能重新加入這場競賽。
              </div>
              <Toggle
                id="contest-allow-multiple-joins"
                labelText={allowMultipleJoins ? "允許" : "不允許"}
                toggled={allowMultipleJoins}
                onToggle={(checked: boolean) => setAllowMultipleJoins(checked)}
                labelA="不允許"
                labelB="允許"
              />
            </div>

            <div className={styles.questionCard}>
              <div className={styles.questionTitle}>密碼設定</div>
              <div className={styles.questionHint}>
                需要密碼時，學生報名或進入時都要輸入。
              </div>
              <Toggle
                id="contest-requires-password"
                labelText={requiresPassword ? "需要密碼" : "不需要密碼"}
                toggled={requiresPassword}
                onToggle={(checked: boolean) => setRequiresPassword(checked)}
                labelA={t("createModal.noPassword")}
                labelB={t("createModal.requiresPasswordShort")}
              />
              {requiresPassword && (
                <TextInput
                  id="contest-password"
                  labelText={t("hero.passwordLabel")}
                  placeholder={t("hero.passwordPlaceholder")}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className={styles.passwordInput}
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
