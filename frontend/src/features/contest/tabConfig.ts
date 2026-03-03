export type ContestTabKey =
  | "overview"
  | "problems"
  | "submissions"
  | "standings"
  | "clarifications";

export interface ContestTabSpec {
  key: ContestTabKey;
  labelKey: string;
}

export const CONTEST_TAB_LABEL_KEY_MAP: Record<ContestTabKey, string> = {
  overview: "tabs.overview",
  problems: "tabs.problems",
  submissions: "tabs.submissions",
  standings: "tabs.ranking",
  clarifications: "tabs.clarifications",
};

export const toContestTabSpecs = (keys: ContestTabKey[]): ContestTabSpec[] =>
  keys.map((key) => ({ key, labelKey: CONTEST_TAB_LABEL_KEY_MAP[key] }));
