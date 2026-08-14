import { afterEach, describe, expect, it, vi } from "vitest";

import { httpClient } from "@/infrastructure/api/http.client";
import {
  fetchArtifactContent,
  fetchArtifactDownloadUrl,
  listArtifacts,
  uploadUserArtifact,
} from "./artifact.repository";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const ARTIFACT_ID = "33333333-3333-3333-3333-333333333333";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("artifactRepository AI-owned response conversion", () => {
  it("preserves aggregate identifiers and forwards list filters", async () => {
    const get = vi.spyOn(httpClient, "get").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          count: 1,
          results: [
            {
              id: ARTIFACT_ID,
              session_id: SESSION_ID,
              run_id: RUN_ID,
              step: "user_upload",
              filename: "answer.pdf",
              content_type: "application/pdf",
              size_bytes: 42,
              checksum: "sha256:abc",
              metadata: { source: "user" },
              created_at: "2026-08-06T00:00:00Z",
              updated_at: "2026-08-06T00:00:00Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const artifacts = await listArtifacts({
      sessionId: SESSION_ID,
      runId: RUN_ID,
      step: "user_upload",
    });

    expect(artifacts).toEqual([
      expect.objectContaining({
        id: ARTIFACT_ID,
        session_id: SESSION_ID,
        run_id: RUN_ID,
      }),
    ]);
    const url = new URL(String(get.mock.calls[0]?.[0]), "https://qjudge.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      session_id: SESSION_ID,
      run_id: RUN_ID,
      step: "user_upload",
    });
  });

  it("converts upload, content, and download response shapes", async () => {
    const artifact = {
      id: ARTIFACT_ID,
      session_id: SESSION_ID,
      run_id: null,
      step: "user_upload",
      filename: "notes.txt",
      content_type: "text/plain",
      size_bytes: 5,
      checksum: "sha256:def",
      metadata: {},
      created_at: "2026-08-06T00:00:00Z",
      updated_at: "2026-08-06T00:00:00Z",
    };
    vi.spyOn(httpClient, "request").mockResolvedValueOnce(
      new Response(JSON.stringify(artifact), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.spyOn(httpClient, "get")
      .mockResolvedValueOnce(
        new Response("hello", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ url: "https://objects.test/notes.txt", ttl: 300 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    await expect(
      uploadUserArtifact(SESSION_ID, new File(["hello"], "notes.txt")),
    ).resolves.toEqual(artifact);
    await expect(fetchArtifactContent(ARTIFACT_ID)).resolves.toEqual({
      content: "hello",
      contentType: "text/plain; charset=utf-8",
    });
    await expect(fetchArtifactDownloadUrl(ARTIFACT_ID)).resolves.toEqual({
      url: "https://objects.test/notes.txt",
      ttl: 300,
    });
  });
});
