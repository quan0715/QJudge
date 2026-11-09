import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import type { ScoreboardData } from "@/core/entities/contest.entity";
import StudentStandingsTable from "./StudentStandingsTable";
it("shows partial points, judging and attempts without recalculating rank", () => {
  const cell = { status: "WA" as const, tries: 4, time: null, pending: false, score: 30, max_score: 100 };
  const data: ScoreboardData = { contestId:"x", contestName:"Exam", problems:[{id:"a",problemId:"a",label:"A",order:0,score:100},{id:"b",problemId:"b",label:"B",order:1,score:100}], rows:[{userId:"me",displayName:"王同學",rank:4,solvedCount:0,totalScore:30,penalty:0,problems:{a:cell,b:{...cell,status:null,pending:true,score:0}}}] };
  render(<StudentStandingsTable data={data} currentUserId="me" />);
  const row = screen.getByRole("row", {name:/王同學/});
  expect(row).toHaveAttribute("aria-current", "true");
  expect(within(row).getByText("30 / 100")).toBeVisible();
  expect(within(row).getByLabelText(/評測中/)).toBeVisible();
  expect(screen.getByText("#4")).toBeVisible();
});
