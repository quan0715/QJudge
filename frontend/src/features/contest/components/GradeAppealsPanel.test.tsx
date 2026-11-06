import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { GradeAppealDetail } from "@/core/entities/gradeAppeal.entity";
import * as api from "@/infrastructure/api/repositories/gradeAppeals.repository";
import { EnvelopeError } from "@/infrastructure/api/envelope";
import GradeAppealsPanel from "./GradeAppealsPanel";

vi.mock("@/infrastructure/api/repositories/gradeAppeals.repository");
vi.mock("@/features/auth/contexts/AuthContext", () => ({ useAuth: () => ({ user: {
  id: 1, username: "teacher", profile: { avatar_url: "https://example.com/teacher.png" },
} }) }));
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./exam/AnswerDisplay", () => ({ default: () => <div>Saved answer</div> }));
vi.mock("@/shared/ui/markdown/MarkdownRenderer", () => ({ default: ({ children }: {children: string}) => <div>{children}</div> }));

const ticket: GradeAppealDetail = {
  id: 9, exam_answer: 5, student_id: 12, student_username: "student", student_avatar_url: "https://example.com/student.png",
  question_id: "second-question", question_order: 1, question_label: "1(b)", question_prompt: "Explain",
  status: "open", waiting_for: "staff", created_at: "2026-10-03T00:00:00Z", closed_at: null, closed_by: null,
  last_message_at: "2026-10-03T00:00:00Z", current_score: 6, current_max_score: 10, answer_format: "plain_text",
  answer: { answer: {text:"Answer"}, question_type: "essay", question_options: [], feedback: "Original" },
  messages: [{ id: 1, author_id: 12, author_username: "student", author_avatar_url: "https://example.com/student.png", content: "Please review", created_at: "2026-10-03T00:00:00Z" }],
};
const renderPanel = (refreshKey = 0) => <MemoryRouter initialEntries={["/classrooms/room/contest/exam/admin"]}><GradeAppealsPanel contestId="exam" refreshKey={refreshKey} /></MemoryRouter>;
const row = () => screen.getByRole("button", {name: /student.*1\(b\).*#9/});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getGradeAppeals).mockResolvedValue([ticket]);
  vi.mocked(api.getGradeAppeal).mockResolvedValue(ticket);
});

it("opens the conversation in place from the row and keeps the grading destination", async () => {
  render(renderPanel());
  await screen.findByText("1(b).");
  expect(row()).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", {name: /查看申訴|重新整理申訴/})).not.toBeInTheDocument();
  expect(api.getGradeAppeal).not.toHaveBeenCalled();
  fireEvent.click(row());
  await screen.findByText("Please review");
  expect(row()).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const url = new URL(screen.getByRole("link", {name: "前往批改"}).getAttribute("href")!, "http://localhost");
  expect(url.pathname).toBe("/classrooms/room/contest/exam/admin");
  expect(Object.fromEntries(url.searchParams)).toEqual({panel: "grading-workbench", grading_student: "12", grading_question: "second-question"});
});

it("keeps the draft and a single conversation instance through repeated toggles", async () => {
  render(renderPanel());
  await screen.findByText("1(b).");
  fireEvent.click(row());
  await screen.findByText("Please review");
  fireEvent.change(screen.getByRole("textbox"), {target:{value:"Unsent reply"}});
  for (let i = 0; i < 3; i++) {
    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row());
    expect(row()).toHaveAttribute("aria-expanded", "true");
  }
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getByRole("textbox")).toHaveValue("Unsent reply");
  expect(api.getGradeAppeal).toHaveBeenCalledOnce();
});

it("updates the row and conversation to waiting for the student after a reply, then closes", async () => {
  const replied = { ...ticket, waiting_for: "student" as const, messages: [...ticket.messages, {
    id: 2, author_id: 1, author_username: "teacher", author_avatar_url: "https://example.com/teacher.png", content: "Reviewed", created_at: "2026-10-03T01:00:00Z",
  }] };
  vi.mocked(api.sendGradeAppealMessage).mockResolvedValue(replied);
  vi.mocked(api.closeGradeAppeal).mockResolvedValue({...replied, status:"closed", waiting_for:null, closed_by:1});
  render(renderPanel());
  await screen.findByText("1(b).");
  expect(within(row()).getByText("等待教師回覆")).toBeInTheDocument();
  fireEvent.click(row());
  await screen.findByText("Please review");
  fireEvent.change(screen.getByRole("textbox"), {target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button", {name:"送出回覆"}));
  await screen.findByText("Reviewed");
  expect(within(row()).getByText("等待考生回覆")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(row()).toHaveAttribute("aria-expanded", "true");
  expect(api.getGradeAppeals).toHaveBeenCalledOnce();
  expect(api.sendGradeAppealMessage).toHaveBeenCalledOnce();
  vi.mocked(api.getGradeAppeal).mockResolvedValue({...replied, waiting_for:"staff"});
  fireEvent.click(screen.getByRole("button", {name:"重新整理留言"}));
  await waitFor(() => expect(within(row()).getByText("等待教師回覆")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", {name:"結案"}));
  await screen.findByText("此申訴已結案，可查閱對話。");
  expect(within(row()).getByText("已結案")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("uses actual avatars in the row, messages and composer, falling back only where absent", async () => {
  vi.mocked(api.getGradeAppeals).mockResolvedValue([ticket, {...ticket, id:10, student_username:"No avatar", student_avatar_url:null}]);
  render(renderPanel());
  await waitFor(() => expect(screen.getByRole("img", {name:"student"})).toHaveAttribute("src", ticket.student_avatar_url));
  const noAvatar = screen.getByRole("button", {name:/No avatar/});
  expect(within(noAvatar).queryByRole("img")).not.toBeInTheDocument();
  expect(within(noAvatar).getByText("N", {exact:true})).toBeInTheDocument();
  fireEvent.click(row());
  await screen.findByText("Please review");
  expect(screen.getAllByRole("img", {name:"student"})).toHaveLength(2);
  expect(screen.getByRole("img", {name:"teacher"})).toHaveAttribute("src", "https://example.com/teacher.png");
});

it("refreshes appeals from the existing overview refresh signal", async () => {
  const view = render(renderPanel());
  await screen.findByText("1(b).");
  fireEvent.click(row());
  await screen.findByText("Please review");
  fireEvent.change(screen.getByRole("textbox"), {target:{value:"Keep this draft"}});
  vi.mocked(api.getGradeAppeals).mockResolvedValue([{...ticket, waiting_for:"student"}]);
  vi.mocked(api.getGradeAppeal).mockResolvedValue({...ticket, waiting_for:"student"});
  view.rerender(renderPanel(1));
  await waitFor(() => expect(within(row()).getByText("等待考生回覆")).toBeInTheDocument());
  expect(row()).toHaveAttribute("aria-expanded", "true");
  expect(await screen.findByRole("textbox")).toHaveValue("Keep this draft");
  expect(api.getGradeAppeals).toHaveBeenCalledTimes(2);
  expect(api.getGradeAppeal).toHaveBeenCalledTimes(2);
});

it("refreshes an expanded conversation when another teacher has closed the appeal", async () => {
  const view = render(renderPanel());
  await screen.findByText("1(b).");
  fireEvent.click(row());
  await screen.findByText("Please review");
  const closed = {...ticket, status:"closed" as const, waiting_for:null};
  vi.mocked(api.getGradeAppeals).mockResolvedValue([closed]);
  vi.mocked(api.getGradeAppeal).mockResolvedValue(closed);
  view.rerender(renderPanel(1));
  await screen.findByText("此申訴已結案，可查閱對話。");
  expect(within(row()).getByText("已結案")).toBeInTheDocument();
  expect(row()).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

it("synchronizes a stale row with newer details on its first expansion", async () => {
  vi.mocked(api.getGradeAppeal).mockResolvedValue({...ticket, status:"closed", waiting_for:null});
  render(renderPanel());
  await screen.findByText("1(b).");
  expect(within(row()).getByText("等待教師回覆")).toBeInTheDocument();
  fireEvent.click(row());
  await screen.findByText("此申訴已結案，可查閱對話。");
  expect(within(row()).getByText("已結案")).toBeInTheDocument();
  expect(api.getGradeAppeal).toHaveBeenCalledOnce();
});

it("preserves drafts after a network refresh failure but clears private data when access is denied", async () => {
  const view = render(renderPanel());
  await screen.findByText("1(b).");
  fireEvent.click(row());
  await screen.findByText("Please review");
  fireEvent.change(screen.getByRole("textbox"), {target:{value:"Keep this draft"}});
  vi.mocked(api.getGradeAppeals).mockRejectedValueOnce(new TypeError("Offline"));
  view.rerender(renderPanel(1));
  await screen.findByText("Offline");
  expect(row()).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
  vi.mocked(api.getGradeAppeals).mockRejectedValueOnce(new EnvelopeError(403, [{code:"forbidden", message:"Access denied"}]));
  view.rerender(renderPanel(2));
  await screen.findByText("Access denied");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByText("Please review")).not.toBeInTheDocument();
  expect(screen.queryByText("student")).not.toBeInTheDocument();
});

it("keeps closed rows closed even when their last reply was from a student", async () => {
  vi.mocked(api.getGradeAppeals).mockResolvedValue([{...ticket, status:"closed", waiting_for:"staff"}]);
  render(renderPanel());
  await screen.findByText("已結案");
  expect(screen.queryByText("等待教師回覆")).not.toBeInTheDocument();
});

it.each(["reply", "close"] as const)("keeps a successful %s when Reset started during the request returns an older snapshot", async action => {
  const view = render(renderPanel());
  await screen.findByText("1(b).");
  fireEvent.click(row());
  await screen.findByText("Please review");
  const updated: GradeAppealDetail = action === "close"
    ? {...ticket, status:"closed", waiting_for:null, closed_by:1}
    : {...ticket, waiting_for:"student", messages:[...ticket.messages, {
      id:2, author_id:1, author_username:"teacher", content:"Reviewed original answer", created_at:"2026-10-03T01:00:00Z",
    }]};
  const mutation = deferred<GradeAppealDetail>();
  const oldList = deferred<GradeAppealDetail[]>();
  const oldDetail = deferred<GradeAppealDetail>();
  let saved = false;
  vi.mocked(api.getGradeAppeals).mockReturnValue(oldList.promise);
  vi.mocked(api.getGradeAppeal).mockImplementation(() => saved ? Promise.resolve({...updated, current_score:8}) : oldDetail.promise);
  vi.mocked(api.sendGradeAppealMessage).mockReturnValue(mutation.promise);
  vi.mocked(api.closeGradeAppeal).mockReturnValue(mutation.promise);
  if (action === "reply") fireEvent.change(screen.getByRole("textbox"), {target:{value:"Reviewed original answer"}});
  fireEvent.click(screen.getByRole("button", {name:action === "reply" ? "送出回覆" : "結案", exact:true}));
  view.rerender(renderPanel(1));
  view.rerender(renderPanel(2));
  await act(async () => { saved = true; mutation.resolve(updated); });
  // A slow list may still contain a pre-write snapshot and a new unrelated appeal.
  await act(async () => {
    oldDetail.resolve(ticket);
    oldList.resolve([ticket, {...ticket, id:10, student_username:"another student"}]);
  });
  await waitFor(() => expect(within(row()).getByText(action === "close" ? "已結案" : "等待考生回覆")).toBeInTheDocument());
  expect(screen.getByText("another student")).toBeInTheDocument();
  expect(screen.getByText(/目前成績 8\.00 \/ 10\.00/)).toBeInTheDocument();
  if (action === "close") {
    expect(screen.getByText("此申訴已結案，可查閱對話。")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  } else {
    expect(screen.getByText("Reviewed original answer")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  }
});

it("keeps a reply in the row when an earlier list refresh finishes after the reply", async () => {
  const view = render(renderPanel());
  await screen.findByText("1(b).");
  fireEvent.click(row());
  await screen.findByText("Please review");
  const oldList = deferred<GradeAppealDetail[]>();
  vi.mocked(api.getGradeAppeals).mockReturnValue(oldList.promise);
  view.rerender(renderPanel(1));
  const input = await screen.findByRole("textbox");
  vi.mocked(api.sendGradeAppealMessage).mockResolvedValue({...ticket, waiting_for:"student"});
  fireEvent.change(input, {target:{value:"Reviewed"}});
  fireEvent.click(screen.getByRole("button", {name:"送出回覆"}));
  await waitFor(() => expect(within(row()).getByText("等待考生回覆")).toBeInTheDocument());
  await act(async () => { oldList.resolve([ticket]); });
  expect(within(row()).getByText("等待考生回覆")).toBeInTheDocument();
});
