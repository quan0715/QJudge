import React, { useCallback, useEffect, useState } from "react";
import {
  TextInput,
  Select,
  SelectItem,
  NumberInput,
  FilterableMultiSelect,
  FormGroup,
  Stack,
  DismissibleTag,
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  OverflowMenu,
  OverflowMenuItem,
  InlineNotification,
} from "@carbon/react";
import { Add } from "@carbon/icons-react";
import {
  getTags,
  createTag,
  updateTag,
  deleteTag,
} from "@/infrastructure/api/repositories/problem.repository";
import type { Tag } from "@/core/entities/problem.entity";
import { useAuth } from "@/features/auth";
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

// Hex color options for tag creation/editing
const TAG_HEX_COLORS = [
  { label: "Blue", value: "#0f62fe" },
  { label: "Cyan", value: "#0072c3" },
  { label: "Teal", value: "#009d9a" },
  { label: "Green", value: "#198038" },
  { label: "Purple", value: "#8a3ffc" },
  { label: "Magenta", value: "#d02670" },
  { label: "Red", value: "#da1e28" },
  { label: "Gray", value: "#6f6f6f" },
];

/**
 * BasicInfoSection - Form section for basic problem info
 * Uses AutoSaveField for field-level auto-save
 */
const BasicInfoSection: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || (user as any)?.is_staff;
  const isTeacherOrAdmin =
    user?.role === "admin" || user?.role === "teacher" || (user as any)?.is_staff;

  // Tags state (loaded from API)
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);

  // Track initial load to reset FilterableMultiSelect when data is ready
  const [tagsReady, setTagsReady] = useState(false);

  // Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [modalTag, setModalTag] = useState<Tag | null>(null);
  const [modalName, setModalName] = useState("");
  const [modalColor, setModalColor] = useState("#0f62fe");
  const [modalError, setModalError] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Load tags
  const loadTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const tags = await getTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Create tag handler
  const handleCreateTag = async (
    onAutoSaveChange: (value: number[]) => void,
    fieldValue: number[],
    fieldOnChange: (value: number[]) => void,
  ) => {
    if (!modalName.trim()) {
      setModalError("名稱不能為空");
      return;
    }
    setModalLoading(true);
    setModalError("");
    try {
      const newTag = await createTag({
        name: modalName.trim(),
        color: modalColor,
      });
      await loadTags();
      // Auto-select the newly created tag
      const newValue = [...(fieldValue || []), Number(newTag.id)];
      fieldOnChange(newValue);
      onAutoSaveChange(newValue);
      setCreateModalOpen(false);
      setModalName("");
      setModalColor("#0f62fe");
    } catch (err: any) {
      setModalError(err?.message || "建立標籤失敗");
    } finally {
      setModalLoading(false);
    }
  };

  // Edit tag handler
  const handleEditTag = async () => {
    if (!modalTag || !modalName.trim()) {
      setModalError("名稱不能為空");
      return;
    }
    setModalLoading(true);
    setModalError("");
    try {
      await updateTag(modalTag.slug, {
        name: modalName.trim(),
        color: modalColor,
      });
      await loadTags();
      setEditModalOpen(false);
      setModalTag(null);
    } catch (err: any) {
      setModalError(err?.message || "更新標籤失敗");
    } finally {
      setModalLoading(false);
    }
  };

  // Delete tag handler
  const handleDeleteTag = async (
    onAutoSaveChange: (value: number[]) => void,
    fieldValue: number[],
    fieldOnChange: (value: number[]) => void,
  ) => {
    if (!modalTag) return;
    setModalLoading(true);
    setModalError("");
    try {
      await deleteTag(modalTag.slug);
      // Remove from selection if selected
      const tagId = Number(modalTag.id);
      const newValue = (fieldValue || []).filter((id: number) => id !== tagId);
      fieldOnChange(newValue);
      onAutoSaveChange(newValue);
      await loadTags();
      setDeleteConfirmOpen(false);
      setModalTag(null);
    } catch (err: any) {
      setModalError(err?.message || "刪除標籤失敗");
    } finally {
      setModalLoading(false);
    }
  };

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
          if (!tagsLoading && !tagsReady && field.value !== undefined) {
            setTimeout(() => setTagsReady(true), 0);
          }

          const selectionKey = `tags-${tagsReady ? "ready" : "loading"}`;

          return (
            <div className={styles.tagsContainer}>
              <div className={styles.row}>
                <div style={{ flex: 1 }}>
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
                </div>
                {isTeacherOrAdmin && (
                  <div style={{ alignSelf: "flex-end" }}>
                    <Button
                      kind="ghost"
                      size="md"
                      renderIcon={Add}
                      iconDescription="新增標籤"
                      hasIconOnly
                      onClick={() => {
                        setModalName("");
                        setModalColor("#0f62fe");
                        setModalError("");
                        setCreateModalOpen(true);
                      }}
                      tooltipPosition="left"
                    />
                  </div>
                )}
              </div>

              {/* Selected tags with overflow menu */}
              {selectedTags.length > 0 && (
                <div className={styles.selectedTags}>
                  {selectedTags.map((tag, idx) =>
                    isTeacherOrAdmin ? (
                      <span
                        key={tag.id}
                        style={{ display: "inline-flex", alignItems: "center" }}
                      >
                        <DismissibleTag
                          type={TAG_COLORS[idx % TAG_COLORS.length]}
                          text={tag.name}
                          onClose={() => handleRemoveTag(Number(tag.id))}
                        />
                        <OverflowMenu size="sm" flipped>
                          <OverflowMenuItem
                            itemText="編輯"
                            onClick={() => {
                              setModalTag(tag);
                              setModalName(tag.name);
                              setModalColor(tag.color || "#0f62fe");
                              setModalError("");
                              setEditModalOpen(true);
                            }}
                          />
                          {isAdmin && (
                            <OverflowMenuItem
                              itemText="刪除"
                              isDelete
                              onClick={() => {
                                setModalTag(tag);
                                setModalError("");
                                setDeleteConfirmOpen(true);
                              }}
                            />
                          )}
                        </OverflowMenu>
                      </span>
                    ) : (
                      <DismissibleTag
                        key={tag.id}
                        type={TAG_COLORS[idx % TAG_COLORS.length]}
                        text={tag.name}
                        onClose={() => handleRemoveTag(Number(tag.id))}
                      />
                    )
                  )}
                </div>
              )}

              {/* Create Tag Modal */}
              <ComposedModal
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                size="sm"
              >
                <ModalHeader title="新增標籤" />
                <ModalBody>
                  <Stack gap={5}>
                    {modalError && (
                      <InlineNotification
                        kind="error"
                        title={modalError}
                        hideCloseButton
                        lowContrast
                      />
                    )}
                    <TextInput
                      id="new-tag-name"
                      labelText="標籤名稱 *"
                      value={modalName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setModalName(e.target.value)
                      }
                      placeholder="例如: Dynamic Programming"
                    />
                    <Select
                      id="new-tag-color"
                      labelText="顏色"
                      value={modalColor}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setModalColor(e.target.value)
                      }
                    >
                      {TAG_HEX_COLORS.map((c) => (
                        <SelectItem key={c.value} value={c.value} text={c.label} />
                      ))}
                    </Select>
                  </Stack>
                </ModalBody>
                <ModalFooter
                  primaryButtonText="建立"
                  secondaryButtonText="取消"
                  onRequestClose={() => setCreateModalOpen(false)}
                  onRequestSubmit={() =>
                    handleCreateTag(onAutoSaveChange, field.value || [], field.onChange)
                  }
                  primaryButtonDisabled={modalLoading}
                >
                  <></>
                </ModalFooter>
              </ComposedModal>

              {/* Edit Tag Modal */}
              <ComposedModal
                open={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                size="sm"
              >
                <ModalHeader title="編輯標籤" />
                <ModalBody>
                  <Stack gap={5}>
                    {modalError && (
                      <InlineNotification
                        kind="error"
                        title={modalError}
                        hideCloseButton
                        lowContrast
                      />
                    )}
                    <TextInput
                      id="edit-tag-name"
                      labelText="標籤名稱 *"
                      value={modalName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setModalName(e.target.value)
                      }
                    />
                    <Select
                      id="edit-tag-color"
                      labelText="顏色"
                      value={modalColor}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setModalColor(e.target.value)
                      }
                    >
                      {TAG_HEX_COLORS.map((c) => (
                        <SelectItem key={c.value} value={c.value} text={c.label} />
                      ))}
                    </Select>
                  </Stack>
                </ModalBody>
                <ModalFooter
                  primaryButtonText="儲存"
                  secondaryButtonText="取消"
                  onRequestClose={() => setEditModalOpen(false)}
                  onRequestSubmit={handleEditTag}
                  primaryButtonDisabled={modalLoading}
                >
                  <></>
                </ModalFooter>
              </ComposedModal>

              {/* Delete Confirm Modal */}
              <ComposedModal
                open={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
                size="xs"
                danger
              >
                <ModalHeader title="確認刪除標籤" />
                <ModalBody>
                  {modalError && (
                    <InlineNotification
                      kind="error"
                      title={modalError}
                      hideCloseButton
                      lowContrast
                    />
                  )}
                  <p>
                    確定要刪除標籤「{modalTag?.name}」嗎？此操作無法復原。
                  </p>
                </ModalBody>
                <ModalFooter
                  danger
                  primaryButtonText="刪除"
                  secondaryButtonText="取消"
                  onRequestClose={() => setDeleteConfirmOpen(false)}
                  onRequestSubmit={() =>
                    handleDeleteTag(onAutoSaveChange, field.value || [], field.onChange)
                  }
                  primaryButtonDisabled={modalLoading}
                >
                  <></>
                </ModalFooter>
              </ComposedModal>
            </div>
          );
        }}
      </AutoSaveField>
    </Stack>
  );
};

export default BasicInfoSection;
