import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CopilotMessage } from "@copilot";

import { useSessionBadgeSummary } from "./useSessionBadgeSummary";

describe("useSessionBadgeSummary", () => {
  it("derives todos from validated Copilot data parts", () => {
    const messages: CopilotMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        parts: [
          {
            type: "data-todo-items",
            data: [{ id: "todo-1", label: "Grade", status: "pending" }],
          },
        ],
      },
    ];

    const { result } = renderHook(() => useSessionBadgeSummary(messages));

    expect(result.current).toEqual({
      hasTodos: true,
      hasArtifacts: false,
      hasAny: true,
    });
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import { SessionBadges } from "./SessionBadges";
import { useOptionalArtifactPanel } from "@/features/chatbot/contexts/ArtifactPanelContext";
vi.mock("@/features/chatbot/contexts/ArtifactPanelContext", () => ({useOptionalArtifactPanel: vi.fn(() => null)}));
beforeEach(() => { vi.mocked(useOptionalArtifactPanel).mockReturnValue(null); });
const todoMessages: CopilotMessage[] = [{id:"todo-message",role:"assistant",createdAt:new Date(),parts:[{type:"data-todo-items",data:[{id:"one",label:"檢查題目",status:"pending"}]}]}];

describe("SessionBadges controls", () => {
  it("opens todos and closes with Escape while returning focus to its trigger", () => {
    render(<SessionBadges messages={todoMessages} inline />);
    const trigger=screen.getByRole("button",{name:/任務列表/});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded","true");
    expect(screen.getByRole("region",{name:"任務列表"})).toHaveTextContent("檢查題目");
    expect(screen.getByRole("img", { name: "待處理" })).toBeInTheDocument();
    fireEvent.keyDown(document,{key:"Escape"});
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("switches between todos and files, then opens the selected artifact and dismisses the list", () => {
    const open=vi.fn();
    vi.mocked(useOptionalArtifactPanel).mockReturnValue({
      isOpen:false,open,close:vi.fn(),toggle:vi.fn(),activeArtifactId:null,setActiveArtifactId:vi.fn(),isLoading:false,error:null,refresh:vi.fn(),markToolFinished:vi.fn(),
      artifacts:[{artifact_id:"report",session_id:"session",produced_by_run_id:null,step:"default",filename:"report.csv",content_type:"text/csv",size_bytes:128,checksum:"",metadata:{},created_at:"",updated_at:""}],
    });
    render(<SessionBadges messages={todoMessages} inline />);
    fireEvent.click(screen.getByRole("button",{name:/任務列表/}));
    fireEvent.click(screen.getByRole("button",{name:/檔案列表/}));
    expect(screen.queryByRole("region",{name:"任務列表"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/report.csv/}));
    expect(open).toHaveBeenCalledWith("report");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
  it("dismisses the list on outside interaction", () => {
    render(<><SessionBadges messages={todoMessages} inline /><textarea aria-label="Draft" /></>);
    fireEvent.click(screen.getByRole("button",{name:/任務列表/}));
    fireEvent.mouseDown(screen.getByRole("textbox"));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
