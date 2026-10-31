import { describe, expect, it } from "vitest";

const origin = new URL(process.env.API_BASE_URL || "http://localhost:8080").origin;

// Exercise the real frontend ingress: mocks cannot catch Nginx redirect order.
describe("public landing ingress", () => {
  it("redirects browser visits with language and query parameters intact", async () => {
    const response = await fetch(`${origin}/?lang=en&utm_source=course`, {
      headers: { Host: "q-judge.com", Accept: "text/html" },
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://www.q-judge.com/?lang=en&utm_source=course");
  });

  it("preserves Markdown and discovery headers for agents", async () => {
    const response = await fetch(`${origin}/`, {
      headers: { Host: "q-judge.com", Accept: "text/markdown" },
      redirect: "manual",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(response.headers.get("link")).toContain('rel="service-desc"');
    expect(response.headers.get("link")).toContain('rel="describedby"');
    expect(await response.text()).toContain("QJudge");
  });

  it("keeps self-hosted homepages and public app login local", async () => {
    for (const [path, host] of [["/", "school.example.org"], ["/login", "q-judge.com"]]) {
      const response = await fetch(`${origin}${path}`, {
        headers: { Host: host, Accept: "text/html" },
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-type")).toContain("text/html");
    }
  });
});
