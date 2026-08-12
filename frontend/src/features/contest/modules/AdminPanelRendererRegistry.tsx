import { lazy } from "react";
import type { AdminPanelId, ContestTypeModule, AdminPanelRenderer } from "./types";

const AdminOverviewScreen = lazy(
  () => import("../screens/admin/panels/AdminOverviewScreen"),
);
const AdminClarificationsScreen = lazy(
  () => import("../screens/admin/panels/AdminClarificationsScreen"),
);
const AdminProctoringPanel = lazy(
  () => import("../screens/admin/panels/AdminProctoringPanel"),
);
const ContestExamGradingScreen = lazy(
  () => import("../screens/settings/ContestExamGradingScreen"),
);
const ContestAiGradingScreen = lazy(
  () => import("../screens/settings/ContestAiGradingScreen"),
);
const renderNothing: AdminPanelRenderer = () => null;

const defaultAdminRenderers: Record<AdminPanelId, AdminPanelRenderer> = {
  overview: AdminOverviewScreen,
  clarifications: AdminClarificationsScreen,
  proctoring: AdminProctoringPanel,
  grading: ContestExamGradingScreen,
  "ai-grading": ContestAiGradingScreen,
  settings: renderNothing,
  problem_editor: renderNothing,
  statistics: renderNothing,
};

export const getAdminPanelRenderer = (
  panelId: AdminPanelId,
  module: ContestTypeModule,
): AdminPanelRenderer => {
  const customRenderers = module.admin.getPanelRenderers?.() || {};
  return customRenderers[panelId] || defaultAdminRenderers[panelId] || renderNothing;
};
