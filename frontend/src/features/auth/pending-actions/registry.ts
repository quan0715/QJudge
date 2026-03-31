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
    key: "teacher_activation",
    storageKey: "qjudge.teacher_activation_token",
    priority: -10,
    queryParam: "teacher_activation_token",
    banner: {
      titleKey: "auth.pendingAction.teacherActivationTitle",
      subtitleKey: "auth.pendingAction.teacherActivationSubtitle",
    },
    getRedirectPath: (token) =>
      `/teacher-activation?token=${encodeURIComponent(token)}`,
  },
  {
    key: "classroom_join",
    storageKey: "qjudge.classroom_join_code",
    priority: 10,
    queryParam: null,
    banner: {
      titleKey: "auth.pendingAction.classroomJoinTitle",
      subtitleKey: "auth.pendingAction.classroomJoinSubtitle",
    },
    getRedirectPath: (code) => `/classrooms/join/${code}`,
  },
];
