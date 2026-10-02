import { describe, expect, it } from "vitest";
import { contestPageContext } from "./contestPageContext";

describe("contestPageContext", () => {
  it("uses the loaded contest when it is the one in the route", () => {
    expect(
      contestPageContext("B", { id: "B", name: "期末考" }, null),
    ).toEqual({ type: "contest", label: "期末考", ids: { contest_id: "B" } });
  });

  it("ignores a stale loaded contest while the routed one is still loading", () => {
    expect(contestPageContext("B", { id: "A", name: "期中考" }, null)).toBeNull();
  });

  it("falls back to the classroom's contest list for the routed contest", () => {
    expect(
      contestPageContext(
        "B",
        { id: "A", name: "期中考" },
        { contestId: "B", contestName: "期末考" },
      ),
    ).toEqual({ type: "contest", label: "期末考", ids: { contest_id: "B" } });
  });

  it("publishes nothing outside a contest route", () => {
    expect(contestPageContext(null, { id: "A", name: "期中考" }, null)).toBeNull();
  });
});
