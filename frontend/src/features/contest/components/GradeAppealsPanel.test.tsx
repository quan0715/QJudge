import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import GradeAppealsPanel from "./GradeAppealsPanel";

vi.mock("../hooks/useGradeAppeals", () => ({ useGradeAppeals: () => ({
  appeals: [{id: 9, student_id: 12, student_username: "student", question_id: "second-question", question_order: 1, status: "open", last_message_at: "2026-10-03T00:00:00Z"}],
  loading: false, error: "", refresh: vi.fn(),
}) }));
vi.mock("./GradeAppealDialog", () => ({ default: ({gradingHref}: {gradingHref: string}) => <a href={gradingHref}>前往批改</a> }));

it("links to the grading mode that accepts both question and student selection", () => {
  render(<MemoryRouter initialEntries={["/classrooms/room/contest/exam/admin"]}><GradeAppealsPanel contestId="exam" /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", {name: "查看申訴 #9"}));
  const url = new URL(screen.getByRole("link", {name: "前往批改"}).getAttribute("href")!, "http://localhost");
  expect(url.pathname).toBe("/classrooms/room/contest/exam/admin");
  expect(Object.fromEntries(url.searchParams)).toEqual({panel: "grading", grading_view: "byQuestion", grading_student: "12", grading_question: "second-question"});
});
