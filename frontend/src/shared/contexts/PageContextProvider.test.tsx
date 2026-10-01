import { render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { PageContextSegment } from "@/core/types/chatbot.types";
import {
  PageContextProvider,
  usePageContextSegments,
  usePublishPageContext,
} from "./PageContextProvider";

const classroom: PageContextSegment = {
  type: "classroom",
  label: "資工一甲",
  ids: { classroom_id: "c1" },
};
const contest: PageContextSegment = {
  type: "contest",
  label: "期中考",
  ids: { contest_id: "A" },
};
const problem: PageContextSegment = {
  type: "problem",
  label: "A. A+B",
  ids: { binding_id: "b1", problem_id: "p1" },
};

function Publish({ segment }: { segment: PageContextSegment | null }) {
  usePublishPageContext(segment);
  return null;
}

const seen = { segments: [] as readonly PageContextSegment[] };
function Probe() {
  const current = usePageContextSegments();
  useEffect(() => {
    seen.segments = current;
  });
  return null;
}

describe("PageContextProvider", () => {
  it("orders segments by level regardless of publish order", () => {
    render(
      <PageContextProvider>
        <Publish segment={problem} />
        <Publish segment={classroom} />
        <Publish segment={contest} />
        <Probe />
      </PageContextProvider>,
    );

    expect(seen.segments).toEqual([classroom, contest, problem]);
  });

  it("removes a segment when its publisher unmounts or publishes null", () => {
    const view = render(
      <PageContextProvider>
        <Publish key="classroom" segment={classroom} />
        <Publish key="contest" segment={contest} />
        <Probe />
      </PageContextProvider>,
    );

    view.rerender(
      <PageContextProvider>
        <Publish key="classroom" segment={classroom} />
        <Probe />
      </PageContextProvider>,
    );
    expect(seen.segments).toEqual([classroom]);

    view.rerender(
      <PageContextProvider>
        <Publish key="classroom" segment={null} />
        <Probe />
      </PageContextProvider>,
    );
    expect(seen.segments).toEqual([]);
  });

  it("replaces a segment whose content changes and keeps equal re-renders stable", () => {
    const view = render(
      <PageContextProvider>
        <Publish segment={{ ...contest }} />
        <Probe />
      </PageContextProvider>,
    );
    const first = seen.segments;

    view.rerender(
      <PageContextProvider>
        <Publish segment={{ ...contest }} />
        <Probe />
      </PageContextProvider>,
    );
    expect(seen.segments).toBe(first);

    view.rerender(
      <PageContextProvider>
        <Publish segment={{ ...contest, label: "期末考" }} />
        <Probe />
      </PageContextProvider>,
    );
    expect(seen.segments).toEqual([{ ...contest, label: "期末考" }]);
  });

  it("is a no-op outside the provider", () => {
    render(
      <>
        <Publish segment={classroom} />
        <Probe />
      </>,
    );
    expect(seen.segments).toEqual([]);
  });
});
