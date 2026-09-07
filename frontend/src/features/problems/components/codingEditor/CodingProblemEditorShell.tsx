import React, { useEffect, useMemo } from "react";
import { Button } from "@carbon/react";
import { View } from "@carbon/icons-react";
import type { ProblemFormSchema } from "@/features/problems/forms/problemFormSchema";
import { useProblemEdit } from "@/features/problems/contexts/ProblemEditContext";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { TriggerModal, type TriggerModalHandle } from "@/shared/ui/modal";
import ProblemEditHeader from "./ProblemEditHeader";
import ProblemEditSections from "./ProblemEditSections";
import ProblemEditPreviewModal from "./ProblemEditPreviewModal";
import { formSchemaToPreview } from "@/features/problems/forms/problemPreviewAdapter";
import "./CodingProblemEditorShell.scss";
import styles from "./CodingProblemEditorShell.module.scss";

interface CodingProblemEditorShellProps {
  title: string;
  formValues: ProblemFormSchema;
  onDelete: () => Promise<void>;
  hideBackButton?: boolean;
  hideHeader?: boolean;
  onBack?: () => void;
  showPreview?: boolean;
  showGlobalSaveStatus?: boolean;
  onGlobalSaveStatusChange?: (status: "idle" | "saving" | "saved" | "error") => void;
  extraActions?: React.ReactNode;
  onToolbarActionsReady?: (actions: React.ReactNode) => void;
}

const CodingProblemEditorShell: React.FC<CodingProblemEditorShellProps> = ({
  title,
  formValues,
  onDelete,
  hideBackButton = true,
  hideHeader = false,
  onBack,
  showPreview = true,
  showGlobalSaveStatus = true,
  onGlobalSaveStatusChange,
  extraActions,
  onToolbarActionsReady,
}) => {
  const { autoSave } = useProblemEdit();
  const previewModalRef = React.useRef<TriggerModalHandle>(null);

  const previewData = useMemo(() => formSchemaToPreview(formValues), [formValues]);

  useEffect(() => {
    onGlobalSaveStatusChange?.(autoSave.globalStatus);
  }, [autoSave.globalStatus, onGlobalSaveStatusChange]);

  useEffect(() => {
    onToolbarActionsReady?.(extraActions);
  }, [extraActions, onToolbarActionsReady]);

  return (
    <div className={styles.editorRoot}>
      {!hideHeader && (
        <ProblemEditHeader
          title={title || "Untitled"}
          onBack={onBack || (() => {})}
          hideBackButton={hideBackButton}
          globalSaveStatus={
            showGlobalSaveStatus ? <GlobalSaveStatus status={autoSave.globalStatus} /> : undefined
          }
          actions={
            <>
              {extraActions}
              {showPreview ? (
                <Button
                  kind="secondary"
                  size="sm"
                  renderIcon={View}
                  onClick={() => previewModalRef.current?.open()}
                >
                  Preview
                </Button>
              ) : null}
            </>
          }
        />
      )}

      <div className={styles.editorContent}>
        <ProblemEditSections
          problemTitle={title}
          onDelete={onDelete}
        />
      </div>

      {showPreview ? (
        <TriggerModal
          ref={previewModalRef}
          renderModal={({ open, onClose }) => (
            <ProblemEditPreviewModal
              open={open}
              onClose={onClose}
              previewData={previewData}
            />
          )}
        />
      ) : null}
    </div>
  );
};

export default CodingProblemEditorShell;
