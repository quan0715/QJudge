/**
 * Batch grading data access. Kept apart from the hook so copilot-aware code
 * never imports the chatbot repository directly (copilot dogfood boundary).
 */
import type { ChatMessage } from "@/core/types/chatbot.types";
import chatbotRepository from "@/infrastructure/api/repositories/chatbot.repository";
import {
  fetchArtifactContent,
  listArtifacts,
  uploadUserArtifact,
  type ArtifactRecord,
} from "@/infrastructure/api/repositories/artifact.repository";
import {
  BATCH_ARTIFACT_STEP,
  PROGRESS_CSV_FILENAME,
  type BatchActiveRun,
} from "./batchGradingModel";

const WRITTEN_PREFIX = "written_";

export interface BatchRemoteState {
  messages: ChatMessage[];
  activeRuns: BatchActiveRun[];
  progressCsv: string | null;
  /** Written-records CSV per question id. */
  writtenCsv: Record<string, string>;
}

function latestByFilename(artifacts: readonly ArtifactRecord[]): Map<string, ArtifactRecord> {
  const latest = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    const current = latest.get(artifact.filename);
    if (!current || new Date(artifact.updated_at) > new Date(current.updated_at)) {
      latest.set(artifact.filename, artifact);
    }
  }
  return latest;
}

export async function readBatchFile(sessionId: string, filename: string): Promise<string | null> {
  const artifact = latestByFilename(
    await listArtifacts({ sessionId, step: BATCH_ARTIFACT_STEP }),
  ).get(filename);
  return artifact ? (await fetchArtifactContent(artifact.artifact_id)).content : null;
}

export async function uploadBatchFile(
  sessionId: string,
  filename: string,
  content: string,
  type: string,
): Promise<void> {
  await uploadUserArtifact(sessionId, new File([content], filename, { type }), {
    step: BATCH_ARTIFACT_STEP,
  });
}

export async function listSessionActiveRuns(sessionId: string): Promise<BatchActiveRun[]> {
  return (await chatbotRepository.getActiveRuns())
    .filter((run) => run.sessionId === sessionId)
    .map((run) => ({ id: run.id, status: run.status }));
}

export async function startBatchRun(
  sessionId: string,
  prompt: string,
  modelId: string | undefined,
): Promise<void> {
  await chatbotRepository.startRun(sessionId, prompt, { modelOverride: modelId });
}

export async function cancelBatchRun(runId: string): Promise<void> {
  await chatbotRepository.cancelRun(runId);
}

export async function fetchBatchRemoteState(sessionId: string): Promise<BatchRemoteState> {
  const [session, activeRuns, artifacts] = await Promise.all([
    chatbotRepository.getSession(sessionId),
    listSessionActiveRuns(sessionId),
    listArtifacts({ sessionId, step: BATCH_ARTIFACT_STEP }),
  ]);
  const latest = latestByFilename(artifacts);
  const read = async (artifact: ArtifactRecord | undefined) =>
    artifact ? (await fetchArtifactContent(artifact.artifact_id)).content : null;
  const writtenEntries = await Promise.all(
    [...latest.entries()]
      .filter(([filename]) => filename.startsWith(WRITTEN_PREFIX))
      .map(async ([filename, artifact]) => [
        filename.slice(WRITTEN_PREFIX.length, -".csv".length),
        (await read(artifact)) ?? "",
      ] as const),
  );
  return {
    messages: session.messages,
    activeRuns,
    progressCsv: await read(latest.get(PROGRESS_CSV_FILENAME)),
    writtenCsv: Object.fromEntries(writtenEntries),
  };
}
