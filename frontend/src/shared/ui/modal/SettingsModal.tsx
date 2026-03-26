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

        {/* Content */}
        <div className="settings-modal__content" ref={contentRef}>
          {/* Desktop: single active panel */}
          <div className="settings-modal__desktop-content">
            <h2 className="settings-modal__content-title">{activeLabel}</h2>
            {renderPanel(activeId)}
          </div>

          {/* Mobile: custom layout or fallback to renderPanel */}
          <div className="settings-modal__mobile-content">
            {renderMobileContent
              ? renderMobileContent(activeId)
              : renderPanel(activeId)}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
