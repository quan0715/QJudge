import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { IconButton, SkeletonText } from "@carbon/react";
import { ArrowLeft, Launch, Development } from "@carbon/icons-react";
import StorySidebar from "../components/StorySidebar";
import StoryCanvas from "../components/StoryCanvas";
import StoryControls from "../components/StoryControls";
import {
  getComponentsByCategory,
  getStoryModule,
  getAllComponents,
} from "../registry";
import type { CategoryGroup, ArgType } from "@/shared/types/story.types";
import styles from "./StorybookScreen.module.scss";

const StorybookScreen: React.FC = () => {
  const { "*": componentPath } = useParams();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [controlValues, setControlValues] = useState<Record<string, unknown>>(
    {}
  );
  const [loading, setLoading] = useState(true);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = () => {
      const cats = getComponentsByCategory();
      setCategories(cats);
      setLoading(false);

      // If no path and we have components, navigate to first one
      if (!componentPath && cats.length > 0 && cats[0].folders.length > 0 && cats[0].folders[0].items.length > 0) {
        navigate(`/dev/storybook/${cats[0].folders[0].items[0].path}`, { replace: true });
      }
    };

    loadCategories();
  }, [componentPath, navigate]);

  // Get current story module
  const storyModule = useMemo(() => {
    if (!componentPath) return undefined;
    return getStoryModule(componentPath);
  }, [componentPath]);

  // Get current story
  const currentStory = useMemo(() => {
    if (!storyModule) return undefined;
    return storyModule.stories[currentStoryIndex];
  }, [storyModule, currentStoryIndex]);

  // Compute default values from meta.defaultArgs + story.args
  const defaultValues = useMemo(() => {
    if (!storyModule) return {};
    return {
      ...storyModule.meta.defaultArgs,
      ...currentStory?.args,
    };
  }, [storyModule, currentStory]);

  // Get argTypes from meta
  const argTypes = useMemo((): Record<string, ArgType> => {
    if (!storyModule?.meta.argTypes) return {};
    return storyModule.meta.argTypes as Record<string, ArgType>;
  }, [storyModule]);

  // Reset control values when component or story changes
  useEffect(() => {
    setCurrentStoryIndex(0);
    setControlValues({});
  }, [componentPath]);

  // Reset control values when story changes
  useEffect(() => {
    setControlValues({});
  }, [currentStoryIndex]);

  // Handle control value changes
  const handleControlChange = useCallback((key: string, value: unknown) => {
    setControlValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Handle reset
  const handleReset = useCallback(() => {
    setControlValues({});
  }, []);

  const allComponents = getAllComponents();
  const hasComponents = allComponents.length > 0;

  return (
    <div className={styles.container}>
      {/* Left Sidebar - Navigation */}
      <aside className={styles.leftSidebar}>
        {/* Header */}
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitle}>
            <Development size={20} />
            <h2
              className="cds--type-productive-heading-03"
              style={{ margin: 0 }}
            >
              Storybook
            </h2>
            <span className={styles.devBadge}>DEV</span>
          </div>
          <p
            className="cds--type-helper-text-01"
            style={{ marginTop: "0.5rem" }}
          >
            組件展示與測試
          </p>
        </div>

        {/* Sidebar Navigation */}
        <div className={styles.sidebarContent}>
          {loading ? (
            <div style={{ padding: "1rem" }}>
              <SkeletonText paragraph lineCount={8} />
            </div>
          ) : (
            <StorySidebar
              categories={categories}
              currentPath={componentPath || ""}
            />
          )}
        </div>
      </aside>

      {/* Main Area */}
      <div className={styles.mainArea}>
        {/* Header */}
        <header className={styles.pageHeader}>
          <div className={styles.headerLeft}>
            <IconButton
              kind="ghost"
              size="sm"
              label="返回"
              onClick={() => navigate(-1)}
              style={{ marginLeft: "-0.5rem" }}
            >
              <ArrowLeft />
            </IconButton>

            {storyModule && (
              <>
                <div className={styles.componentPath}>
                  <span>{componentPath}</span>
                </div>
                <h1
                  className="cds--type-productive-heading-05"
                  style={{ margin: 0 }}
                >
                  {storyModule.meta.title.split("/").pop()}
                </h1>
                {storyModule.meta.description && (
                  <p
                    className="cds--type-body-compact-01"
                    style={{ color: "var(--cds-text-secondary)", margin: 0 }}
                  >
                    {storyModule.meta.description}
                  </p>
                )}
              </>
            )}
          </div>

          <div className={styles.headerActions}>
            <IconButton
              kind="ghost"
              size="sm"
              label="在新視窗開啟"
              onClick={() => {
                if (componentPath) {
                  window.open(`/dev/storybook/${componentPath}`, "_blank");
                }
              }}
            >
              <Launch />
            </IconButton>
          </div>
        </header>

        {/* Content Area */}
        <div className={styles.contentArea}>
          {/* Main Content */}
          <main className={styles.mainContent}>
            {loading ? (
              <SkeletonText paragraph lineCount={10} />
            ) : !hasComponents ? (
              <div className={styles.emptyState}>
                <Development size={64} className={styles.emptyIcon} />
                <h3 className="cds--type-heading-03">尚未註冊任何組件</h3>
                <p className="cds--type-body-long-01">
                  請在 registry/index.ts 中註冊您的 Story 模組
                </p>
              </div>
            ) : !storyModule ? (
              <div className={styles.emptyState}>
                <Development size={64} className={styles.emptyIcon} />
                <h3 className="cds--type-heading-03">選擇一個組件</h3>
                <p className="cds--type-body-long-01">
                  從左側選單選擇要預覽的組件
                </p>
              </div>
            ) : (
              <StoryCanvas
                meta={storyModule.meta}
                stories={storyModule.stories}
                currentStoryIndex={currentStoryIndex}
                onStoryChange={setCurrentStoryIndex}
                controlArgs={controlValues}
              />
            )}
          </main>

          {/* Right Sidebar - Controls */}
          {storyModule && (
            <aside className={styles.rightSidebar}>
              <div className={styles.rightSidebarHeader}>Controls</div>
              <div className={styles.rightSidebarContent}>
                <StoryControls
                  argTypes={argTypes}
                  values={controlValues}
                  defaultValues={defaultValues}
                  onChange={handleControlChange}
                  onReset={handleReset}
                />
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default StorybookScreen;
