import type {
  StoryModule,
  RegistryItem,
  CategoryGroup,
  FolderGroup,
} from "@/shared/types/story.types";

// Import all story modules here
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storyModules: Record<string, StoryModule<any>> = {};

/**
 * 註冊一個 Story 模組
 */
export function registerStory<P>(path: string, module: StoryModule<P>): void {
  storyModules[path] = module;
}

/**
 * 從路徑解析資料夾名稱
 * - shared: "shared/ui/tag/CategoryTag" -> "tag"
 * - features: "features/problems/components/ProblemPreviewSection" -> "problems" (domain)
 */
function getFolderFromPath(path: string): string {
  const parts = path.split("/");

  // features 使用 domain 作為資料夾名稱（第二層）
  if (parts[0] === "features" && parts.length >= 2) {
    return parts[1]; // e.g., "problem", "contest"
  }

  // shared 使用倒數第二層作為資料夾名稱
  return parts.length >= 2 ? parts[parts.length - 2] : "root";
}

/**
 * 取得所有已註冊的組件
 */
export function getAllComponents(): RegistryItem[] {
  return Object.entries(storyModules).map(([path, module]) => ({
    path,
    name: module.meta.title.split("/").pop() || module.meta.title,
    category: module.meta.category || "shared",
    folder: getFolderFromPath(path),
    module,
  }));
}

/**
 * 依分類和資料夾取得組件
 */
export function getComponentsByCategory(): CategoryGroup[] {
  const components = getAllComponents();

  // 第一層：按 category 分組
  const categoryMap = new Map<string, RegistryItem[]>();
  components.forEach((component) => {
    const category = component.category;
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(component);
  });

  // Category display names
  const categoryNames: Record<string, string> = {
    shared: "Shared UI",
    ui: "UI Components",
    features: "Features",
    layouts: "Layouts",
  };

  // 第二層：按 folder 分組
  const result: CategoryGroup[] = Array.from(categoryMap.entries())
    .map(([categoryId, items]) => {
      // 按 folder 分組
      const folderMap = new Map<string, RegistryItem[]>();
      items.forEach((item) => {
        const folder = item.folder;
        if (!folderMap.has(folder)) {
          folderMap.set(folder, []);
        }
        folderMap.get(folder)!.push(item);
      });

      // 轉換為 FolderGroup 陣列
      const folders: FolderGroup[] = Array.from(folderMap.entries())
        .map(([folderId, folderItems]) => ({
          id: folderId,
          name: folderId,
          items: folderItems.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        id: categoryId,
        name: categoryNames[categoryId] || categoryId,
        folders,
      };
    })
    .sort((a, b) => {
      // Custom sort order
      const order = ["shared", "ui", "features", "layouts"];
      return order.indexOf(a.id) - order.indexOf(b.id);
    });

  return result;
}

/**
 * 取得特定組件的 Story 模組
 */
export function getStoryModule(path: string): StoryModule | undefined {
  return storyModules[path];
}

// =====================================================
// 自動註冊 Stories
// =====================================================

// Import story modules - Shared UI: tag
import CategoryTagStories from "@/shared/ui/tag/CategoryTag.stories";
import DifficultyBadgeStories from "@/shared/ui/tag/DifficultyBadge.stories";
import AcrBadgeStories from "@/shared/ui/tag/AcrBadge.stories";
import { SubmissionStatusBadgeStories } from "@/shared/ui/tag/SubmissionStatusBadge.stories";
import { ContestStatusBadgeStories } from "@/shared/ui/tag/ContestStatusBadge.stories";
import NotFoundStories from "@/features/app/components/NotFound.stories";
import ServerErrorStories from "@/features/app/components/ServerError.stories";
import ConfirmModalStories from "@/shared/ui/modal/ConfirmModal.stories";
import ErrorBoundaryStories from "@/features/app/components/ErrorBoundary.stories";
import QJudgeEditorStories from "@/shared/ui/editor/QJudgeEditor.stories";
import KpiCardStories from "@/shared/ui/dataCard/KpiCard.stories";
import InfoCardStories from "@/shared/ui/dataCard/InfoCard.stories";
import MarkdownEditorStories from "@/shared/ui/markdown/markdownEditor/MarkdownEditor.stories";
import ProblemDiscussionThreadStories from "@/shared/ui/discussion/ProblemDiscussionThread.stories";

// Import story modules - Shared UI: config
import ThemeSwitchStories from "@/shared/ui/config/ThemeSwitch.stories";
import LanguageSwitchStories from "@/shared/ui/config/LanguageSwitch.stories";

// Import story modules - Shared UI: problem
import ProblemPreviewStories from "@/shared/ui/problem/ProblemPreview.stories";

// Import story modules - Shared UI: submission
import TestResultEntryStories from "@/shared/ui/submission/TestResultEntry.stories";
import TestResultListStories from "@/shared/ui/submission/TestResultList.stories";
import TestResultDetailStories from "@/shared/ui/submission/TestResultDetail.stories";

// Import story modules - Shared UI: testcase
import TestCaseEntryStories from "@/shared/ui/testcase/TestCaseEntry.stories";
import TestCaseListStories from "@/shared/ui/testcase/TestCaseList.stories";
import TestCaseDetailStories from "@/shared/ui/testcase/TestCaseDetail.stories";

// Register all stories - Shared UI: tag
registerStory("shared/ui/tag/CategoryTag", CategoryTagStories);
registerStory("shared/ui/tag/DifficultyBadge", DifficultyBadgeStories);
registerStory("shared/ui/tag/AcrBadge", AcrBadgeStories);
registerStory(
  "shared/ui/tag/SubmissionStatusBadge",
  SubmissionStatusBadgeStories
);
registerStory("shared/ui/tag/ContestStatusBadge", ContestStatusBadgeStories);
registerStory("shared/ui/modal/ConfirmModal", ConfirmModalStories);
registerStory("features/app/components/ErrorBoundary", ErrorBoundaryStories);
registerStory("features/app/components/NotFound", NotFoundStories);
registerStory("features/app/components/ServerError", ServerErrorStories);
registerStory("shared/ui/dataCard/KpiCard", KpiCardStories);
registerStory("shared/ui/dataCard/InfoCard", InfoCardStories);
registerStory("shared/ui/markdown/markdownEditor", MarkdownEditorStories);
registerStory(
  "shared/ui/discussion/ProblemDiscussionThread",
  ProblemDiscussionThreadStories
);

// Register all stories - Shared UI: config
registerStory("shared/ui/config/ThemeSwitch", ThemeSwitchStories);
registerStory("shared/ui/config/LanguageSwitch", LanguageSwitchStories);

// Register all stories - Shared UI: problem
registerStory("shared/ui/problem/ProblemPreview", ProblemPreviewStories);
registerStory("shared/ui/editor/QJudgeEditor", QJudgeEditorStories);

// Register all stories - Shared UI: submission
import SubmissionPreviewCardStories from "@/shared/ui/submission/SubmissionPreviewCard.stories";
import SubmissionDataTableStories from "@/shared/ui/submission/SubmissionDataTable.stories";
registerStory(
  "shared/ui/submission/SubmissionPreviewCard",
  SubmissionPreviewCardStories
);
registerStory(
  "shared/ui/submission/SubmissionDataTable",
  SubmissionDataTableStories
);
registerStory("shared/ui/submission/TestResultEntry", TestResultEntryStories);
registerStory("shared/ui/submission/TestResultList", TestResultListStories);
registerStory("shared/ui/submission/TestResultDetail", TestResultDetailStories);

// Register all stories - Shared UI: testcase
registerStory("shared/ui/testcase/TestCaseEntry", TestCaseEntryStories);
registerStory("shared/ui/testcase/TestCaseList", TestCaseListStories);
registerStory("shared/ui/testcase/TestCaseDetail", TestCaseDetailStories);

// Import story modules - Shared UI: navigation

// Register all stories - Shared UI: navigation

// Import story modules - Features: Problems
import ProblemPreviewSectionStories from "@/features/problems/screens/problems/section/ProblemPreviewSection.stories";
import ContestPreviewCardStories from "@/features/contest/components/ContestPreviewCard.stories";

// Register all stories - Features: Problems
registerStory(
  "features/problems/screens/problems/section/ProblemPreviewSection",
  ProblemPreviewSectionStories
);
registerStory(
  "features/contest/components/ContestPreviewCard",
  ContestPreviewCardStories
);

// Dynamic import for development (lazy loading)
export async function loadAllStories(): Promise<void> {
  // This function can be used for dynamic imports if needed
  // For now, we rely on static imports above
}
