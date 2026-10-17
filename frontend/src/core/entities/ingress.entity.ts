/** Public entry points of the deployment, probed from the host. */

import type { AgentState } from "./systemVersion.entity";

export interface IngressEntry {
  id: string;
  /** Address users connect to. */
  public: string;
  /** Where the reverse proxy should forward it. */
  target: string;
  probe: string;
  ok: boolean;
  detail: string;
}

export interface IngressReport {
  agent: AgentState;
  entries: IngressEntry[];
}
