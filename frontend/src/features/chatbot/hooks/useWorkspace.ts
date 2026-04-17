import { useContext } from "react";
import { WorkspaceContext } from "../components/workspace/AIWorkspaceProvider";
import type { WorkspaceContextValue } from "../components/workspace/AIWorkspaceProvider";

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
