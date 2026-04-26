import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

const PANEL_TRANSITION = {
  duration: 0.22,
  ease: [0.2, 0, 0.38, 0.9] as const,
};

const SHEET_SPRING = {
  type: "spring" as const,
  stiffness: 380,
  damping: 36,
  mass: 0.9,
};

interface PresenceProps {
  show: boolean;
  children: ReactNode;
}

export function WorkspacePanelPresence({ show, children }: PresenceProps) {
  return <AnimatePresence>{show ? children : null}</AnimatePresence>;
}

interface OverlayRootProps {
  children: ReactNode;
  className: string;
  ariaLabel: string;
  style?: CSSProperties;
}

export function WorkspaceOverlayRoot({ children, className, ariaLabel, style }: OverlayRootProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      style={style}
      initial={reduced ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? { opacity: 1 } : { opacity: 0 }}
      transition={PANEL_TRANSITION}
    >
      {children}
    </motion.div>
  );
}

interface SidePanelProps {
  children: ReactNode;
  className: string;
}

export function WorkspaceSlideInLeftPanel({ children, className }: SidePanelProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { x: 0 } : { x: "-100%" }}
      animate={{ x: 0 }}
      exit={reduced ? { x: 0 } : { x: "-100%" }}
      transition={PANEL_TRANSITION}
    >
      {children}
    </motion.div>
  );
}

export function WorkspaceSlideUpPanel({ children, className }: SidePanelProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? { y: 0 } : { y: "100%" }}
      animate={{ y: 0 }}
      exit={reduced ? { y: 0 } : { y: "100%" }}
      transition={reduced ? PANEL_TRANSITION : SHEET_SPRING}
    >
      {children}
    </motion.div>
  );
}

interface DraggableSheetProps {
  children: ReactNode;
  className: string;
  handleClassName: string;
  onClose: () => void;
}

/**
 * Mobile bottom-sheet：滑入動畫 + 拖曳 handle 下拉關閉。
 *
 * 為什麼把 handle 放進來：drag listener 必須只綁在 handle，否則 chat
 * 內部訊息滾動 / 輸入會跟 sheet drag 互打。useDragControls + dragListener
 * = false 讓只有 handle 的 pointerdown 能啟動拖曳。
 */
export function WorkspaceDraggableSheet({
  children,
  className,
  handleClassName,
  onClose,
}: DraggableSheetProps) {
  const reduced = useReducedMotion();
  const controls = useDragControls();
  return (
    <motion.div
      className={className}
      initial={reduced ? { y: 0 } : { y: "100%" }}
      animate={{ y: 0 }}
      exit={reduced ? { y: 0 } : { y: "100%" }}
      transition={reduced ? PANEL_TRANSITION : SHEET_SPRING}
      drag={reduced ? false : "y"}
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        if (info.offset.y > 120 || info.velocity.y > 600) {
          onClose();
        }
      }}
    >
      <div
        className={handleClassName}
        onPointerDown={(event) => {
          if (reduced) return;
          controls.start(event);
        }}
        role="button"
        aria-label="拖曳關閉"
        tabIndex={-1}
      />
      {children}
    </motion.div>
  );
}

interface BackdropProps {
  className: string;
  onClick: () => void;
  ariaLabel: string;
}

export function WorkspaceBackdrop({ className, onClick, ariaLabel }: BackdropProps) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      initial={reduced ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? { opacity: 1 } : { opacity: 0 }}
      transition={PANEL_TRANSITION}
    />
  );
}
