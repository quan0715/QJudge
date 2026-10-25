import { expect, it } from "vitest";
import type { TFunction } from "i18next";
import { paperFixture } from "@/test/fixtures/examPaper";
import { buildEditRailRows } from "./editRailModel";
const t=((key:string,fallback:string,values?:Record<string,unknown>)=>fallback.replace(/\{\{(\w+)\}\}/g,(_,k)=>String(values?.[k]??""))) as TFunction;
it("labels groups as a main question with lettered children",()=>{
 const rows=buildEditRailRows(paperFixture(),[{questionId:"c2",kind:"missingAnswer",field:"answer"}],t);
 expect(rows.map(r=>r.label)).toEqual(["第 1 題","第 2 題（題組）","2(a)","2(b)","第 3 題"]);
 expect(rows.filter(r=>r.hasIssue).map(r=>r.key)).toEqual(["c2"]);
});
it("keeps an empty group and its main-question number",()=>{
 const paper=paperFixture();if(paper.blocks[1].kind==="group")paper.blocks[1].children=[];
 const rows=buildEditRailRows(paper,[],t);expect(rows[1].typeText).toContain("尚無子題");expect(rows[2].label).toBe("第 3 題");
});

it("shows redistributed points once and excluded points as zero",()=>{
 const paper=paperFixture();paper.questions[0].scorePolicy="redistribute";paper.questions[1].effectiveMaxScore=7.5;paper.questions[2].scorePolicy="excluded";paper.questions[3].effectiveMaxScore=7.5;
 const rows=buildEditRailRows(paper,[],t);expect(rows.filter(r=>r.kind!=="group").map(r=>r.score)).toEqual([0,7.5,0,7.5]);
});
