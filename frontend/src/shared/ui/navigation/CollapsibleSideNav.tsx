import React, { type ReactNode } from "react";
import { Button, Tooltip } from "@carbon/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  type CarbonIconType,
} from "@carbon/icons-react";
import cx from "classnames";
import "./CollapsibleSideNav.scss";

// ============================================================================
// Types
// ============================================================================

export interface SideNavItem {
  /** Unique key for the item */
  key: string;
  /** Display label */
  label: string;
  /** Carbon icon component */
  icon: CarbonIconType;
}

/** Base props shared by all variants */
interface CollapsibleSideNavBaseProps {
  /** Navigation items */
  items: SideNavItem[];
  /** Currently active item key */
  activeKey: string;
  /** Callback when an item is selected */
  onSelect: (key: string) => void;
  /**
   * Whether the panel is collapsed.
   * When collapsed, only the nav icons are visible; content is hidden.
   */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onToggleCollapse?: () => void;
  /**
   * Whether to show text labels alongside icons.
   * - false (default): Icon only
   * - true: Icon + text label
   * Tooltip is always shown on hover regardless of this setting.
   */
  showLabels?: boolean;
  /**
   * Alignment of nav items (icons)
   * - "start": Beginning of the nav bar (top for vertical, left for horizontal)
   * - "center": Center of the nav bar
   * - "end": End of the nav bar (bottom for vertical, right for horizontal)
   */
  itemsAlign?: "start" | "center" | "end";
  /** Content to display next to the navigation (hidden when collapsed) */
  children?: ReactNode;
  /** Custom className */
  className?: string;
  /** Aria label for the navigation */
  ariaLabel?: string;
}

/** Vertical orientation - nav on left or right */
interface CollapsibleSideNavVerticalProps extends CollapsibleSideNavBaseProps {
  orientation?: "vertical";
  /** Expand direction for vertical: "left" (default) or "right" */
  expandDirection?: "left" | "right";
}

/** Horizontal orientation - nav on top or bottom */
interface CollapsibleSideNavHorizontalProps
  extends CollapsibleSideNavBaseProps {
  orientation: "horizontal";
  /** Expand direction for horizontal: "top" (default) or "bottom" */
  expandDirection?: "top" | "bottom";
}

/** Combined props type with discriminated union */
export type CollapsibleSideNavProps =
  | CollapsibleSideNavVerticalProps
  | CollapsibleSideNavHorizontalProps;

// ============================================================================
// Component
// ============================================================================

/**
 * CollapsibleSideNav - A collapsible panel with side navigation
 *
 * Features:
 * - Collapsed mode: Shows only nav icons, content is hidden
 * - Expanded mode: Shows nav icons + content panel
 * - Supports left/right positioning
 * - Toggle button at the bottom of nav
 * - Tooltip on icons (always, since nav is always icon-only)
 * - Follows Carbon Design System patterns
 */
export const CollapsibleSideNav: React.FC<CollapsibleSideNavProps> = ({
  items,
  activeKey,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  orientation = "vertical",
  expandDirection,
  showLabels = false,
  itemsAlign = "start",
  children,
  className,
  ariaLabel = "Side navigation",
}) => {
  // Derive default expandDirection based on orientation
  const effectiveDirection =
    expandDirection ?? (orientation === "vertical" ? "left" : "top");

  const isVertical = orientation === "vertical";
  const isHorizontal = orientation === "horizontal";

  // Determine toggle icon based on orientation, direction, and collapsed state
  const getToggleIcon = () => {
    if (isVertical) {
      if (effectiveDirection === "left") {
        return collapsed ? ChevronRight : ChevronLeft;
      }
      return collapsed ? ChevronLeft : ChevronRight;
    }
    // Horizontal - use Up/Down icons
    if (effectiveDirection === "top") {
      return collapsed ? ChevronDown : ChevronUp;
    }
    return collapsed ? ChevronUp : ChevronDown;
  };

  // Tooltip alignment based on orientation and direction
  const getTooltipAlign = (): "top" | "bottom" | "left" | "right" => {
    if (isVertical) {
      return effectiveDirection === "left" ? "right" : "left";
    }
    return effectiveDirection === "top" ? "bottom" : "top";
  };

  const tooltipAlign = getTooltipAlign();

  const ToggleIcon = getToggleIcon();

  // Container classes
  const containerClasses = cx(
    "collapsible-side-nav",
    {
      "collapsible-side-nav--collapsed": collapsed,
      "collapsible-side-nav--expanded": !collapsed,
      "collapsible-side-nav--vertical": isVertical,
      "collapsible-side-nav--horizontal": isHorizontal,
      "collapsible-side-nav--left": effectiveDirection === "left",
      "collapsible-side-nav--right": effectiveDirection === "right",
      "collapsible-side-nav--top": effectiveDirection === "top",
      "collapsible-side-nav--bottom": effectiveDirection === "bottom",
      "collapsible-side-nav--with-labels": showLabels,
      [`collapsible-side-nav--items-${itemsAlign}`]: true,
    },
    className
  );

  // Render a single nav item
  const renderNavItem = (item: SideNavItem) => {
    const isActive = item.key === activeKey;
    const Icon = item.icon;

    const itemContent = (
      <button
        type="button"
        className={cx("collapsible-side-nav__item", {
          "collapsible-side-nav__item--active": isActive,
        })}
        onClick={() => onSelect(item.key)}
        aria-current={isActive ? "page" : undefined}
      >
        <span className="collapsible-side-nav__item-icon">
          <Icon size={20} />
        </span>
        {showLabels && (
          <span className="collapsible-side-nav__item-label">{item.label}</span>
        )}
      </button>
    );

    // Always wrap with tooltip for accessibility
    return (
      <Tooltip key={item.key} label={item.label} align={tooltipAlign}>
        {itemContent}
      </Tooltip>
    );
  };

  return (
    <div className={containerClasses}>
      {/* Navigation Bar */}
      <nav className="collapsible-side-nav__nav" aria-label={ariaLabel}>
        {/* Nav Items */}
        <div className="collapsible-side-nav__items">
          {items.map(renderNavItem)}
        </div>

        {/* Toggle Button */}
        {onToggleCollapse && (
          <div className="collapsible-side-nav__toggle-wrapper">
            <Tooltip label={collapsed ? "展開" : "收合"} align={tooltipAlign}>
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ToggleIcon}
                iconDescription={collapsed ? "展開面板" : "收合面板"}
                onClick={onToggleCollapse}
                className="collapsible-side-nav__toggle"
              />
            </Tooltip>
          </div>
        )}
      </nav>

      {/* Content Panel - hidden when collapsed */}
      {children && (
        <div className="collapsible-side-nav__content">{children}</div>
      )}
    </div>
  );
};

export default CollapsibleSideNav;
