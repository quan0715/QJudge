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
    key: "magic_link",
    storageKey: "qjudge.magic_link_token",
    priority: -10,
    queryParam: "magic_link_token",
    banner: {
      titleKey: "auth.pendingAction.magicLinkTitle",
      subtitleKey: "auth.pendingAction.magicLinkSubtitle",
    },
    getRedirectPath: (token) =>
      `/magic-links/${encodeURIComponent(token)}`,
  },
];
