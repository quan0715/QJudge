import type { TFunction } from "i18next";
import type { ContestDetail } from "@/core/entities/contest.entity";
import type { FieldSaveState } from "@/features/contest/components/admin/examEditor/hooks/useExamAutoSave";

export type TranslateFn = TFunction;

export interface ContestSettingsPanelProps {
  t: TranslateFn;
  tc: TranslateFn;
  contest: ContestDetail;
  form: Record<string, unknown>;
  getState: (field: string) => FieldSaveState | undefined;
  onRetry: (field: string) => void;
  onChange: (field: string, value: unknown) => void;
  onConfirmedChange: (field: string, value: unknown, message: string) => void;
}
