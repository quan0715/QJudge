import { getContest } from "../contest.repository";
import { httpClient } from "@/infrastructure/api/http.client";
vi.mock("@/infrastructure/api/http.client", async (original) => ({ ...await original<typeof import("@/infrastructure/api/http.client")>(), httpClient: { get: vi.fn() } }));
it.each([403, 404, 500])("preserves status %s and only returns missing for 404", async (status) => {
  vi.mocked(httpClient.get).mockResolvedValue(new Response(JSON.stringify({ detail: "Unavailable" }), { status }));
  if (status === 404) expect(await getContest("c")).toBeUndefined();
  else await expect(getContest("c")).rejects.toMatchObject({ status });
});
