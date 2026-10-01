import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PageContextSegment } from "@/core/types/chatbot.types";
import {
  PageContextProvider,
  usePublishPageContext,
} from "@/shared/contexts/PageContextProvider";
import {
  PageContextAttachmentProvider,
  usePageContextAttachment,
} from "./PageContextAttachmentProvider";

const PATH = "/classrooms/c1/contest/A/admin?panel=problem_editor";
const classroom: PageContextSegment = {
  type: "classroom",
  label: "資工一甲",
  ids: { classroom_id: "c1" },
};
const midterm: PageContextSegment = {
  type: "contest",
  label: "期中考",
  ids: { contest_id: "A" },
};
const final: PageContextSegment = {
  type: "contest",
  label: "期末考",
  ids: { contest_id: "B" },
};
const problemA: PageContextSegment = {
  type: "problem",
  label: "A. A+B",
  ids: { binding_id: "b1", problem_id: "p1" },
};
const problemB: PageContextSegment = {
  type: "problem",
  label: "B. Sort",
  ids: { binding_id: "b2", problem_id: "p2" },
};

function Publish({ segment }: { segment: PageContextSegment }) {
  usePublishPageContext(segment);
  return null;
}

const seen = {} as { attachment: ReturnType<typeof usePageContextAttachment> };
function Probe() {
  const current = usePageContextAttachment();
  useEffect(() => {
    seen.attachment = current;
  });
  return null;
}

function tree(segments: PageContextSegment[]) {
  return (
    <MemoryRouter initialEntries={[PATH]}>
      <PageContextProvider>
        <PageContextAttachmentProvider>
          {segments.map((segment) => (
            <Publish key={segment.type} segment={segment} />
          ))}
          <Probe />
        </PageContextAttachmentProvider>
      </PageContextProvider>
    </MemoryRouter>
  );
}

function take(): Record<string, unknown> {
  let metadata: Record<string, unknown> = {};
  act(() => {
    metadata = seen.attachment.takeRunMetadata();
  });
  return metadata;
}

describe("PageContextAttachmentProvider", () => {
  it("labels and attaches the current page", () => {
    render(tree([problemA, midterm, classroom]));

    expect(seen.attachment.label).toBe("資工一甲 / 期中考 / A. A+B");
    expect(take()).toEqual({
      pageContext: { path: PATH, segments: [classroom, midterm, problemA] },
    });
  });

  it("sends a context the AI service accepts for very long names", () => {
    render(tree([classroom, { ...midterm, label: "長".repeat(255) }]));

    const metadata = take() as { pageContext: { segments: { label: string }[] } };
    expect(metadata.pageContext.segments[1].label).toHaveLength(200);
  });

  it("skips one message after dismissal and re-arms after sending", () => {
    render(tree([classroom, midterm]));

    act(() => seen.attachment.dismiss());
    expect(seen.attachment.label).toBeNull();
    expect(take()).toEqual({});
    expect(seen.attachment.label).toBe("資工一甲 / 期中考");
  });

  it("re-arms when the contest changes", () => {
    const view = render(tree([classroom, midterm]));
    act(() => seen.attachment.dismiss());

    view.rerender(tree([classroom, final]));

    expect(seen.attachment.label).toBe("資工一甲 / 期末考");
  });

  it("stays dismissed when only the problem changes", () => {
    const view = render(tree([classroom, midterm, problemA]));
    act(() => seen.attachment.dismiss());

    view.rerender(tree([classroom, midterm, problemB]));

    expect(seen.attachment.label).toBeNull();
  });

  it("attaches nothing when no page published a segment", () => {
    render(tree([]));

    expect(seen.attachment.label).toBeNull();
    expect(take()).toEqual({});
  });
});
