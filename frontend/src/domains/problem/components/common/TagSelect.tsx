import React, { useState, useEffect, useRef } from 'react';
import {
  Tag as CarbonTag,
  TextInput,
  SkeletonText,
  Layer
} from '@carbon/react';
import { Add, ChevronDown } from '@carbon/icons-react';
import type { Tag } from '@/core/entities/problem.entity';

export interface TagSelectProps {
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
  /** Placeholder text */
  placeholder?: string;
}

export const TagSelect: React.FC<TagSelectProps> = ({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onCreateTag,
  pendingNewTags = [],
  onPendingNewTagsChange,
  loading = false,
  titleText = '標籤',
  placeholder = '搜尋並選擇標籤...'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter tags based on search
  const filteredTags = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(searchText.toLowerCase())
  );

  // Check if search text matches any existing tag or pending tag
  const searchMatchesExisting = availableTags.some(
    tag => tag.name.toLowerCase() === searchText.toLowerCase()
  );
  const searchMatchesPending = pendingNewTags.some(
    name => name.toLowerCase() === searchText.toLowerCase()
  );
  const canCreateNew = searchText.trim() && !searchMatchesExisting && !searchMatchesPending;

  // Get selected tags for display
  const selectedTags = availableTags.filter(tag => selectedTagIds.includes(Number(tag.id)));

  const handleTagToggle = (tagId: number) => {
    if (selectedTagIds.includes(tagId)) {
      onSelectionChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onSelectionChange([...selectedTagIds, tagId]);
    }
  };

  const handleRemoveTag = (tagId: number) => {
    onSelectionChange(selectedTagIds.filter(id => id !== tagId));
  };

  const handleRemovePendingTag = (name: string) => {
    if (onPendingNewTagsChange) {
      onPendingNewTagsChange(pendingNewTags.filter(n => n !== name));
    }
  };

  const handleCreateNew = () => {
    if (!searchText.trim()) return;
    
    if (onPendingNewTagsChange) {
      onPendingNewTagsChange([...pendingNewTags, searchText.trim()]);
    } else if (onCreateTag) {
      onCreateTag(searchText.trim());
    }
    setSearchText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canCreateNew) {
      e.preventDefault();
      handleCreateNew();
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div>
        <label className="cds--label" style={{ marginBottom: '0.5rem', display: 'block' }}>
          {titleText}
        </label>
        <div style={{ height: '40px', marginBottom: '0.5rem' }}>
          <SkeletonText heading width="100%" />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <SkeletonText width="60px" />
          <SkeletonText width="80px" />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <label className="cds--label" style={{ marginBottom: '0.5rem', display: 'block' }}>
        {titleText}
      </label>

      {/* Selected Tags Display */}
      {(selectedTags.length > 0 || pendingNewTags.length > 0) && (
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '0.5rem', 
          marginBottom: '0.5rem' 
        }}>
          {selectedTags.map(tag => (
            <CarbonTag
              key={tag.id}
              type="blue"
              filter
              onClose={() => handleRemoveTag(Number(tag.id))}
            >
              {tag.name}
            </CarbonTag>
          ))}
          {pendingNewTags.map(name => (
            <CarbonTag
              key={`new-${name}`}
              type="green"
              filter
              onClose={() => handleRemovePendingTag(name)}
              title="新標籤（儲存時建立）"
            >
              + {name}
            </CarbonTag>
          ))}
        </div>
      )}

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <TextInput
          ref={inputRef as any}
          id="tag-search"
          labelText=""
          placeholder={placeholder}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          style={{ paddingRight: '2.5rem' }}
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: 'absolute',
            right: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--cds-icon-primary)'
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <Layer>
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            maxHeight: '240px',
            overflowY: 'auto',
            backgroundColor: 'var(--cds-layer-02)',
            border: '1px solid var(--cds-border-subtle)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
            zIndex: 1000,
            marginTop: '4px'
          }}>
            {/* Create New Tag Option */}
            {canCreateNew && (
              <button
                type="button"
                onClick={handleCreateNew}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--cds-border-subtle)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--cds-link-primary)',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--cds-layer-hover-02)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Add size={16} />
                建立新標籤：「{searchText}」
              </button>
            )}

            {/* Existing Tags */}
            {filteredTags.length > 0 ? (
              filteredTags.map(tag => {
                const isSelected = selectedTagIds.includes(Number(tag.id));
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleTagToggle(Number(tag.id))}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSelected ? 'var(--cds-layer-selected-02)' : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--cds-text-primary)',
                      fontSize: '0.875rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--cds-layer-hover-02)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span>{tag.name}</span>
                    {isSelected && (
                      <span style={{ 
                        color: 'var(--cds-icon-primary)',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              !canCreateNew && (
                <div style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  color: 'var(--cds-text-secondary)',
                  fontSize: '0.875rem'
                }}>
                  {searchText ? '找不到符合的標籤' : '沒有可用的標籤'}
                </div>
              )
            )}
          </div>
        </Layer>
      )}

      {/* Helper Text */}
      {pendingNewTags.length > 0 && (
        <p style={{ 
          fontSize: '0.75rem', 
          color: 'var(--cds-text-helper)',
          marginTop: '0.5rem'
        }}>
          綠色標籤為新增標籤，將在儲存時建立
        </p>
      )}
    </div>
  );
};

export default TagSelect;
