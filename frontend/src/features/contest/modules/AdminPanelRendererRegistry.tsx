import type { AdminPanelId, ContestTypeModule, AdminPanelRenderer } from "./types";
import AdminOverviewScreen from "../screens/admin/panels/AdminOverviewScreen";
import AdminClarificationsScreen from "../screens/admin/panels/AdminClarificationsScreen";
import AdminProctoringPanel from "../screens/admin/panels/AdminProctoringPanel";
import ContestExamGradingScreen from "../screens/settings/ContestExamGradingScreen";
import ContestAiGradingScreen from "../screens/settings/ContestAiGradingScreen";
const DefaultEmptyPanel: AdminPanelRenderer = () => null;

const defaultAdminRenderers: Record<AdminPanelId, AdminPanelRenderer> = {
  overview: AdminOverviewScreen,
  clarifications: AdminClarificationsScreen,
  proctoring: AdminProctoringPanel,
  grading: ContestExamGradingScreen,
  "ai-grading": ContestAiGradingScreen,
  settings: DefaultEmptyPanel,
  problem_editor: DefaultEmptyPanel,
  statistics: DefaultEmptyPanel,
};

export const getAdminPanelRenderer = (
  panelId: AdminPanelId,
  module: ContestTypeModule,
): AdminPanelRenderer => {
  const customRenderers = module.admin.getPanelRenderers?.() || {};
  return customRenderers[panelId] || defaultAdminRenderers[panelId] || DefaultEmptyPanel;
};
