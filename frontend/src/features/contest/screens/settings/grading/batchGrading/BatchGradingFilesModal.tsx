import {
  InlineLoading,
  InlineNotification,
  Modal,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { ArtifactPreview } from "@/shared/ai/ArtifactPreview";
import type { BatchQuestionFiles } from "./batchGradingApi";
import type { BatchQuestionState } from "./batchGradingModel";
import styles from "./BatchGrading.module.scss";

interface BatchGradingFilesModalProps {
  open: boolean;
  state: BatchQuestionState;
  /** Undefined while loading. */
  files?: BatchQuestionFiles;
  error?: string;
  onClose(): void;
}

/** Read-only view of the rubric and grade CSV the AI produced for one question. */
export function BatchGradingFilesModal({ open, state, files, error, onClose }: BatchGradingFilesModalProps) {
  const { t } = useTranslation("contest");
  const panel = (artifact: BatchQuestionFiles["rubric"]) =>
    artifact ? <ArtifactPreview artifact={artifact} /> : <p>{t("grading.batch.filesMissing")}</p>;

  return (
    <Modal
      open={open}
      passiveModal
      size="lg"
      modalHeading={t("grading.batch.filesTitle", { label: state.label })}
      onRequestClose={onClose}
    >
      {state.skippedAtWriteCount ? (
        <InlineNotification
          className={styles.notice}
          kind="warning"
          lowContrast
          hideCloseButton
          title={t("grading.batch.filesNotUsed", { count: state.skippedAtWriteCount })}
        />
      ) : null}
      {error && <InlineNotification kind="error" lowContrast hideCloseButton title={error} />}
      {!files && !error && <InlineLoading description={t("grading.batch.filesLoading")} />}
      {files && (
        <Tabs>
          <TabList aria-label={t("grading.batch.filesTitle", { label: state.label })}>
            <Tab>{t("grading.batch.filesRubric")}</Tab>
            <Tab>{t("grading.batch.filesGrades")}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>{panel(files.rubric)}</TabPanel>
            <TabPanel>{panel(files.grade)}</TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </Modal>
  );
}
