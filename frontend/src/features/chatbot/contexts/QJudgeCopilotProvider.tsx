import { useMemo, type ReactNode } from "react";
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
import {
  CopilotDemandProvider,
  useIsCopilotRequested,
} from "./CopilotDemandContext";

export interface QJudgeCopilotBoundaryProps {
  enabled: boolean;
  ownerKey?: string | null;
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
      ownerKey={props.ownerKey}
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
  return (
    <CopilotDemandProvider>
      <QJudgeCopilotRuntime>{children}</QJudgeCopilotRuntime>
    </CopilotDemandProvider>
  );
}

function QJudgeCopilotRuntime({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { right } = useWorkspace();
  const isRequested = useIsCopilotRequested();
  const location = useReactRouterCopilotSessionLocation();
  const translations = useMemo(() => new QJudgeCopilotTranslations(), []);
  const hasCopilotRole = user?.role === "teacher" || user?.role === "admin";
  const enabled = hasCopilotRole && (right.isOpenPreference || isRequested);

  return (
    <QJudgeCopilotBoundary
      enabled={enabled}
      ownerKey={user ? String(user.id) : null}
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
