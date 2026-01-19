import { useState, useMemo } from "react";
import { IconButton, CopyButton } from "@carbon/react";
import { Light, Asleep, Code } from "@carbon/icons-react";
import type { Story, StoryMeta, ArgType } from "@/shared/types/story.types";
import styles from "../screens/StorybookScreen.module.scss";

interface StoryCanvasProps<P = unknown> {
  meta: StoryMeta<P>;
  stories: Story<P>[];
  currentStoryIndex: number;
  onStoryChange: (index: number) => void;
  /** 來自 Controls 面板的動態 args */
  controlArgs: Record<string, unknown>;
}

type CanvasTheme = "default" | "light" | "dark";

/**
 * 將 controlArgs 中的 key 透過 mapping 轉換為實際的 object
 */
function resolveControlArgs(
  controlArgs: Record<string, unknown>,
  argTypes: Partial<Record<string, ArgType>> | undefined
): Record<string, unknown> {
  if (!argTypes) return controlArgs;

  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(controlArgs)) {
    const argType = argTypes[key as keyof typeof argTypes] as ArgType | undefined;
    // 如果有 mapping 且值是 string（key），則轉換為實際 object
    if (argType?.mapping && typeof value === "string" && value in argType.mapping) {
      resolved[key] = argType.mapping[value];
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

function StoryCanvas<P>({
  meta,
  stories,
  currentStoryIndex,
  onStoryChange,
  controlArgs,
}: StoryCanvasProps<P>) {
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>("default");
  const [showCode, setShowCode] = useState(false);

  // 將 controlArgs 中的 key 透過 mapping 轉換為實際的 object
  // Must be called before any early returns to comply with Rules of Hooks
  const resolvedControlArgs = useMemo(
    () => resolveControlArgs(controlArgs, meta.argTypes),
    [controlArgs, meta.argTypes]
  );

  const currentStory = stories[currentStoryIndex];
  if (!currentStory) return null;

  // Merge: defaultArgs < story.args < resolvedControlArgs (from Controls panel)
  const args = {
    ...meta.defaultArgs,
    ...currentStory.args,
    ...resolvedControlArgs,
  } as P;

  const getCanvasClassName = () => {
    const base = styles.canvas;
    if (canvasTheme === "light") return `${base} ${styles.canvasLight}`;
    if (canvasTheme === "dark") return `${base} ${styles.canvasDark}`;
    return base;
  };

  return (
    <div className={styles.canvasSection}>
      {/* Story Selector */}
      {stories.length > 1 && (
        <div className={styles.storySelector}>
          {stories.map((story, index) => (
            <button
              key={story.name}
              type="button"
              onClick={() => onStoryChange(index)}
              className={`${styles.storyButton} ${
                index === currentStoryIndex ? styles.active : ""
              }`}
            >
              {story.name}
            </button>
          ))}
        </div>
      )}

      {/* Canvas Header */}
      <div className={styles.canvasHeader}>
        <h3 className="cds--type-heading-compact-01" style={{ margin: 0 }}>
          {currentStory.name}
        </h3>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <IconButton
            kind="ghost"
            size="sm"
            label="Light background"
            onClick={() =>
              setCanvasTheme(canvasTheme === "light" ? "default" : "light")
            }
          >
            <Light />
          </IconButton>
          <IconButton
            kind="ghost"
            size="sm"
            label="Dark background"
            onClick={() =>
              setCanvasTheme(canvasTheme === "dark" ? "default" : "dark")
            }
          >
            <Asleep />
          </IconButton>
          <IconButton
            kind="ghost"
            size="sm"
            label="Toggle code"
            onClick={() => setShowCode(!showCode)}
          >
            <Code />
          </IconButton>
        </div>
      </div>

      {/* Story Description */}
      {currentStory.description && (
        <p
          className="cds--type-body-compact-01"
          style={{
            color: "var(--cds-text-secondary)",
            marginBottom: "1rem",
          }}
        >
          {currentStory.description}
        </p>
      )}

      {/* Canvas */}
      <div className={getCanvasClassName()}>{currentStory.render(args)}</div>

      {/* Current Args Display */}
      {Object.keys(controlArgs).length > 0 && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            background: "var(--cds-layer-02)",
            borderRadius: "4px",
            fontSize: "0.75rem",
          }}
        >
          <span
            className="cds--label"
            style={{ display: "block", marginBottom: "0.5rem" }}
          >
            目前選擇
          </span>
          <pre style={{ margin: 0, overflow: "auto", maxHeight: "200px" }}>
            {JSON.stringify(controlArgs, null, 2)}
          </pre>
        </div>
      )}

      {/* Code Block */}
      {showCode && currentStory.code && (
        <div className={styles.codeSection}>
          <div className={styles.codeHeader}>
            <span className="cds--type-label-01">範例程式碼</span>
            <CopyButton
              onClick={() => {
                navigator.clipboard.writeText(currentStory.code || "");
              }}
            />
          </div>
          <pre className={styles.codeBlock}>
            <code>{currentStory.code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

export default StoryCanvas;
