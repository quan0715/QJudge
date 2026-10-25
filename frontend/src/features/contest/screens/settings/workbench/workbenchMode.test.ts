import { describe, expect, it } from "vitest";
import { canGrade, resolveWorkbenchMode } from "./workbenchMode";
describe("workbench mode",()=>{
 it.each([["","draft","edit"],["","published","grade"],["grading_question=q&workbench_mode=edit","draft","grade"],["grading_student=s","published","grade"],["workbench_mode=edit","published","edit"]] as const)("resolves %s for %s",(query,status,want)=>expect(resolveWorkbenchMode(new URLSearchParams(query),{status})).toBe(want));
 it("disables grading for drafts",()=>{expect(canGrade({status:"draft"})).toBe(false);expect(canGrade({status:"published"})).toBe(true)});
});
