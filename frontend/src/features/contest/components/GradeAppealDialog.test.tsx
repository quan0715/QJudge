import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import GradeAppealDialog from "./GradeAppealDialog";
import * as api from "@/infrastructure/api/repositories/gradeAppeals.repository";

vi.mock("@/infrastructure/api/repositories/gradeAppeals.repository");
vi.mock("@/shared/contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./exam/AnswerDisplay", () => ({ default: () => <div>Saved answer</div> }));
vi.mock("@/shared/ui/markdown/MarkdownRenderer", () => ({ default: ({ children }: {children: string}) => <div>{children}</div> }));
const ticket = {
  id: 7, exam_answer: 5, question_id: "q1", question_order: 0, question_prompt: "Explain", student_id: 2,
  student_username: "student", status: "open" as const, created_at: "2026-10-03T00:00:00Z", closed_at: null,
  closed_by: null, last_message_at: "2026-10-03T00:00:00Z", current_score: 6, current_max_score: 10,
  answer_format: "plain_text" as const, answer: { answer: {text:"Answer"}, question_type: "essay" as const, question_options: [], feedback: "Original" },
  messages: [{ id: 1, author_id: 2, author_username: "student", content: "Please review", created_at:"2026-10-03T00:00:00Z" }],
};

it("preserves failed replies and only closes on the separate staff action", async () => {
  vi.mocked(api.getGradeAppeal).mockResolvedValue(ticket);
  vi.mocked(api.sendGradeAppealMessage).mockRejectedValueOnce(new Error("Offline"));
  vi.mocked(api.closeGradeAppeal).mockResolvedValue({...ticket,status:"closed",closed_at:"2026-10-03T01:00:00Z",closed_by:1});
  render(<GradeAppealDialog contestId="c1" appealId={7} managing onClose={vi.fn()} onChanged={vi.fn()} />);
  await screen.findByText("Please review");
  fireEvent.change(screen.getByLabelText("留言內容"),{target:{value:"A reply"}});
  fireEvent.click(screen.getByRole("button",{name:"送出留言"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"送出留言"})).not.toBeDisabled());
  expect(screen.getByLabelText("留言內容")).toHaveValue("A reply");
  expect(api.closeGradeAppeal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"結案"}));
  await screen.findByText("此申訴已結案，可查閱對話。",{exact:false});
  expect(screen.queryByLabelText("留言內容")).not.toBeInTheDocument();
});

it("hides cached private content after refresh is denied", async () => {
  vi.mocked(api.getGradeAppeal).mockResolvedValueOnce(ticket).mockRejectedValueOnce(new Error("成績尚未公布"));
  render(<GradeAppealDialog contestId="c1" appealId={7} managing={false} onClose={vi.fn()} onChanged={vi.fn()} />);
  await screen.findByText("Please review");
  expect(screen.queryByRole("button",{name:"結案"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"重新整理留言"}));
  await screen.findByText("成績尚未公布");
  expect(screen.queryByText("Please review")).not.toBeInTheDocument();
});

it("keeps a draft when another tab already created the ticket", async () => {
  vi.mocked(api.createGradeAppeal).mockResolvedValue({ ...ticket, created: false });
  render(<GradeAppealDialog contestId="c1" answerId={5} managing={false} onClose={vi.fn()} onChanged={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("申訴理由"), {target:{value:"My unsent explanation"}});
  fireEvent.click(screen.getByRole("button", {name:"送出申訴"}));
  await screen.findByText("Please review");
  expect(screen.getByLabelText("留言內容")).toHaveValue("My unsent explanation");
});
