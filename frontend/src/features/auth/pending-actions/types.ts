export interface PendingActionConfig {
  /** Unique key, e.g. "action_link" */
  key: string;
  /** sessionStorage key */
  storageKey: string;
  /**
   * Priority controls ordering in getAuthedLandingPath.
   *  - priority < 0: checked BEFORE onboarding gate
   *  - priority >= 0: checked AFTER onboarding gate
   */
  priority: number;
  /**
   * Query param name used to carry value through login↔register links.
   * null means this action only uses sessionStorage.
   */
  queryParam: string | null;
  /** i18n keys for the info banner shown on login/register screens (null = no banner) */
  banner: {
    titleKey: string;
    subtitleKey: string;
  } | null;
  /** Given the stored value, return the redirect path */
  getRedirectPath: (value: string) => string;
}
