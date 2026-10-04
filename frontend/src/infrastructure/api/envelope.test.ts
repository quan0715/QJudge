import { describe, expect, it } from "vitest";
import { fetchEnvelope } from "./envelope";

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("strict API envelope", () => {
  it.each([null, [], { id: 1 }])("accepts canonical success data %j", async (data) => {
    await expect(fetchEnvelope(response({ data, meta: {} }))).resolves.toEqual({ data, meta: {} });
  });
  it.each([{ success: true, data: {} }, { data: {} }, { data: {}, meta: {}, success: true }, { data: {}, meta: [] }])(
    "rejects legacy or malformed success %j", async (body) => {
      await expect(fetchEnvelope(response(body))).rejects.toMatchObject({ code: "envelope_malformed" });
    },
  );
  it("preserves field errors and correlation metadata", async () => {
    const errors = [{ code: "validation_error", message: "Already taken", field: "email", details: {} }];
    const meta = { request_id: "request-1", timestamp: "2026-10-05T00:00:00Z" };
    await expect(fetchEnvelope(response({ errors, meta }, 400))).rejects.toMatchObject({ status: 400, errors, meta });
  });
  it("rejects legacy errors without silently translating them", async () => {
    await expect(fetchEnvelope(response({ success: false, error: { code: "INVALID", message: "Old error" } }, 400)))
      .rejects.toMatchObject({ code: "envelope_malformed" });
  });
  it("rejects empty or HTML responses", async () => {
    await expect(fetchEnvelope(Promise.resolve(new Response(null, { status: 204 })))).rejects.toMatchObject({ code: "envelope_malformed" });
    await expect(fetchEnvelope(Promise.resolve(new Response("<html>Error</html>", { status: 500 })))).rejects.toMatchObject({ code: "envelope_malformed" });
  });
});
