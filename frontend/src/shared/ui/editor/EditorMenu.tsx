import React from "react";
import "./EditorMenu.scss";

export interface EditorMenuItem {
  /** Unique key for the menu item */
  key: string;
  /** Display label */
  label: string;
  /** Optional icon (emoji or ReactNode) */
  icon?: React.ReactNode;
  /** Nested children (e.g., problems under "Lab Problems") */
  children?: EditorMenuItem[];
}

interface EditorMenuProps {
  /** Menu title shown in header */
  title: string;
  /** Menu items to display */
  items: EditorMenuItem[];
  /** Currently selected item key */
  selectedKey: string | null;
  /** Callback when item is selected */
  onSelect: (key: string) => void;
}

/**
 * Reusable side menu for editor layouts.
 * Supports nested items (e.g., problems list under a section).
 */
export const EditorMenu: React.FC<EditorMenuProps> = ({
  title,
  items,
  selectedKey,
  onSelect,
}) => {
  const isDescendantActive = (item: EditorMenuItem): boolean => {
    if (item.key === selectedKey) return true;
    if (item.children) {
      return item.children.some((child) => isDescendantActive(child));
    }
    return false;
  };

  const renderMenuItem = (item: EditorMenuItem, isChild = false) => {
    const isActive = selectedKey === item.key;
    const hasChildren = item.children && item.children.length > 0;
    // Recursive check for expansion: expand if this item is active OR any of its descendants are active
    const isExpanded = hasChildren && isDescendantActive(item);

    return (
      <React.Fragment key={item.key}>
        <button
          type="button"
          className={`editor-menu__item ${isActive ? "editor-menu__item--active" : ""} ${isChild ? "editor-menu__item--child" : ""}`}
          onClick={() => onSelect(item.key)}
        >
          {item.icon && <span className="editor-menu__icon">{item.icon}</span>}
          <span className="editor-menu__label">{item.label}</span>
        </button>

        {/* Render nested children if this item should be expanded */}
        {isExpanded && (
          <div className="editor-menu__children">
            {item.children!.map((child) => renderMenuItem(child, true))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div className="editor-menu">
      <div className="editor-menu__header">
        <span>{title}</span>
      </div>
      <nav className="editor-menu__nav">
        {items.map((item) => renderMenuItem(item))}
      </nav>
    </div>
  );
};

export default EditorMenu;
