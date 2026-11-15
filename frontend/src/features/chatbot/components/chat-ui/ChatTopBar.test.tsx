import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CopilotSessionSummary } from "@copilot";
import { ChatTopBar } from "./ChatTopBar";
vi.mock("@/features/app/components/WorkspaceToolBar", () => ({ WorkspaceToolBar: ({title, actions}: {title: ReactNode; actions: ReactNode}) => <div>{title}{actions}</div> }));
it("switches sessions with the keyboard and closes on Escape", () => {
  const onSelectSession = vi.fn();
  render(<ChatTopBar mode="full" sessions={[{id:"a",title:"Alpha"},{id:"b",title:"Beta"}] as CopilotSessionSummary[]} currentSessionId="a" title="Alpha" onSelectSession={onSelectSession} onNewChat={vi.fn()} onRenameSession={vi.fn()} onDeleteSession={vi.fn()} />);
  const trigger = screen.getByRole("combobox");
  trigger.focus();
  fireEvent.keyDown(trigger, {key:"ArrowDown"});
  fireEvent.keyDown(trigger, {key:"End"});
  fireEvent.keyDown(trigger, {key:"Enter"});
  expect(onSelectSession).toHaveBeenCalledWith("b");
  expect(trigger).toHaveFocus();
  fireEvent.keyDown(trigger, {key:"ArrowDown"});
  fireEvent.keyDown(trigger, {key:"Escape"});
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterAll(() => { HTMLElement.prototype.scrollIntoView = originalScrollIntoView; });
