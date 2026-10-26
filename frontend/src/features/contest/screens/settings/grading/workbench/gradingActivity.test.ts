import { describe, expect, it } from "vitest";
import { countGradeCsvProgress, gradingActivity, gradeCsvChangeKey } from "./gradingActivity";
import type { CopilotMessage } from "@copilot";
describe("grade CSV progress", () => {
  it("counts zero and decimals, excludes blank, invalid and pre-existing scores", () => {
    const csv = "exam_answer_id,original_score,score\n1,,0\n2,,1.5\n3,,\n4,,no\n5,2,2\n6,,-1\n7,,Infinity\n";
    expect(countGradeCsvProgress(csv)).toEqual({ filled: 2, total: 6 });
  });
  it("deduplicates answer ids and handles quoted multiline cells", () => {
    expect(countGradeCsvProgress('exam_answer_id,score,reason\n1,2,"a\nb"\n1,3,x\n2,0,y')).toEqual({filled:2,total:2});
  });
  it("weights siblings by their actual CSV rows, not milestones", () => {
    expect(gradingActivity({a:{filled:60,total:123}},["a"]).progress).toBeCloseTo(48.78048);
    expect(gradingActivity({a:{filled:2,total:2},b:{filled:0,total:8}},["a","b"]).progress).toBe(20);
    expect(gradingActivity({a:{filled:2,total:2}},["a","b"]).progress).toBe(0);
  });
  it("invalidates only completed CSV mutations or assignment hydration", () => {
    const message: CopilotMessage = {id:"m",role:"assistant",createdAt:new Date(),parts:[
      {type:"tool",toolCallId:"a",toolName:"artifact_csv_patch",input:{filename:"grade_q.csv"},state:"input-ready"},
      {type:"tool",toolCallId:"b",toolName:"artifact_read",input:{filename:"grade_q.csv"},state:"output-ready"},
      {type:"tool",toolCallId:"c",toolName:"artifact_csv_patch",input:{filename:"grade_q.csv"},state:"output-ready"},
    ]};
    expect(gradeCsvChangeKey([message])).toBe("c");
  });
});
