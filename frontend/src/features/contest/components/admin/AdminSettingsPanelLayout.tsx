import { FieldSaveIndicator } from "@/shared/ui/autoSave/FieldSaveIndicator";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";

// Contest settings report auto-save once per section instead of on every row.

interface SectionSaveIndicatorProps {
  fields: readonly string[];
  getState: (field: string) => FieldSaveState | undefined;
  onRetry: (field: string) => void;
}

export const SectionSaveIndicator = ({
  fields,
  getState,
  onRetry,
}: SectionSaveIndicatorProps) => {
  const states = fields.map((field) => ({ field, state: getState(field) }));
  const failed = states.find(({ state }) => state?.status === "error");
  if (failed) {
    return (
      <FieldSaveIndicator
        status="error"
        error={failed.state?.error}
        onRetry={() => onRetry(failed.field)}
      />
    );
  }
  if (states.some(({ state }) => state?.status === "saving")) {
    return <FieldSaveIndicator status="saving" />;
  }
  if (states.some(({ state }) => state?.status === "saved")) {
    return <FieldSaveIndicator status="saved" />;
  }
  return null;
};
