import React, { useState } from "react";
import {
  DocumentBlank,
  RecentlyViewed,
  Chat,
  Analytics,
  Home,
  Settings,
  User,
  Folder,
} from "@carbon/icons-react";
import {
  CollapsibleSideNav,
  type CollapsibleSideNavProps,
  type SideNavItem,
} from "./CollapsibleSideNav";
import type { StoryModule } from "@/shared/types/story.types";

// ============================================================================
// Mock Data
// ============================================================================

const defaultItems: SideNavItem[] = [
  { key: "description", label: "題目", icon: DocumentBlank },
  { key: "submissions", label: "繳交記錄", icon: RecentlyViewed },
  { key: "discussions", label: "討論", icon: Chat },
  { key: "stats", label: "數據", icon: Analytics },
];

const extendedItems: SideNavItem[] = [
  { key: "home", label: "首頁", icon: Home },
  { key: "files", label: "檔案", icon: Folder },
  { key: "profile", label: "個人資料", icon: User },
  { key: "settings", label: "設定", icon: Settings },
];

// ============================================================================
// Content Component
// ============================================================================

const ContentPanel: React.FC<{ activeKey: string; items: SideNavItem[] }> = ({
  activeKey,
  items,
}) => {
  const activeItem = items.find((item) => item.key === activeKey);
  return (
    <div
      style={{
        height: "100%",
        padding: "1.5rem",
        backgroundColor: "var(--cds-layer-02)",
        overflow: "auto",
      }}
    >
      <h3 style={{ margin: "0 0 1rem 0", color: "var(--cds-text-primary)" }}>
        {activeItem?.label}
      </h3>
      <p style={{ color: "var(--cds-text-secondary)", lineHeight: 1.6 }}>
        這是「{activeItem?.label}」的內容區域。
        <br />
        <br />
        收合時只顯示左側 icon 導航條。
      </p>
    </div>
  );
};

// ============================================================================
// Story Wrapper
// ============================================================================

type StoryProps =
  | {
      orientation?: "vertical";
      expandDirection?: "left" | "right";
      showLabels?: boolean;
      itemsAlign?: "start" | "center" | "end";
      initialCollapsed?: boolean;
      height?: string;
    }
  | {
      orientation: "horizontal";
      expandDirection?: "top" | "bottom";
      showLabels?: boolean;
      itemsAlign?: "start" | "center" | "end";
      initialCollapsed?: boolean;
      height?: string;
    };

const StoryWrapper: React.FC<StoryProps> = ({
  orientation = "vertical",
  expandDirection,
  showLabels = false,
  itemsAlign = "start",
  initialCollapsed = false,
  height = "400px",
}) => {
  const [activeKey, setActiveKey] = useState("description");
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const verticalDirection =
    expandDirection === "left" || expandDirection === "right"
      ? expandDirection
      : undefined;
  const horizontalDirection =
    expandDirection === "top" || expandDirection === "bottom"
      ? expandDirection
      : undefined;

  return (
    <div
      style={{
        height,
        border: "1px solid var(--cds-border-subtle)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {orientation === "horizontal" ? (
        <CollapsibleSideNav
          items={defaultItems}
          activeKey={activeKey}
          onSelect={setActiveKey}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          orientation="horizontal"
          expandDirection={horizontalDirection}
          showLabels={showLabels}
          itemsAlign={itemsAlign}
        >
          <ContentPanel activeKey={activeKey} items={defaultItems} />
        </CollapsibleSideNav>
      ) : (
        <CollapsibleSideNav
          items={defaultItems}
          activeKey={activeKey}
          onSelect={setActiveKey}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          expandDirection={verticalDirection}
          showLabels={showLabels}
          itemsAlign={itemsAlign}
        >
          <ContentPanel activeKey={activeKey} items={defaultItems} />
        </CollapsibleSideNav>
      )}
    </div>
  );
};

// ============================================================================
// Playground Component (fully controlled by args)
// ============================================================================

const PlaygroundStory: React.FC<Partial<CollapsibleSideNavProps>> = (args) => {
  const [activeKey, setActiveKey] = useState("description");
  const [collapsed, setCollapsed] = useState(args.collapsed ?? false);
  const isHorizontal = args.orientation === "horizontal";

  // Sync collapsed state when args change
  React.useEffect(() => {
    setCollapsed(args.collapsed ?? false);
  }, [args.collapsed]);

  return (
    <div
      style={{
        height: "400px",
        border: "1px solid var(--cds-border-subtle)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {isHorizontal ? (
        <CollapsibleSideNav
          items={defaultItems}
          activeKey={activeKey}
          onSelect={setActiveKey}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          orientation="horizontal"
          expandDirection={
            args.expandDirection === "top" || args.expandDirection === "bottom"
              ? args.expandDirection
              : undefined
          }
          showLabels={args.showLabels}
          itemsAlign={args.itemsAlign}
        >
          <ContentPanel activeKey={activeKey} items={defaultItems} />
        </CollapsibleSideNav>
      ) : (
        <CollapsibleSideNav
          items={defaultItems}
          activeKey={activeKey}
          onSelect={setActiveKey}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          expandDirection={
            args.expandDirection === "left" || args.expandDirection === "right"
              ? args.expandDirection
              : undefined
          }
          showLabels={args.showLabels}
          itemsAlign={args.itemsAlign}
        >
          <ContentPanel activeKey={activeKey} items={defaultItems} />
        </CollapsibleSideNav>
      )}
    </div>
  );
};

// ============================================================================
// Story Module
// ============================================================================

const CollapsibleSideNavStories: StoryModule<CollapsibleSideNavProps> = {
  meta: {
    title: "shared/ui/navigation/CollapsibleSideNav",
    component: CollapsibleSideNav,
    category: "shared",
    description:
      "可收合的導航面板。支援垂直/水平方向，以及 icon 對齊位置。收合時僅顯示 icon 導航條，展開時顯示導航條 + 內容區域。",
    defaultArgs: {
      items: defaultItems,
      activeKey: "description",
      collapsed: false,
      orientation: "vertical",
      expandDirection: "left",
      showLabels: false,
      itemsAlign: "start",
    },
    argTypes: {
      collapsed: {
        control: "boolean" as const,
        label: "收合",
        description: "是否收合面板",
      },
      orientation: {
        control: "select" as const,
        label: "方向",
        description: "導航條方向",
        options: ["vertical", "horizontal"],
      },
      expandDirection: {
        control: "select" as const,
        label: "展開方向",
        description:
          "導航條位置（vertical: left/right, horizontal: top/bottom）",
        options: ["left", "right", "top", "bottom"],
      },
      showLabels: {
        control: "boolean" as const,
        label: "顯示文字",
        description: "是否在 icon 旁顯示文字標籤",
      },
      itemsAlign: {
        control: "select" as const,
        label: "Items 對齊",
        description: "導航項目的對齊位置",
        options: ["start", "center", "end"],
      },
    },
  },
  stories: [
    // ========================================
    // Vertical Orientation
    // ========================================
    {
      name: "Vertical - Left (Default)",
      description: "垂直方向，導航在左側",
      render: () => <StoryWrapper />,
    },
    {
      name: "Vertical - Right",
      description: "垂直方向，導航在右側",
      render: () => <StoryWrapper expandDirection="right" />,
    },
    {
      name: "Vertical - Collapsed",
      description: "垂直方向，收合狀態",
      render: () => <StoryWrapper initialCollapsed />,
    },

    // ========================================
    // Horizontal Orientation
    // ========================================
    {
      name: "Horizontal - Top",
      description: "水平方向，導航在頂部",
      render: () => (
        <StoryWrapper orientation="horizontal" expandDirection="top" />
      ),
    },
    {
      name: "Horizontal - Bottom",
      description: "水平方向，導航在底部",
      render: () => (
        <StoryWrapper
          orientation="horizontal"
          expandDirection="bottom"
          height="300px"
        />
      ),
    },
    {
      name: "Horizontal - Collapsed",
      description: "水平方向，收合狀態",
      render: () => (
        <StoryWrapper orientation="horizontal" initialCollapsed height="300px" />
      ),
    },

    // ========================================
    // Show Labels
    // ========================================
    {
      name: "With Labels",
      description: "顯示 icon + 文字標籤",
      render: () => <StoryWrapper showLabels />,
    },
    {
      name: "With Labels - Horizontal",
      description: "水平方向 + 文字標籤",
      render: () => (
        <StoryWrapper
          orientation="horizontal"
          expandDirection="top"
          showLabels
          height="300px"
        />
      ),
    },

    // ========================================
    // Items Alignment
    // ========================================
    {
      name: "Items - Start (Default)",
      description: "Items 對齊到開頭（垂直=頂部）",
      render: () => <StoryWrapper itemsAlign="start" />,
    },
    {
      name: "Items - Center",
      description: "Icons 置中對齊",
      render: () => <StoryWrapper itemsAlign="center" />,
    },
    {
      name: "Items - End",
      description: "Icons 對齊到尾端（垂直=底部）",
      render: () => <StoryWrapper itemsAlign="end" />,
    },
    {
      name: "Horizontal + Items Center",
      description: "水平方向 + Icons 置中",
      render: () => (
        <StoryWrapper
          orientation="horizontal"
          expandDirection="top"
          itemsAlign="center"
          height="300px"
        />
      ),
    },

    // ========================================
    // Extended Items
    // ========================================
    {
      name: "Extended Items",
      description: "使用不同的導航項目",
      render: () => {
        const ExtendedStory = () => {
          const [activeKey, setActiveKey] = useState("home");
          const [collapsed, setCollapsed] = useState(false);

          return (
            <div
              style={{
                height: "400px",
                border: "1px solid var(--cds-border-subtle)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <CollapsibleSideNav
                items={extendedItems}
                activeKey={activeKey}
                onSelect={setActiveKey}
                collapsed={collapsed}
                onToggleCollapse={() => setCollapsed(!collapsed)}
              >
                <ContentPanel activeKey={activeKey} items={extendedItems} />
              </CollapsibleSideNav>
            </div>
          );
        };
        return <ExtendedStory />;
      },
    },

    {
      name: "Without Toggle",
      description: "不提供收合功能",
      render: () => {
        const NoToggleStory = () => {
          const [activeKey, setActiveKey] = useState("description");

          return (
            <div
              style={{
                height: "300px",
                border: "1px solid var(--cds-border-subtle)",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <CollapsibleSideNav
                items={defaultItems}
                activeKey={activeKey}
                onSelect={setActiveKey}
              >
                <ContentPanel activeKey={activeKey} items={defaultItems} />
              </CollapsibleSideNav>
            </div>
          );
        };
        return <NoToggleStory />;
      },
    },

    // ========================================
    // Playground
    // ========================================
    {
      name: "Playground",
      description: "使用 Controls 面板調整所有參數",
      render: (args) => <PlaygroundStory {...args} />,
    },
  ],
};

export default CollapsibleSideNavStories;
