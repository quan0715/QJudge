import { render } from "@testing-library/react";
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

let segments: readonly PageContextSegment[] = [];
function Probe() {
  segments = usePageContextSegments();
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

    expect(segments).toEqual([classroom, contest, problem]);
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
    expect(segments).toEqual([classroom]);

    view.rerender(
      <PageContextProvider>
        <Publish key="classroom" segment={null} />
        <Probe />
      </PageContextProvider>,
    );
    expect(segments).toEqual([]);
  });

  it("replaces a segment whose content changes and keeps equal re-renders stable", () => {
    const view = render(
      <PageContextProvider>
        <Publish segment={{ ...contest }} />
        <Probe />
      </PageContextProvider>,
    );
    const first = segments;

    view.rerender(
      <PageContextProvider>
        <Publish segment={{ ...contest }} />
        <Probe />
      </PageContextProvider>,
    );
    expect(segments).toBe(first);

    view.rerender(
      <PageContextProvider>
        <Publish segment={{ ...contest, label: "期末考" }} />
        <Probe />
      </PageContextProvider>,
    );
    expect(segments).toEqual([{ ...contest, label: "期末考" }]);
  });

  it("is a no-op outside the provider", () => {
    render(
      <>
        <Publish segment={classroom} />
        <Probe />
      </>,
    );
    expect(segments).toEqual([]);
  });
});
