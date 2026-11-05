import { lazy } from "react";
import type { AdminPanelId, ContestTypeModule, AdminPanelRenderer } from "./types";

const AdminOverviewScreen = lazy(
  () => import("../screens/admin/panels/AdminOverviewScreen"),
);
const AdminParticipantsPanel = lazy(
  () => import("../screens/admin/panels/AdminParticipantsPanel"),
);
const ContestWorkbenchScreen = lazy(() => import("../screens/settings/ContestWorkbenchScreen"));
const renderNothing: AdminPanelRenderer = () => null;
const AdminStandingsScreen = lazy(() => import("../screens/admin/panels/AdminStandingsScreen"));

const defaultAdminRenderers: Record<AdminPanelId, AdminPanelRenderer> = {
  overview: AdminOverviewScreen,
  clarifications: AdminOverviewScreen,
  participants: AdminParticipantsPanel,
  standings: AdminStandingsScreen,
  // Legacy IDs are normalized before dispatch; keep a harmless workbench fallback.
  grading: ContestWorkbenchScreen,
  "grading-workbench": ContestWorkbenchScreen,
  "ai-grading": ContestWorkbenchScreen,
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
