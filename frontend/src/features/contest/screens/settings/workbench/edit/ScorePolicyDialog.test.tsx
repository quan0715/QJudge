import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { questionFixture } from "@/test/fixtures/examPaper";
import { ScorePolicyDialog } from "./ScorePolicyDialog";
const mocks=vi.hoisted(()=>({setPolicy:vi.fn(),showToast:vi.fn()}));
vi.mock("@/infrastructure/api/repositories/examQuestions.repository",()=>({setExamQuestionScorePolicy:mocks.setPolicy}));
vi.mock("@/features/contest/contexts",()=>({useContest:()=>({contest:{id:"c1"}})}));
vi.mock("@/shared/contexts/ToastContext",()=>({useToast:()=>({showToast:mocks.showToast})}));
vi.mock("react-i18next",()=>({useTranslation:()=>({t:(key:string,fallback:string,values?:Record<string,unknown>)=>fallback.replace(/\{\{(\w+)\}\}/g,(_,k)=>String(values?.[k]??""))})}));
const base=()=>({open:true,question:questionFixture("q8",{score:15}),label:"第 8 題",paperTotal:100,sampleTarget:{label:"第 1 題",score:5},affectedStudents:38,onClose:vi.fn(),onApplied:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();mocks.setPolicy.mockResolvedValue(questionFixture("q8"));});
describe("score policy dialog",()=>{
 it("keeps the total with redistribution to all normal questions",async()=>{render(<ScorePolicyDialog {...base()}/>);fireEvent.click(screen.getByRole("radio",{name:"不計分"}));fireEvent.click(screen.getByRole("radio",{name:"總分維持 100 分"}));fireEvent.click(screen.getByRole("button",{name:"套用"}));await waitFor(()=>expect(mocks.setPolicy).toHaveBeenCalledWith("c1","q8","redistribute",{redistribute_to:[]}));});
 it("lowers the total with excluded policy",async()=>{render(<ScorePolicyDialog {...base()}/>);fireEvent.click(screen.getByRole("radio",{name:"不計分"}));fireEvent.click(screen.getByRole("radio",{name:"總分降為 85 分"}));fireEvent.click(screen.getByRole("button",{name:"套用"}));await waitFor(()=>expect(mocks.setPolicy).toHaveBeenCalledWith("c1","q8","excluded",undefined));});
 it("preselects exclusion and keep-total for redistribute",()=>{render(<ScorePolicyDialog {...base()} question={questionFixture("q8",{score:15,scorePolicy:"redistribute"})}/>);expect(screen.getByRole("radio",{name:"不計分"})).toBeChecked();expect(screen.getByRole("radio",{name:"總分維持 100 分"})).toBeChecked();expect(screen.getByText(/5 分 → 5.88 分/)).toBeTruthy();});
});
