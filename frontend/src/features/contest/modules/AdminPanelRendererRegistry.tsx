import { lazy } from "react";
import type { AdminPanelId, ContestTypeModule, AdminPanelRenderer } from "./types";
import ContestExamGradingScreen from "../screens/settings/ContestExamGradingScreen";

const AdminOverviewScreen = lazy(
  () => import("../screens/admin/panels/AdminOverviewScreen"),
);
const AdminProctoringPanel = lazy(
  () => import("../screens/admin/panels/AdminProctoringPanel"),
);
const ContestAiGradingScreen = lazy(
  () => import("../screens/settings/ContestAiGradingScreen"),
);
const ContestWorkbenchScreen = lazy(() => import("../screens/settings/ContestWorkbenchScreen"));
const renderNothing: AdminPanelRenderer = () => null;
const AdminStandingsScreen = lazy(() => import("../screens/admin/panels/AdminStandingsScreen"));

const defaultAdminRenderers: Record<AdminPanelId, AdminPanelRenderer> = {
  overview: AdminOverviewScreen,
  clarifications: AdminOverviewScreen,
  proctoring: AdminProctoringPanel,
  standings: AdminStandingsScreen,
  grading: ContestExamGradingScreen,
  "grading-workbench": ContestWorkbenchScreen,
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
