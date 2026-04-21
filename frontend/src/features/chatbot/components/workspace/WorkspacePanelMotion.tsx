import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const PANEL_TRANSITION = {
  duration: 0.22,
  ease: [0.2, 0, 0.38, 0.9] as const,
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
}

export function WorkspaceOverlayRoot({ children, className, ariaLabel }: OverlayRootProps) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
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
      transition={PANEL_TRANSITION}
    >
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
