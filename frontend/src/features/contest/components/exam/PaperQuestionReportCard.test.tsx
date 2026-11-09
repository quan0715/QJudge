import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import PaperQuestionReportCard from "./PaperQuestionReportCard";
it("does not mark an answer wrong when the teacher answer key is unavailable", () => {
  render(<PaperQuestionReportCard questionId="q" index={1} questionType="single_choice" typeLabel="單選" prompt="Question" options={["My selection", "Other"]} answer={{selected:0}} statusLabel="正確" statusTone="green" showGrading score={5} maxScore={5} />);
  expect(screen.getByText("My selection").closest('[class*="optionItem"]')?.className).not.toContain("optionSelectedWrong");
});
