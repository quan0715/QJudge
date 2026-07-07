import type { PendingActionConfig } from "./types";

/**
 * Central registry of all pending action types.
 *
 * To add a new action:
 * 1. Add a config entry here
 * 2. Add i18n keys (banner title/subtitle) in all locales
 * 3. Create the action screen (store on unauth → clear + execute on auth)
 */
export const PENDING_ACTIONS: PendingActionConfig[] = [
  {
    key: "oauth_next",
    storageKey: "qjudge.oauth_next",
    priority: -20,
    queryParam: "next",
    banner: null,
    getRedirectPath: (url) => url,
  },
  {
    key: "action_link",
    storageKey: "qjudge.action_link_token",
    priority: -10,
    queryParam: "action_link_token",
    banner: {
      titleKey: "auth.pendingAction.actionLinkTitle",
      subtitleKey: "auth.pendingAction.actionLinkSubtitle",
    },
    getRedirectPath: (token) =>
      `/invite/${encodeURIComponent(token)}`,
  },
];
