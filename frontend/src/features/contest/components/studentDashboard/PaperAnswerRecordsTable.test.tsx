import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import PaperAnswerRecordsTable from "./PaperAnswerRecordsTable";

it("keeps details and appeals inside a expandable row", async () => {
  const appeal = vi.fn();
  render(<PaperAnswerRecordsTable showGrading rows={[{id:"q1",label:"1(a)",typeLabel:"問答題",score:"6 / 10",status:"已批改",tone:"cool-gray",detail:<><p>原作答與批改評語</p><button onClick={appeal}>提出申訴</button></>}]} />);
  expect(screen.getByRole("table", {name:"各題作答紀錄"})).toBeInTheDocument();
  expect(screen.queryByText("原作答與批改評語")).not.toBeInTheDocument();
  expect(screen.queryByRole("button",{name:"提出申訴"})).not.toBeInTheDocument();
  screen.getByRole("button", {name:"展開第 1(a) 題"}).focus();
  fireEvent.click(screen.getByRole("button", {name:"展開第 1(a) 題"}));
  expect(screen.getByRole("region",{name:"第 1(a) 題作答詳情"})).toBeVisible();
  fireEvent.click(screen.getByRole("button",{name:"提出申訴"}));
  expect(appeal).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"收合第 1(a) 題"}));
  expect(screen.queryByRole("button",{name:"提出申訴"})).not.toBeInTheDocument();
});

it("does not expose unpublished scores", () => {
  render(<PaperAnswerRecordsTable showGrading={false} rows={[{id:"q1",label:"1",typeLabel:"問答題",score:"6 / 10",status:"已作答",tone:"cool-gray",detail:<p>原作答</p>}]} />);
  expect(screen.getByText("未公布")).toBeVisible();
  expect(screen.queryByText("6 / 10")).not.toBeInTheDocument();
});
