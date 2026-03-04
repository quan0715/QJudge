import type { AdminPanelId, ContestTypeModule, AdminPanelRenderer } from "./types";
import AdminOverviewPanel from "../screens/admin/panels/AdminOverviewScreen";
import AdminClarificationsScreen from "../screens/admin/panels/AdminClarificationsScreen";
import ContestLogsScreen from "../screens/settings/ContestLogsScreen";
import ContestParticipantsScreen from "../screens/settings/ContestParticipantsScreen";
import ContestExamGradingScreen from "../screens/settings/ContestExamGradingScreen";
import AdminContestSettingsPanel from "../screens/admin/panels/AdminContestSettingsScreen";

const DefaultEmptyPanel: AdminPanelRenderer = () => null;

const defaultAdminRenderers: Record<AdminPanelId, AdminPanelRenderer> = {
  overview: AdminOverviewPanel,
  clarifications: AdminClarificationsScreen,
  logs: ContestLogsScreen,
  participants: ContestParticipantsScreen,
  grading: ContestExamGradingScreen,
  settings: AdminContestSettingsPanel,
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
