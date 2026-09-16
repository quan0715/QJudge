export type LiveSource = "screen_share" | "webcam";
export type LiveRole = "publisher" | "subscriber";
export type LiveState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unavailable"
  | "closed";

export interface LiveGrant {
  serverUrl: string;
  token: string;
  roomName: string;
  identity: string;
  runId: string;
  role: LiveRole;
  allowedSources: LiveSource[];
  expiresAt: string;
}

export interface LiveTarget {
  userId: string;
  identity: string;
  sources: LiveSource[];
}

export interface LiveTargetSnapshot {
  observedAt: string | null;
  stale: boolean;
  targets: LiveTarget[];
}
