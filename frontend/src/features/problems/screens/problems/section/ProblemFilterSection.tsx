import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@carbon/react';
import type { Tag } from '@/core/entities/problem.entity';
import { ProblemFilterSidebarSection, type ProblemFilters } from './ProblemFilterSidebarSection';

export interface ProblemFilterSectionProps {
  open: boolean;
  onClose: () => void;
  filters: ProblemFilters;
  onFiltersChange: (filters: ProblemFilters) => void;
  onApply: () => void;
  availableTags: Tag[];
  tagsLoading?: boolean;
}

export const ProblemFilterSection: React.FC<ProblemFilterSectionProps> = ({
  open,
  onClose,
  filters,
  onFiltersChange,
  onApply,
  availableTags,
  tagsLoading = false,
}) => {
  const { t: tc } = useTranslation('common');

  const handleApply = () => {
    onApply();
    onClose();
  };

  return (
    <ComposedModal
      open={open}
      onClose={onClose}
      size="sm"
      className="problem-filter-drawer"
    >
      <ModalHeader title={tc('filter.title', '篩選')} closeModal={onClose} />
      <ModalBody style={{ padding: 0 }}>
        <ProblemFilterSidebarSection
          filters={filters}
          onFiltersChange={onFiltersChange}
          availableTags={availableTags}
          tagsLoading={tagsLoading}
        />
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onClose}>
          {tc('actions.cancel', '取消')}
        </Button>
        <Button kind="primary" onClick={handleApply}>
          {tc('filter.apply', '套用')}
        </Button>
      </ModalFooter>
    </ComposedModal>
  );
};

export default ProblemFilterSection;
