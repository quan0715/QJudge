import type { EventFeedItem } from "@/core/entities/contest.entity";
import type { EvidenceSourceModule } from "@/infrastructure/api/repositories/exam.repository";

export type IncidentEvidenceSource = EvidenceSourceModule;

export const INCIDENT_EVIDENCE_SOURCE_LABELS: Record<IncidentEvidenceSource, string> = {
  screen_share: "Screen",
  webcam: "Webcam",
};

const DEFAULT_WINDOW_MS = 20_000;
const DEFAULT_PREVIEW_LIMIT = 12;
const MAX_PREVIEW_LIMIT = 50;

export const isIncidentEvidenceSource = (value: unknown): value is IncidentEvidenceSource =>
  value === "screen_share" || value === "webcam";

export const getIncidentEvidenceModuleResults = (
  meta: Record<string, unknown>,
): Partial<Record<IncidentEvidenceSource, Record<string, unknown>>> => {
  const raw = meta.forced_capture_module_results;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([module, value]) =>
        isIncidentEvidenceSource(module) &&
        value &&
        typeof value === "object" &&
        !Array.isArray(value),
    ),
  ) as Partial<Record<IncidentEvidenceSource, Record<string, unknown>>>;
};

export const getIncidentEvidenceObjectKeys = (
  meta: Record<string, unknown>,
): string[] => {
  const keys = new Set<string>();
  const topLevelKeys = Array.isArray(meta.forced_capture_uploaded_object_keys)
    ? meta.forced_capture_uploaded_object_keys
    : [];
  topLevelKeys.forEach((value) => {
    if (typeof value === "string") keys.add(value);
  });

  Object.values(getIncidentEvidenceModuleResults(meta)).forEach((result) => {
    const moduleKeys = Array.isArray(result?.uploadedObjectKeys)
      ? result.uploadedObjectKeys
      : [];
    moduleKeys.forEach((value) => {
      if (typeof value === "string") keys.add(value);
    });
  });

  return Array.from(keys);
};

export const getIncidentEvidenceModules = (
  meta: Record<string, unknown>,
  objectKeys: string[],
): IncidentEvidenceSource[] => {
  const modules = new Set<IncidentEvidenceSource>();
  const configuredModules = Array.isArray(meta.forced_capture_modules)
    ? meta.forced_capture_modules
    : [];
  configuredModules.forEach((value) => {
    if (isIncidentEvidenceSource(value)) modules.add(value);
  });
  Object.keys(getIncidentEvidenceModuleResults(meta)).forEach((value) => {
    if (isIncidentEvidenceSource(value)) modules.add(value);
  });
  objectKeys.forEach((key) => {
    if (key.includes("/screen_share/")) modules.add("screen_share");
    if (key.includes("/webcam/")) modules.add("webcam");
  });
  if (isIncidentEvidenceSource(meta.evidence_source_module))
    modules.add(meta.evidence_source_module);
  if (isIncidentEvidenceSource(meta.module)) modules.add(meta.module);
  return Array.from(modules);
};

export const getIncidentEvidenceFrameCount = (
  meta: Record<string, unknown> | undefined,
): number => {
  if (!meta) return 0;
  const objectKeyCount = getIncidentEvidenceObjectKeys(meta).length;
  if (objectKeyCount > 0) return objectKeyCount;
  if (
    typeof meta.evidence_uploaded_frame_count === "number" &&
    meta.evidence_uploaded_frame_count > 0
  ) {
    return Math.ceil(meta.evidence_uploaded_frame_count);
  }

  let moduleCount = 0;
  Object.values(getIncidentEvidenceModuleResults(meta)).forEach((result) => {
    const moduleKeys = Array.isArray(result?.uploadedObjectKeys)
      ? result.uploadedObjectKeys
      : [];
    if (moduleKeys.length > 0) {
      moduleCount += moduleKeys.filter((value) => typeof value === "string").length;
      return;
    }
    if (result?.uploaded) moduleCount += 1;
  });
  if (moduleCount > 0) return moduleCount;
  return meta.forced_capture_uploaded ? 1 : 0;
};

export const getIncidentEvidencePreviewLimit = (
  incident: EventFeedItem,
  fallbackLimit = DEFAULT_PREVIEW_LIMIT,
): number => {
  const expectedCount =
    Number.isFinite(incident.evidenceCount) && incident.evidenceCount > 0
      ? incident.evidenceCount
      : fallbackLimit;
  return Math.min(
    MAX_PREVIEW_LIMIT,
    Math.max(1, Math.ceil(expectedCount || fallbackLimit)),
  );
};

export interface IncidentScreenshotQueryParams {
  user_id: string;
  ts_from?: number;
  ts_to?: number;
  event_id?: string | number;
  evidence_cluster_id?: string;
  upload_session_id?: string;
  source_module?: IncidentEvidenceSource;
  object_keys?: string[];
  limit?: number;
}

export const buildIncidentScreenshotQuery = (
  incident: EventFeedItem,
  options: {
    userId: string;
    windowBeforeMs?: number;
    windowAfterMs?: number;
    fallbackLimit?: number;
  },
): IncidentScreenshotQueryParams => {
  const metadata = incident.metadata ?? {};
  const objectKeys = getIncidentEvidenceObjectKeys(metadata);
  const modules = getIncidentEvidenceModules(metadata, objectKeys);
  const sessionId =
    typeof metadata.upload_session_id === "string" ? metadata.upload_session_id : "";
  const evidenceClusterId =
    typeof metadata.evidence_cluster_id === "string"
      ? metadata.evidence_cluster_id
      : "";
  const evidenceEventId =
    incident.eventId ??
    (typeof metadata.event_id === "string" || typeof metadata.event_id === "number"
      ? String(metadata.event_id)
      : "");
  const evidenceWindowStart =
    typeof metadata.evidence_window_start === "string"
      ? Date.parse(metadata.evidence_window_start)
      : NaN;
  const evidenceWindowEnd =
    typeof metadata.evidence_window_end === "string"
      ? Date.parse(metadata.evidence_window_end)
      : NaN;
  const firstMs = new Date(incident.firstAt).getTime();
  const lastMs = new Date(incident.lastAt).getTime();
  const windowBeforeMs = options.windowBeforeMs ?? DEFAULT_WINDOW_MS;
  const windowAfterMs = options.windowAfterMs ?? DEFAULT_WINDOW_MS;
  const isAggregatedIncident = incident.count > 1;
  const fallbackTsFrom = Number.isFinite(firstMs)
    ? firstMs - windowBeforeMs
    : undefined;
  const fallbackTsTo = Number.isFinite(lastMs)
    ? lastMs + windowAfterMs
    : undefined;
  const tsFrom = isAggregatedIncident
    ? fallbackTsFrom
    : Number.isFinite(evidenceWindowStart)
      ? evidenceWindowStart
      : fallbackTsFrom;
  const tsTo = isAggregatedIncident
    ? fallbackTsTo
    : Number.isFinite(evidenceWindowEnd)
      ? evidenceWindowEnd
      : fallbackTsTo;
  const previewLimit = getIncidentEvidencePreviewLimit(
    incident,
    options.fallbackLimit,
  );
  const params: IncidentScreenshotQueryParams = {
    user_id: options.userId,
    ts_from: tsFrom,
    ts_to: tsTo,
    limit: previewLimit,
  };

  if (!isAggregatedIncident) {
    params.event_id = evidenceEventId || undefined;
    params.evidence_cluster_id = evidenceClusterId || undefined;
    params.upload_session_id = sessionId || undefined;
    params.source_module =
      modules.length === 1 && objectKeys.length === 0 ? modules[0] : undefined;
    params.object_keys =
      objectKeys.length > 0 ? objectKeys.slice(0, previewLimit) : undefined;
  }

  return params;
};
