import { Button, FluidDropdown } from "@carbon/react";
import {
  CheckboxCheckedFilled,
  CheckboxIndeterminate,
  Checkbox as CheckboxIcon,
  Renew,
  Send,
  Undo,
} from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { FilterPopover } from "@/shared/ui/filter/FilterPopover";
import styles from "./GradingBulkToolbar.module.scss";

export interface ScoreFilterOption {
  id: string;
  label: string;
  score: number | null;
}

interface GradingBulkToolbarProps {
  scoreFilterOptions: ScoreFilterOption[];
  selectedScoreFilter: ScoreFilterOption | undefined;
  scoreFilterId: string;
  onScoreFilterChange(id: string): void;

  selectedCount: number;
  filteredCount: number;
  allFilteredSelected: boolean;
  someFilteredSelected: boolean;
  onToggleSelectAllFiltered(): void;

  canBulkAct: boolean;
  submitting: boolean;
  revertableCount: number;
  submittableCount: number;

  onRequestRevert(): void;
  onRequestRetry(): void;
  onRequestSubmit(): void;
}

export function GradingBulkToolbar({
  scoreFilterOptions,
  selectedScoreFilter,
  scoreFilterId,
  onScoreFilterChange,
  selectedCount,
  filteredCount,
  allFilteredSelected,
  someFilteredSelected,
  onToggleSelectAllFiltered,
  canBulkAct,
  submitting,
  revertableCount,
  submittableCount,
  onRequestRevert,
  onRequestRetry,
  onRequestSubmit,
}: GradingBulkToolbarProps) {
  const { t } = useTranslation("contest");
  const selectAllIcon = allFilteredSelected
    ? CheckboxCheckedFilled
    : someFilteredSelected
      ? CheckboxIndeterminate
      : CheckboxIcon;
  return (
    <div className={styles.bulkBar}>
      <FilterPopover
        hasActiveFilters={scoreFilterId !== "all"}
        triggerLabel={t("grading.scoreFilterLabel", "建議分數篩選")}
        onReset={() => onScoreFilterChange("all")}
        align="bottom-left"
      >
        <FluidDropdown
          id="ai-grading-score-filter"
          titleText={t("grading.scoreFilterLabel", "建議分數篩選")}
          label={t("grading.scoreFilterAll", "全部建議分數")}
          items={scoreFilterOptions}
          selectedItem={selectedScoreFilter}
          itemToString={(item) => (item as ScoreFilterOption | null)?.label ?? ""}
          onChange={({ selectedItem }) => {
            onScoreFilterChange((selectedItem as ScoreFilterOption | null)?.id ?? "all");
          }}
        />
      </FilterPopover>
      <Button
        kind="ghost"
        size="md"
        hasIconOnly
        renderIcon={selectAllIcon}
        iconDescription={
          allFilteredSelected
            ? t("grading.bulkDeselectAll", "取消全選（目前篩選）")
            : t("grading.bulkSelectAll", "全選（目前篩選）")
        }
        disabled={filteredCount === 0}
        onClick={onToggleSelectAllFiltered}
      />
      <span className={styles.bulkCount}>
        {t("grading.selectedCount", "已選取 {{count}} 筆", { count: selectedCount })}
      </span>
      <Button
        kind="ghost"
        size="md"
        hasIconOnly
        renderIcon={Undo}
        iconDescription={t("grading.bulkRevertPublish", "撤回已送出評分")}
        disabled={!canBulkAct || submitting || revertableCount === 0}
        onClick={onRequestRevert}
      />
      <Button
        kind="ghost"
        size="md"
        hasIconOnly
        renderIcon={Renew}
        iconDescription={t("grading.bulkRetryAiGrading", "批量重新批改")}
        disabled={!canBulkAct || selectedCount === 0}
        onClick={onRequestRetry}
      />
      <Button
        kind="primary"
        size="md"
        hasIconOnly
        renderIcon={Send}
        iconDescription={t("grading.bulkPublish", "批量送出")}
        disabled={!canBulkAct || submitting || submittableCount === 0}
        onClick={onRequestSubmit}
      />
    </div>
  );
}
