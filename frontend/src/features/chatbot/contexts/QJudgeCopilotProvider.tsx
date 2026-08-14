import { useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspace } from "@/features/app/contexts/WorkspaceContext";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  qJudgeCopilotModelCatalog,
  qJudgeCopilotStorage,
  qJudgeCopilotTransport,
} from "@/infrastructure/copilot/qJudgeCopilotDependencies";
import {
  CopilotProvider,
  type CopilotModelCatalog,
  type CopilotSessionLocation,
  type CopilotStorage,
  type CopilotTranslations,
  type CopilotTransport,
} from "@copilot";
import { QJudgeCopilotTranslations } from "../adapters/qJudgeCopilotTranslations";
import { useReactRouterCopilotSessionLocation } from "../adapters/reactRouterCopilotSessionLocation";
import { ArtifactPanelProvider } from "./ArtifactPanelContext";

export interface QJudgeCopilotBoundaryProps {
  enabled: boolean;
  transport: CopilotTransport;
  location: CopilotSessionLocation;
  storage: CopilotStorage;
  translations: CopilotTranslations;
  modelCatalog: CopilotModelCatalog;
  children: ReactNode;
}

export function QJudgeCopilotBoundary(props: QJudgeCopilotBoundaryProps) {
  return (
    <CopilotProvider
      enabled={props.enabled}
      transport={props.transport}
      sessionLocation={props.location}
      storage={props.storage}
      translations={props.translations}
      modelCatalog={props.modelCatalog}
      initialSession="first"
    >
      <ArtifactPanelProvider>{props.children}</ArtifactPanelProvider>
    </CopilotProvider>
  );
}

export function QJudgeCopilotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { right } = useWorkspace();
  const routerLocation = useLocation();
  const location = useReactRouterCopilotSessionLocation();
  const translations = useMemo(() => new QJudgeCopilotTranslations(), []);
  const hasCopilotRole = user?.role === "teacher" || user?.role === "admin";
  const isStandaloneChat = routerLocation.pathname === "/chat";
  const isContestAiGrading =
    /^\/classrooms\/[^/]+\/contest\/[^/]+\/admin\/?$/.test(
      routerLocation.pathname,
    ) &&
    new URLSearchParams(routerLocation.search).get("panel") === "ai-grading";
  const enabled =
    hasCopilotRole &&
    (right.isOpenPreference || isStandaloneChat || isContestAiGrading);

  return (
    <QJudgeCopilotBoundary
      enabled={enabled}
      transport={qJudgeCopilotTransport}
      location={location}
      storage={qJudgeCopilotStorage}
      translations={translations}
      modelCatalog={qJudgeCopilotModelCatalog}
    >
      {children}
    </QJudgeCopilotBoundary>
  );
}
