import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadMarkdownImage } from "./markdown.repository";

describe("uploadMarkdownImage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads image with multipart form data", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: "http://testserver/api/v1/markdown/images/markdown/2026/03/a.png",
          markdown: "![a](http://testserver/api/v1/markdown/images/markdown/2026/03/a.png)",
          content_type: "image/png",
          size: 123,
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    const file = new File(["abc"], "diagram.png", { type: "image/png" });
    const result = await uploadMarkdownImage(file);

    expect(result.url).toContain("/api/v1/markdown/images/");
    expect(result.content_type).toBe("image/png");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/markdown/images/");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.body instanceof FormData).toBe(true);
  });

  it("throws api error message when upload fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: { code: "INVALID", message: "Unsupported image format" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );

    const file = new File(["abc"], "diagram.txt", { type: "text/plain" });
    await expect(uploadMarkdownImage(file)).rejects.toThrow("Unsupported image format");
  });
});
