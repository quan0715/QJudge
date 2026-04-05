import React, { useState, useEffect, useRef, useMemo } from "react";
import { Modal } from "@carbon/react";
import "./SettingsModal.scss";

export interface SettingsModalNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  hidden?: boolean;
}

export interface SettingsModalProps {
  open: boolean;
  onRequestClose: () => void;
  modalHeading: string;
  navItems: SettingsModalNavItem[];
  initialActiveId?: string;
  renderPanel: (activeId: string) => React.ReactNode;
  renderMobileContent?: (activeId: string) => React.ReactNode;
  className?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onRequestClose,
  modalHeading,
  navItems,
  initialActiveId,
  renderPanel,
  renderMobileContent,
  className,
}) => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 672px)").matches;
  });
  const visibleItems = useMemo(
    () => navItems.filter((item) => !item.hidden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navItems.length, ...navItems.map((i) => `${i.id}:${i.hidden}`)],
  );

  const [activeId, setActiveId] = useState(
    () => initialActiveId ?? visibleItems[0]?.id ?? "",
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    // Only reset activeId when modal opens (open transitions false → true)
    if (open && !prevOpenRef.current) {
      const resolved =
        initialActiveId &&
        visibleItems.some((item) => item.id === initialActiveId)
          ? initialActiveId
          : visibleItems[0]?.id ?? "";
      setActiveId(resolved);
      contentRef.current?.scrollTo(0, 0);
    }
    prevOpenRef.current = open;
  }, [open, initialActiveId, visibleItems]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 672px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const handleNavClick = (id: string) => {
    setActiveId(id);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeLabel =
    visibleItems.find((i) => i.id === activeId)?.label ?? "";

  return (
    <Modal
      open
      onRequestClose={onRequestClose}
      modalHeading={modalHeading}
      passiveModal
      size="lg"
      className={`settings-modal${className ? ` ${className}` : ""}`}
      preventCloseOnClickOutside
      selectorsFloatingMenus={['.cds--modal']}
    >
      <div
        className="settings-modal__layout"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Sidebar navigation (desktop) */}
        <nav className="settings-modal__nav">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`settings-modal__nav-item ${activeId === item.id ? "settings-modal__nav-item--active" : ""}`}
                onClick={() => handleNavClick(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content — single panel mount (avoid duplicate ids / testids in DOM) */}
        <div className="settings-modal__content" ref={contentRef}>
          <h2 className="settings-modal__content-title">{activeLabel}</h2>
          <div className="settings-modal__body">
            {isMobile && renderMobileContent
              ? renderMobileContent(activeId)
              : renderPanel(activeId)}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
