import React, { useState, useEffect, useRef } from "react";
import {
  DismissibleTag,
  TextInput,
  SkeletonText,
  Layer,
} from "@carbon/react";
import { Add, ChevronDown } from "@carbon/icons-react";
import "./TagFormField.scss";

export interface Tag {
  id: string | number;
  name: string;
}

export interface TagFormFieldProps {
  /** Available tags to select from */
  availableTags: Tag[];
  /** Currently selected tag IDs */
  selectedTagIds: number[];
  /** Callback when selection changes */
  onSelectionChange: (selectedIds: number[]) => void;
  /** Callback to create a new tag */
  onCreateTag?: (name: string) => void;
  /** Pending new tag names (not yet created) */
  pendingNewTags?: string[];
  /** Callback when pending new tags change */
  onPendingNewTagsChange?: (names: string[]) => void;
  /** Loading state */
  loading?: boolean;
  /** Label text */
  titleText?: string;
  /** Helper text */
  helperText?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Invalid state */
  invalid?: boolean;
  /** Invalid text */
  invalidText?: string;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * TagFormField - A reusable tag selection form field
 *
 * Features:
 * - Select from existing tags
 * - Create new tags on the fly
 * - Display selected tags as dismissible badges
 * - Search/filter functionality
 */
export const TagFormField: React.FC<TagFormFieldProps> = ({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onCreateTag,
  pendingNewTags = [],
  onPendingNewTagsChange,
  loading = false,
  titleText = "標籤",
  helperText,
  placeholder = "搜尋並選擇標籤...",
  invalid = false,
  invalidText,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter tags based on search
  const filteredTags = availableTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Check if search text matches any existing tag or pending tag
  const searchMatchesExisting = availableTags.some(
    (tag) => tag.name.toLowerCase() === searchText.toLowerCase()
  );
  const searchMatchesPending = pendingNewTags.some(
    (name) => name.toLowerCase() === searchText.toLowerCase()
  );
  const canCreateNew =
    searchText.trim() && !searchMatchesExisting && !searchMatchesPending;

  // Get selected tags for display
  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(Number(tag.id))
  );

  const handleTagToggle = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onSelectionChange([...selectedTagIds, tagId]);
    }
  };

  const handleRemoveTag = (tagId: number) => {
    onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
  };

  const handleRemovePendingTag = (name: string) => {
    if (onPendingNewTagsChange) {
      onPendingNewTagsChange(pendingNewTags.filter((n) => n !== name));
    }
  };

  const handleCreateNew = () => {
    if (!searchText.trim()) return;

    if (onPendingNewTagsChange) {
      onPendingNewTagsChange([...pendingNewTags, searchText.trim()]);
    } else if (onCreateTag) {
      onCreateTag(searchText.trim());
    }
    setSearchText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canCreateNew) {
      e.preventDefault();
      handleCreateNew();
    }
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="tag-form-field tag-form-field--loading">
        <label className="cds--label">{titleText}</label>
        <div className="tag-form-field__skeleton-input">
          <SkeletonText heading width="100%" />
        </div>
        <div className="tag-form-field__skeleton-tags">
          <SkeletonText width="60px" />
          <SkeletonText width="80px" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`tag-form-field ${invalid ? "tag-form-field--invalid" : ""} ${
        disabled ? "tag-form-field--disabled" : ""
      }`}
    >
      <label className="cds--label">{titleText}</label>

      {/* Selected Tags Display */}
      {(selectedTags.length > 0 || pendingNewTags.length > 0) && (
        <div className="tag-form-field__selected">
          {selectedTags.map((tag) => (
            <DismissibleTag
              key={tag.id}
              type="blue"
              text={tag.name}
              onClose={() => handleRemoveTag(Number(tag.id))}
              disabled={disabled}
            />
          ))}
          {pendingNewTags.map((name) => (
            <DismissibleTag
              key={`new-${name}`}
              type="green"
              text={`+ ${name}`}
              onClose={() => handleRemovePendingTag(name)}
              title="新標籤（儲存時建立）"
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {/* Search Input */}
      <div className="tag-form-field__input-wrapper">
        <TextInput
          id="tag-search"
          labelText=""
          placeholder={placeholder}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onFocus={() => !disabled && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          invalid={invalid}
          disabled={disabled}
        />
        <button
          type="button"
          className="tag-form-field__dropdown-toggle"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          aria-label="Toggle dropdown"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <Layer>
          <div className="tag-form-field__dropdown">
            {/* Create New Tag Option */}
            {canCreateNew && (
              <button
                type="button"
                className="tag-form-field__create-option"
                onClick={handleCreateNew}
              >
                <Add size={16} />
                建立新標籤：「{searchText}」
              </button>
            )}

            {/* Existing Tags */}
            {filteredTags.length > 0 ? (
              filteredTags.map((tag) => {
                const isSelected = selectedTagIds.includes(Number(tag.id));
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`tag-form-field__option ${
                      isSelected ? "tag-form-field__option--selected" : ""
                    }`}
                    onClick={() => handleTagToggle(Number(tag.id))}
                  >
                    <span>{tag.name}</span>
                    {isSelected && <span className="tag-form-field__check">✓</span>}
                  </button>
                );
              })
            ) : (
              !canCreateNew && (
                <div className="tag-form-field__empty">
                  {searchText ? "找不到符合的標籤" : "沒有可用的標籤"}
                </div>
              )
            )}
          </div>
        </Layer>
      )}

      {/* Helper/Invalid Text */}
      {invalid && invalidText ? (
        <div className="cds--form-requirement">{invalidText}</div>
      ) : (
        helperText && <div className="cds--form__helper-text">{helperText}</div>
      )}

      {/* Pending tags helper */}
      {pendingNewTags.length > 0 && (
        <p className="tag-form-field__pending-hint">
          綠色標籤為新增標籤，將在儲存時建立
        </p>
      )}
    </div>
  );
};

export default TagFormField;
