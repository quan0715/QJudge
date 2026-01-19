import React from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, SkeletonText } from '@carbon/react';
import type { Difficulty, Tag as TagEntity } from '@/core/entities/problem.entity';
import { DIFFICULTY_CONFIG } from '@/core/config/difficulty.config';
import './ProblemFilterSidebarSection.scss';

export interface ProblemFilters {
  search: string;
  difficulties: Difficulty[];
  tagSlugs: string[];
  status: ('solved' | 'unsolved')[];
}

export interface ProblemFilterSidebarSectionProps {
  filters: ProblemFilters;
  onFiltersChange: (filters: ProblemFilters) => void;
  availableTags: TagEntity[];
  tagsLoading?: boolean;
}

const FilterSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="problem-filter__section">
    <h6 className="problem-filter__section-title">{title}</h6>
    <div className="problem-filter__section-body">{children}</div>
  </div>
);

export const ProblemFilterSidebarSection: React.FC<ProblemFilterSidebarSectionProps> = ({
  filters,
  onFiltersChange,
  availableTags,
  tagsLoading = false,
}) => {
  const { t } = useTranslation('problem');

  const handleStatusToggle = (status: 'solved' | 'unsolved') => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: newStatus });
  };

  const handleDifficultyToggle = (difficulty: Difficulty) => {
    const newDifficulties = filters.difficulties.includes(difficulty)
      ? filters.difficulties.filter((d) => d !== difficulty)
      : [...filters.difficulties, difficulty];
    onFiltersChange({ ...filters, difficulties: newDifficulties });
  };

  const handleTagToggle = (slug: string) => {
    const newTagSlugs = filters.tagSlugs.includes(slug)
      ? filters.tagSlugs.filter((s) => s !== slug)
      : [...filters.tagSlugs, slug];
    onFiltersChange({ ...filters, tagSlugs: newTagSlugs });
  };

  return (
    <div className="problem-filter-sidebar">
      <FilterSection title={t('filter.status', '狀態')}>
        <Checkbox
          id="status-solved"
          labelText={t('filter.solved', '已解決')}
          checked={filters.status.includes('solved')}
          onChange={() => handleStatusToggle('solved')}
        />
        <Checkbox
          id="status-unsolved"
          labelText={t('filter.unsolved', '未解決')}
          checked={filters.status.includes('unsolved')}
          onChange={() => handleStatusToggle('unsolved')}
        />
      </FilterSection>

      <FilterSection title={t('filter.difficulty', '難度')}>
        {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((difficulty) => (
          <Checkbox
            key={difficulty}
            id={`difficulty-${difficulty}`}
            labelText={DIFFICULTY_CONFIG[difficulty].label}
            checked={filters.difficulties.includes(difficulty)}
            onChange={() => handleDifficultyToggle(difficulty)}
          />
        ))}
      </FilterSection>

      <FilterSection title={t('filter.tags', '標籤')}>
        {tagsLoading ? (
          <>
            <SkeletonText width="80%" />
            <SkeletonText width="70%" />
            <SkeletonText width="90%" />
            <SkeletonText width="60%" />
          </>
        ) : availableTags.length > 0 ? (
          availableTags.map((tag) => (
            <Checkbox
              key={tag.id}
              id={`tag-${tag.slug}`}
              labelText={tag.name}
              checked={filters.tagSlugs.includes(tag.slug)}
              onChange={() => handleTagToggle(tag.slug)}
            />
          ))
        ) : (
          <p className="problem-filter__empty">
            {t('filter.noTags', '沒有可用標籤')}
          </p>
        )}
      </FilterSection>
    </div>
  );
};

export default ProblemFilterSidebarSection;
