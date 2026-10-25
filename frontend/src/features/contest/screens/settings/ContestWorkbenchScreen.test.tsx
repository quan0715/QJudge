import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ContestDetail } from "@/core/entities/contest.entity";
import ContestWorkbenchScreen from "./ContestWorkbenchScreen";
vi.mock("./ContestGradingWorkbenchScreen",()=>({default:({header}:{header:ReactNode})=><div>{header}</div>}));
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(_k:string,fallback:string)=>fallback})}));
vi.mock("./workbench/edit/WorkbenchEditScreen",()=>({default:({header}:{header:ReactNode})=><div>{header}</div>}));
function Location(){return <output data-testid="query">{useLocation().search}</output>}
function setup(status:string,query=""){return render(<MemoryRouter initialEntries={["/?"+query]}><ContestWorkbenchScreen contestId="c" contest={{id:"c",status} as ContestDetail}/><Location/></MemoryRouter>)}
describe("workbench shell",()=>{
 it("draft grading is disabled with a reason",()=>{setup("draft");expect(screen.getByRole("tab",{name:"批改"})).toBeDisabled();expect(screen.getByRole("tab",{name:"批改"})).toHaveAttribute("title","考試開始後才能批改")});
 it("switches to edit and clears grading deep links",async()=>{setup("published","grading_question=q&grading_student=s");fireEvent.click(await screen.findByRole("tab",{name:"編輯"}));expect(screen.getByTestId("query")).toHaveTextContent("workbench_mode=edit");expect(screen.getByTestId("query")).not.toHaveTextContent("grading_question")});
});
