/**
 * User-facing artifact API client (session-scoped, read-only).
 *
 * Internal write endpoints are NOT called from the browser — the agent
 * writes via ai-service internal tools. This module lists / reads them
 * so the chat UI can preview.
 */
import { httpClient, requestJson } from "@/infrastructure/api/http.client";

const BASE_URL = "/api/v1/ai/artifacts";

export interface ArtifactRecord {
  id: string;
  session_id: string;
  run_id: string | null;
  step: string;
  filename: string;
  object_key: string;
  content_type: string;
  size_bytes: number;
  checksum: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse<T> {
  results?: T[];
  count?: number;
}

export async function listArtifacts(params: {
  sessionId?: string;
  runId?: string;
  step?: string;
}): Promise<ArtifactRecord[]> {
  const query = new URLSearchParams();
  if (params.sessionId) query.set("session_id", params.sessionId);
  if (params.runId) query.set("run_id", params.runId);
  if (params.step) query.set("step", params.step);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const data = await requestJson<PaginatedResponse<ArtifactRecord> | ArtifactRecord[]>(
    httpClient.get(`${BASE_URL}/${suffix}`),
    "Failed to list artifacts",
  );
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function fetchArtifactContent(artifactId: string): Promise<{
  content: string;
  contentType: string;
}> {
  const response = await httpClient.get(`${BASE_URL}/${artifactId}/content/`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Failed to load artifact ${artifactId}`);
  }
  const contentType = response.headers.get("content-type") || "text/plain";
  const content = await response.text();
  return { content, contentType };
}

export async function fetchArtifactDownloadUrl(artifactId: string): Promise<{
  url: string;
  ttl: number;
}> {
  return requestJson<{ url: string; ttl: number }>(
    httpClient.get(`${BASE_URL}/${artifactId}/download/`),
    "Failed to fetch download URL",
  );
}

export async function uploadUserArtifact(
  sessionId: string,
  file: File,
  options?: { step?: string },
): Promise<ArtifactRecord> {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  if (options?.step) formData.append("step", options.step);
  formData.append("file", file);
  return requestJson<ArtifactRecord>(
    httpClient.request(`${BASE_URL}/upload/`, {
      method: "POST",
      body: formData,
    }),
    "Failed to upload artifact",
  );
}
