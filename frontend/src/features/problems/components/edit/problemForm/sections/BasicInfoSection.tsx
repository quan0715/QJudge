import React, { useEffect, useState } from "react";
import {
  TextInput,
  Select,
  SelectItem,
  NumberInput,
  FilterableMultiSelect,
  FormGroup,
  Stack,
  DismissibleTag,
} from "@carbon/react";
import { getTags } from "@/infrastructure/api/repositories/problem.repository";
import type { Tag } from "@/core/entities/problem.entity";
import { AutoSaveField } from "@/features/problems/components/edit/common";
import styles from "./BasicInfoSection.module.scss";

// Tag color mapping based on tag properties or index
const TAG_COLORS: Array<
  | "red"
  | "magenta"
  | "purple"
  | "blue"
  | "cyan"
  | "teal"
  | "green"
  | "gray"
  | "cool-gray"
  | "warm-gray"
> = ["blue", "cyan", "teal", "green", "purple", "magenta", "red", "gray"];

/**
 * BasicInfoSection - Form section for basic problem info
 * Uses AutoSaveField for field-level auto-save
 */
const BasicInfoSection: React.FC = () => {

  // Tags state (loaded from API)
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  
  // Track initial load to reset FilterableMultiSelect when data is ready
  const [tagsReady, setTagsReady] = useState(false);

  // Load tags on mount
  useEffect(() => {
    const loadTags = async () => {
      setTagsLoading(true);
      try {
        const tags = await getTags();
        setAvailableTags(tags);
      } catch (error) {
        console.error("Failed to load tags:", error);
      } finally {
        setTagsLoading(false);
      }
    };
    loadTags();
  }, []);

  return (
    <Stack gap={6}>
      {/* Title */}
      <AutoSaveField name="title">
        {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
          <TextInput
            id="problem-title"
            labelText="題目名稱 (Internal Title) *"
            placeholder="例如: Two Sum"
            invalid={invalid}
            invalidText={error}
            {...field}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              field.onChange(e);
              onAutoSaveChange(e.target.value);
            }}
            onBlur={() => {
              field.onBlur();
              onAutoSaveBlur();
            }}
          />
        )}
      </AutoSaveField>

      {/* Difficulty */}
      <AutoSaveField name="difficulty">
        {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
          <Select
            id="difficulty-select"
            labelText="難度 *"
            invalid={invalid}
            invalidText={error}
            {...field}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              field.onChange(e);
              onAutoSaveChange(e.target.value);
            }}
            onBlur={() => {
              field.onBlur();
              onAutoSaveBlur();
            }}
          >
            <SelectItem value="easy" text="Easy" />
            <SelectItem value="medium" text="Medium" />
            <SelectItem value="hard" text="Hard" />
          </Select>
        )}
      </AutoSaveField>

      {/* Time & Memory Limits Row */}
      <FormGroup legendText="執行限制 *">
        <div className={styles.row}>
          <div className={styles.field}>
            <AutoSaveField name="timeLimit">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <NumberInput
                  id="time-limit"
                  label="時間限制 (ms)"
                  value={field.value}
                  invalid={invalid}
                  invalidText={error}
                  onChange={(
                    _: React.SyntheticEvent,
                    { value }: { value: number | string }
                  ) => {
                    const numValue = Number(value);
                    field.onChange(numValue);
                    onAutoSaveChange(numValue);
                  }}
                  onBlur={() => {
                    field.onBlur();
                    onAutoSaveBlur();
                  }}
                  min={100}
                  step={100}
                />
              )}
            </AutoSaveField>
          </div>
          <div className={styles.field}>
            <AutoSaveField name="memoryLimit">
              {({ field, error, invalid, onAutoSaveChange, onAutoSaveBlur }) => (
                <NumberInput
                  id="memory-limit"
                  label="記憶體限制 (MB)"
                  value={field.value}
                  invalid={invalid}
                  invalidText={error}
                  onChange={(
                    _: React.SyntheticEvent,
                    { value }: { value: number | string }
                  ) => {
                    const numValue = Number(value);
                    field.onChange(numValue);
                    onAutoSaveChange(numValue);
                  }}
                  onBlur={() => {
                    field.onBlur();
                    onAutoSaveBlur();
                  }}
                  min={16}
                  step={16}
                />
              )}
            </AutoSaveField>
          </div>
        </div>
      </FormGroup>

      {/* Tags */}
      <AutoSaveField name="existingTagIds">
        {({ field, onAutoSaveChange }) => {
          const selectedTags = availableTags.filter((t) =>
            field.value?.includes(Number(t.id))
          );

          const handleRemoveTag = (tagId: number) => {
            const newValue = field.value?.filter((id: number) => id !== tagId) || [];
            field.onChange(newValue);
            onAutoSaveChange(newValue);
          };

          // Track when both tags and field value are ready for the first time
          // This ensures FilterableMultiSelect re-initializes with correct selection
          if (!tagsLoading && !tagsReady && field.value !== undefined) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => setTagsReady(true), 0);
          }

          // Key changes only when tags are first loaded with data
          const selectionKey = `tags-${tagsReady ? "ready" : "loading"}`;
          
          return (
            <div className={styles.tagsContainer}>
              <FilterableMultiSelect
                key={selectionKey}
                id="tags-select"
                titleText="標籤"
                placeholder="選擇標籤"
                items={availableTags}
                itemToString={(item: Tag | null) => (item ? item.name : "")}
                initialSelectedItems={selectedTags}
                onChange={({ selectedItems }: { selectedItems: Tag[] }) => {
                  const newValue = selectedItems.map((t) => Number(t.id));
                  field.onChange(newValue);
                  onAutoSaveChange(newValue);
                }}
                disabled={tagsLoading}
              />
              {/* Selected tags display */}
              {selectedTags.length > 0 && (
                <div className={styles.selectedTags}>
                  {selectedTags.map((tag, idx) => (
                    <DismissibleTag
                      key={tag.id}
                      type={TAG_COLORS[idx % TAG_COLORS.length]}
                      text={tag.name}
                      onClose={() => handleRemoveTag(Number(tag.id))}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        }}
      </AutoSaveField>
    </Stack>
  );
};

export default BasicInfoSection;
