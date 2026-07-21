import { useMemo, type ReactNode } from "react";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import {
  QJUDGE_FALLBACK_MODELS,
  qJudgeCopilotModelCatalog,
  qJudgeCopilotStorage,
  qJudgeCopilotTransport,
} from "@/infrastructure/copilot/qJudgeCopilotDependencies";
import {
  CopilotProvider,
  type CopilotModel,
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
  fallbackModels: readonly CopilotModel[];
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
      fallbackModels={props.fallbackModels}
      initialSession="first"
    >
      <ArtifactPanelProvider>{props.children}</ArtifactPanelProvider>
    </CopilotProvider>
  );
}

export function QJudgeCopilotProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useReactRouterCopilotSessionLocation();
  const translations = useMemo(() => new QJudgeCopilotTranslations(), []);

  return (
    <QJudgeCopilotBoundary
      enabled={!!user}
      transport={qJudgeCopilotTransport}
      location={location}
      storage={qJudgeCopilotStorage}
      translations={translations}
      modelCatalog={qJudgeCopilotModelCatalog}
      fallbackModels={QJUDGE_FALLBACK_MODELS}
    >
      {children}
    </QJudgeCopilotBoundary>
  );
}
