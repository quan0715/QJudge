import React, { useCallback, useRef, useEffect, type ReactNode } from "react";
import { Reorder, useDragControls } from "motion/react";
import { attachReorderPointerSession } from "./reorderPointerSession";
import styles from "./CardListEditor.module.scss";

// ─── InsertDropSlot ─────────────────────────────────────────

const InsertDropSlot: React.FC<{
  index: number;
  active: boolean;
  canDrop: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
}> = ({ index, active, canDrop, onDragOver, onDragLeave, onDrop }) => {
  if (!canDrop) {
    return <div className={styles.dropSlotIdle} data-testid={`contest-card-drop-slot-${index}`} />;
  }
  return (
    <div
      className={`${styles.dropSlot} ${active ? styles.dropSlotActive : ""}`}
      data-testid={`contest-card-drop-slot-${index}`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
    />
  );
};

// ─── CardReorderItem ────────────────────────────────────────

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

function CardReorderItem<T>({
  item,
  frozen,
  children,
  cardRefCallback,
  onReorderPointerSessionChange,
}: {
  item: T;
  frozen: boolean;
  children: (dragHandleProps: DragHandleProps | null) => ReactNode;
  cardRefCallback?: (el: HTMLDivElement | null) => void;
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
}) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      drag={!frozen}
      as="div"
      className={styles.cardItem}
    >
      <div ref={cardRefCallback}>
        {children(
          !frozen
            ? {
                onPointerDown: (e) =>
                  attachReorderPointerSession(
                    onReorderPointerSessionChange,
                    (ev) => dragControls.start(ev),
                    e,
                  ),
              }
            : null,
        )}
      </div>
    </Reorder.Item>
  );
}

// ─── CardListEditor ─────────────────────────────────────────

export interface CardListEditorProps<T extends { id: string }> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderCard: (
    item: T,
    index: number,
    dragHandleProps: DragHandleProps | null,
  ) => ReactNode;
  frozen?: boolean;
  canDrop?: boolean;
  hoverIndex?: number | null;
  onHoverIndexChange?: (index: number | null) => void;
  onDropAt?: (index: number) => void;
  scrollToId?: string | null;
  emptyState?: ReactNode;
  /** Notified when a list-item reorder drag starts (+1) or ends (-1). Nested drags sum depth. */
  onReorderPointerSessionChange?: (delta: 1 | -1) => void;
  /** Each card's inner wrapper root (for scroll-into-view / measuring without duplicating refs in renderCard). */
  onCardRoot?: (id: string, el: HTMLDivElement | null) => void;
}

export function CardListEditor<T extends { id: string }>({
  items,
  onReorder,
  renderCard,
  frozen = false,
  canDrop = false,
  hoverIndex = null,
  onHoverIndexChange,
  onDropAt,
  scrollToId,
  emptyState,
  onReorderPointerSessionChange,
  onCardRoot,
}: CardListEditorProps<T>) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!scrollToId) return;
    const el = cardRefs.current.get(scrollToId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [scrollToId]);

  const handleDrop = useCallback(
    (index: number) => {
      onHoverIndexChange?.(null);
      onDropAt?.(index);
    },
    [onDropAt, onHoverIndexChange],
  );

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={onReorder}
      as="div"
      className={styles.reorderGroup}
    >
      {items.map((item, i) => (
        <React.Fragment key={item.id}>
          <InsertDropSlot
            index={i}
            active={hoverIndex === i}
            canDrop={canDrop}
            onDragOver={() => onHoverIndexChange?.(i)}
            onDragLeave={() => {
              if (hoverIndex === i) onHoverIndexChange?.(null);
            }}
            onDrop={() => handleDrop(i)}
          />
          <CardReorderItem
            item={item}
            frozen={frozen}
            onReorderPointerSessionChange={onReorderPointerSessionChange}
            cardRefCallback={(el) => {
              if (el) cardRefs.current.set(item.id, el);
              else cardRefs.current.delete(item.id);
              onCardRoot?.(item.id, el);
            }}
          >
            {(dragHandleProps) => renderCard(item, i, dragHandleProps)}
          </CardReorderItem>
        </React.Fragment>
      ))}
      <InsertDropSlot
        index={items.length}
        active={hoverIndex === items.length}
        canDrop={canDrop}
        onDragOver={() => onHoverIndexChange?.(items.length)}
        onDragLeave={() => {
          if (hoverIndex === items.length) onHoverIndexChange?.(null);
        }}
        onDrop={() => handleDrop(items.length)}
      />
    </Reorder.Group>
  );
}

export default CardListEditor;
