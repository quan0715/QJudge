import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Modal } from "@carbon/react";
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

interface SettingsModalContentProps
  extends Omit<SettingsModalProps, "open" | "navItems"> {
  visibleItems: SettingsModalNavItem[];
}

const MOBILE_MEDIA_QUERY = "(max-width: 672px)";

const subscribeToMobileViewport = (onChange: () => void) => {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
};

const getMobileViewportSnapshot = () =>
  window.matchMedia(MOBILE_MEDIA_QUERY).matches;

const SettingsModalContent: React.FC<SettingsModalContentProps> = ({
  onRequestClose,
  modalHeading,
  visibleItems,
  initialActiveId,
  renderPanel,
  renderMobileContent,
  className,
}) => {
  const initialId =
    initialActiveId && visibleItems.some((item) => item.id === initialActiveId)
      ? initialActiveId
      : visibleItems[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initialId);
  const activeId = visibleItems.some((item) => item.id === selectedId)
    ? selectedId
    : initialId;
  const isMobile = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    () => false,
  );
  const contentRef = useRef<HTMLDivElement>(null);

  const handleNavClick = (id: string) => {
    setSelectedId(id);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeLabel =
    visibleItems.find((item) => item.id === activeId)?.label ?? "";

  return (
    <Modal
      open
      onRequestClose={onRequestClose}
      modalHeading={modalHeading}
      passiveModal
      size="lg"
      isFullWidth
      className={`settings-modal${className ? ` ${className}` : ""}`}
      preventCloseOnClickOutside
      selectorsFloatingMenus={[".settings-modal"]}
    >
      <div
        className="settings-modal__layout"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <nav className="settings-modal__nav">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                type="button"
                kind={activeId === item.id ? "secondary" : "ghost"}
                size="md"
                renderIcon={Icon}
                className="settings-modal__nav-item"
                onClick={() => handleNavClick(item.id)}
              >
                {item.label}
              </Button>
            );
          })}
        </nav>

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
    [navItems],
  );

  if (!open) return null;

  return (
    <SettingsModalContent
      onRequestClose={onRequestClose}
      modalHeading={modalHeading}
      visibleItems={visibleItems}
      initialActiveId={initialActiveId}
      renderPanel={renderPanel}
      renderMobileContent={renderMobileContent}
      className={className}
    />
  );
};

export default SettingsModal;
