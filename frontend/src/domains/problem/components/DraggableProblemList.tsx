import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tag } from '@carbon/react';
import { TrashCan, DragVertical } from '@carbon/icons-react';
import { DifficultyBadge } from '@/ui/components/badges/DifficultyBadge';
import type { ContestProblemSummary } from '@/core/entities/contest.entity';

interface DraggableProblemListProps {
  problems: ContestProblemSummary[];
  onReorder: (newOrder: ContestProblemSummary[]) => void;
  onRemove?: (problemId: string) => void;
  onRowClick?: (problem: ContestProblemSummary) => void;
}

interface SortableProblemRowProps {
  problem: ContestProblemSummary;
  onRemove?: (problemId: string) => void;
  onClick?: () => void;
}

const SortableProblemRow: React.FC<SortableProblemRowProps> = ({ 
  problem, 
  onRemove,
  onClick 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: problem.id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="draggable-problem-row"
    >
      <div 
        className="drag-handle" 
        {...attributes} 
        {...listeners}
      >
        <DragVertical size={20} />
      </div>
      
      <div className="problem-label">
        <Tag type="cyan">{problem.label || '-'}</Tag>
      </div>
      
      <div 
        className="problem-title" 
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        {problem.title}
      </div>
      
      <div className="problem-difficulty">
        <DifficultyBadge difficulty={problem.difficulty || 'medium'} />
      </div>
      
      <div className="problem-score">
        {problem.score || 0} pts
      </div>
      
      {onRemove && (
        <div className="problem-actions">
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={TrashCan}
            iconDescription="移除題目"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(problem.id.toString());
            }}
            style={{ color: 'var(--cds-support-error)' }}
          />
        </div>
      )}
    </div>
  );
};

const DraggableProblemList: React.FC<DraggableProblemListProps> = ({
  problems,
  onReorder,
  onRemove,
  onRowClick,
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = problems.findIndex((p) => p.id.toString() === active.id);
      const newIndex = problems.findIndex((p) => p.id.toString() === over.id);
      
      const newOrder = arrayMove(problems, oldIndex, newIndex);
      onReorder(newOrder);
    }
  };

  return (
    <div className="draggable-problem-list">
      <style>{`
        .draggable-problem-list {
          width: 100%;
        }
        .draggable-problem-header {
          display: grid;
          grid-template-columns: 40px 80px 1fr 100px 80px 60px;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background-color: var(--cds-layer-accent);
          border-bottom: 1px solid var(--cds-border-subtle);
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--cds-text-secondary);
        }
        .draggable-problem-row {
          display: grid;
          grid-template-columns: 40px 80px 1fr 100px 80px 60px;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          align-items: center;
          border-bottom: 1px solid var(--cds-border-subtle);
          background-color: var(--cds-layer);
          transition: background-color 0.15s ease;
        }
        .draggable-problem-row:hover {
          background-color: var(--cds-layer-hover);
        }
        .drag-handle {
          cursor: grab;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--cds-icon-secondary);
          padding: 0.25rem;
          border-radius: 4px;
        }
        .drag-handle:hover {
          background-color: var(--cds-layer-hover);
          color: var(--cds-icon-primary);
        }
        .drag-handle:active {
          cursor: grabbing;
        }
        .problem-label {
          display: flex;
          align-items: center;
        }
        .problem-title {
          font-weight: 500;
          color: var(--cds-text-primary);
        }
        .problem-title:hover {
          color: var(--cds-link-primary);
        }
        .problem-difficulty {
          display: flex;
          align-items: center;
        }
        .problem-score {
          font-weight: 500;
          color: var(--cds-text-secondary);
        }
        .problem-actions {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
      
      <div className="draggable-problem-header">
        <div></div>
        <div>標號</div>
        <div>標題</div>
        <div>難度</div>
        <div>分數</div>
        <div></div>
      </div>
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={problems.map(p => p.id.toString())}
          strategy={verticalListSortingStrategy}
        >
          {problems.map((problem) => (
            <SortableProblemRow
              key={problem.id}
              problem={problem}
              onRemove={onRemove}
              onClick={onRowClick ? () => onRowClick(problem) : undefined}
            />
          ))}
        </SortableContext>
      </DndContext>
      
      {problems.length === 0 && (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          color: 'var(--cds-text-secondary)' 
        }}>
          尚無題目，請新增題目
        </div>
      )}
    </div>
  );
};

export default DraggableProblemList;
