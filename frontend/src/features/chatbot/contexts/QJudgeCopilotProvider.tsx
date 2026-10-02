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
import { PageContextProvider } from "@/shared/contexts/PageContextProvider";
import { ArtifactPanelProvider } from "./ArtifactPanelContext";
import {
  CopilotDemandProvider,
  useIsCopilotRequested,
} from "./CopilotDemandContext";
import {
  PageContextAttachmentProvider,
  usePageContextAttachment,
} from "./PageContextAttachmentProvider";

export interface QJudgeCopilotBoundaryProps {
  enabled: boolean;
  ownerKey?: string | null;
  transport: CopilotTransport;
  location: CopilotSessionLocation;
  storage: CopilotStorage;
  translations: CopilotTranslations;
  modelCatalog: CopilotModelCatalog;
  getRunMetadata?: () => Record<string, unknown>;
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
      getRunMetadata={props.getRunMetadata}
      initialSession="first"
    >
      <ArtifactPanelProvider>{props.children}</ArtifactPanelProvider>
    </CopilotProvider>
  );
}

export function QJudgeCopilotProvider({ children }: { children: ReactNode }) {
  return (
    <CopilotDemandProvider>
      <PageContextProvider>
        <PageContextAttachmentProvider>
          <QJudgeCopilotRuntime>{children}</QJudgeCopilotRuntime>
        </PageContextAttachmentProvider>
      </PageContextProvider>
    </CopilotDemandProvider>
  );
}

function QJudgeCopilotRuntime({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { right } = useWorkspace();
  const { takeRunMetadata } = usePageContextAttachment();
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
      getRunMetadata={takeRunMetadata}
    >
      {children}
    </QJudgeCopilotBoundary>
  );
}
