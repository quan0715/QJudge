import React, { useState } from "react";
import {
  Modal,
  TextInput,
  InlineNotification,
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
type CreateContestStep = "select_type" | "basic" | "advanced";

const CreateContestModal: React.FC<CreateContestModalProps> = ({
  open,
  onClose,
  onCreated,
  classroomId,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [name, setName] = useState("");
  const [examModeEnabled, setExamModeEnabled] = useState(true);
  const [allowMultipleJoins, setAllowMultipleJoins] = useState(false);
  const [attendanceCheckEnabled, setAttendanceCheckEnabled] = useState(false);
  const [creationType, setCreationType] = useState<ContestCreationType | null>(null);
  const [step, setStep] = useState<CreateContestStep>("select_type");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setExamModeEnabled(true);
    setAllowMultipleJoins(false);
    setAttendanceCheckEnabled(false);
    setCreationType(null);
    setStep("select_type");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canCreate = !!creationType && !!name.trim();

  const handleSubmit = async () => {
    if (!creationType || !name.trim()) return;

    setLoading(true);
    setError("");

    try {
      const createdContest = await createClassroomContest(classroomId, {
        name,
        description: "",
        contest_type: creationType === "exam" ? "paper_exam" : "coding",
        attendance_check_enabled: attendanceCheckEnabled,
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
      : step === "basic"
        ? "2 / 3"
        : "3 / 3";

  const modalHeading =
    step === "select_type"
      ? t("createModal.chooseTypeTitle", "建立競賽")
      : step === "basic"
        ? t("createModal.configureBasic", "設定基本資訊")
        : t("createModal.advancedSettings", "進階條件設定");

  const primaryButtonText =
    step === "advanced"
      ? tc("button.create")
      : tc("button.next", "下一步");

  const secondaryButtonText =
    step === "select_type"
      ? tc("button.cancel")
      : tc("button.back", "返回");

  return (
    <Modal
      open={open}
      data-testid="create-contest-modal"
      onRequestClose={handleClose}
      modalLabel={modalLabel}
      modalHeading={modalHeading}
      primaryButtonText={primaryButtonText}
      secondaryButtonText={secondaryButtonText}
      onRequestSubmit={() => {
        if (step === "select_type") {
          if (creationType) {
            setStep("basic");
            setError("");
          }
          return;
        }
        if (step === "basic") {
          if (!name.trim()) {
            setError(t("createModal.validation.nameRequired", "請輸入競賽名稱"));
            return;
          }
          setStep("advanced");
          setError("");
          return;
        }
        void handleSubmit();
      }}
      onSecondarySubmit={() => {
        if (step === "advanced") {
          setStep("basic");
          setError("");
          return;
        }
        if (step === "basic") {
          setStep("select_type");
          setError("");
          return;
        }
        handleClose();
      }}
      primaryButtonDisabled={
        step === "select_type"
          ? !creationType
          : step === "basic"
            ? loading
            : !canCreate || loading
      }
      size="sm"
      hasScrollingContent
      selectorPrimaryFocus={
        step === "select_type"
          ? undefined
          : step === "basic"
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
                data-testid="create-contest-type-coding"
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
                data-testid="create-contest-type-exam"
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

        {step === "basic" && creationType && (
          <div className={styles.stepStack}>
            <div className={styles.sectionLabel}>
              {t("createModal.configureBasic", "設定基本資訊")}
            </div>
            <p className={styles.helperText}>
              {t(
                "createModal.basicIntro",
                "競賽會先建立為草稿，發布時再設定正式時段。",
              )}
            </p>

            <TextInput
              id="contest-name"
              data-testid="create-contest-name"
              labelText={t("createModal.contestName", "競賽名稱")}
              placeholder={t("createModal.contestNamePlaceholder", "例如：114-2 期中評量")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={styles.nameInput}
            />
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
                  <div className={styles.questionTitle} id="contest-attendance-toggle-label">
                    {t("createModal.attendanceTitle", "QR 簽到簽退")}
                  </div>
                  <div className={styles.questionHint}>
                    {t(
                      "createModal.attendanceHint",
                      "啟用後，學生需在競賽主頁完成 QR 簽到後才能開始考試。",
                    )}
                  </div>
                </div>
                <Toggle
                  id="contest-attendance-check"
                  aria-labelledby="contest-attendance-toggle-label"
                  labelText=""
                  hideLabel
                  toggled={attendanceCheckEnabled}
                  onToggle={(checked: boolean) => setAttendanceCheckEnabled(checked)}
                  labelA=""
                  labelB=""
                />
              </div>
            </div>
          </div>
        )}
      </>
    </Modal>
  );
};

export default CreateContestModal;
