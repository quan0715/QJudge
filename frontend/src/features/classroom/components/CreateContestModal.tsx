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
type CreateContestStep = "select_type" | "basic";

const CreateContestModal: React.FC<CreateContestModalProps> = ({
  open,
  onClose,
  onCreated,
  classroomId,
}) => {
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");

  const [name, setName] = useState("");
  const [examModeEnabled, setExamModeEnabled] = useState(false);
  const [creationType, setCreationType] = useState<ContestCreationType | null>(null);
  const [step, setStep] = useState<CreateContestStep>("select_type");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setExamModeEnabled(false);
    setCreationType(null);
    setStep("select_type");
    setError("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!creationType) return;
    if (!name.trim()) {
      setError(t("createModal.validation.nameRequired", "請輸入競賽名稱"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Rejoin and QR attendance stay in the settings dialog.
      const createdContest = await createClassroomContest(classroomId, {
        name,
        description: "",
        contest_type: creationType === "exam" ? "paper_exam" : "coding",
        cheat_detection_enabled: examModeEnabled,
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

  return (
    <Modal
      open={open}
      data-testid="create-contest-modal"
      onRequestClose={handleClose}
      modalLabel={step === "select_type" ? "1 / 2" : "2 / 2"}
      modalHeading={
        step === "select_type"
          ? t("createModal.chooseTypeTitle", "建立競賽")
          : t("createModal.configureBasic", "設定基本資訊")
      }
      primaryButtonText={
        step === "basic" ? tc("button.create") : tc("button.next", "下一步")
      }
      secondaryButtonText={
        step === "select_type" ? tc("button.cancel") : tc("button.back", "返回")
      }
      onRequestSubmit={() => {
        if (step === "select_type") {
          if (creationType) {
            setStep("basic");
            setError("");
          }
          return;
        }
        void handleSubmit();
      }}
      onSecondarySubmit={() => {
        if (step === "basic") {
          setStep("select_type");
          setError("");
          return;
        }
        handleClose();
      }}
      primaryButtonDisabled={step === "select_type" ? !creationType : loading}
      size="sm"
      hasScrollingContent
      selectorPrimaryFocus={step === "basic" ? "#contest-name" : undefined}
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
                onClick={() => setCreationType("coding_test")}
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
                onClick={() => setCreationType("exam")}
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
                  className={styles.questionToggle}
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
          </div>
        )}
      </>
    </Modal>
  );
};

export default CreateContestModal;
