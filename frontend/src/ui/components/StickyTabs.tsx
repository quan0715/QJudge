import React, {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { Tabs, Tab, TabList } from "@carbon/react";
import "./StickyTabs.scss";

interface TabItem {
  label: string;
  key: string;
}

interface StickyTabsProps {
  items: TabItem[];
  selectedIndex: number;
  onChange: (index: number) => void;
  ariaLabel?: string;
  /** Max width for content alignment. undefined = 100% */
  maxWidth?: string;
  /**
   * Whether to apply sticky positioning.
   * Set to false when using ContentPage's stickyHeader prop (which handles sticky externally).
   * Default: true
   */
  sticky?: boolean;
  /** Top offset for sticky positioning (e.g., '3rem' for navbar height). Default: '3rem' */
  stickyTop?: string;
}

interface IndicatorStyle {
  left: number;
  width: number;
}

/**
 * Reusable tabs component with smooth sliding indicator animation.
 * Supports sticky positioning with configurable top offset.
 */
export const StickyTabs: React.FC<StickyTabsProps> = ({
  items,
  selectedIndex,
  onChange,
  ariaLabel = "Navigation tabs",
  maxWidth = "1056px",
  sticky = true,
  stickyTop = "3rem",
}) => {
  const tabListRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<IndicatorStyle>({
    left: 0,
    width: 0,
  });
  const [hasInitialized, setHasInitialized] = useState(false);

  // Calculate indicator position based on selected tab
  const updateIndicator = useCallback(() => {
    if (!tabListRef.current) return;

    const tabList = tabListRef.current.querySelector(".cds--tabs__nav");
    if (!tabList) return;

    const tabs = tabList.querySelectorAll(".cds--tabs__nav-item");
    const selectedTab = tabs[selectedIndex] as HTMLElement;

    if (selectedTab) {
      const tabListRect = tabList.getBoundingClientRect();
      const tabRect = selectedTab.getBoundingClientRect();

      setIndicatorStyle({
        left: tabRect.left - tabListRect.left,
        width: tabRect.width,
      });
    }
  }, [selectedIndex]);

  // Use layoutEffect for synchronous DOM measurement after render
  useLayoutEffect(() => {
    // Use requestAnimationFrame to ensure Carbon tabs have rendered
    const rafId = requestAnimationFrame(() => {
      updateIndicator();
      if (!hasInitialized) {
        // Small delay before enabling transitions
        setTimeout(() => setHasInitialized(true), 50);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [selectedIndex, items.length, updateIndicator, hasInitialized]);

  // Update indicator on window resize
  useEffect(() => {
    const handleResize = () => {
      requestAnimationFrame(updateIndicator);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateIndicator]);

  const containerClasses = [
    "sticky-tabs-container",
    sticky && "sticky-tabs-container--sticky",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={containerClasses}
      style={sticky ? { top: stickyTop } : undefined}
    >
      <div
        className="sticky-tabs-inner"
        style={{
          maxWidth: maxWidth,
          margin: maxWidth ? "0 auto" : undefined,
        }}
      >
        <div className="sticky-tabs-wrapper" ref={tabListRef}>
          <Tabs
            selectedIndex={selectedIndex}
            onChange={({ selectedIndex }: { selectedIndex: number }) =>
              onChange(selectedIndex)
            }
          >
            <TabList aria-label={ariaLabel}>
              {items.map((item) => (
                <Tab key={item.key}>{item.label}</Tab>
              ))}
            </TabList>
          </Tabs>
          {/* Sliding indicator */}
          <div
            className={`sticky-tabs-indicator${
              hasInitialized ? " sticky-tabs-indicator--animated" : ""
            }`}
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default StickyTabs;
