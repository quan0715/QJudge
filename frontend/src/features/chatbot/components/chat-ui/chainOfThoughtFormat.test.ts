import { describe, expect, it } from "vitest";
import { formatSubagentResult, subagentTitle } from "./chainOfThoughtFormat";

describe("legacy subagent presentation", () => {
  it("extracts double-quoted content without decoding literal backslashes twice", () => {
    const repr = String.raw`Command(update={'messages':[ToolMessage(content="## Q2\n\nC:\\temp\n\u4e2d\u6587", tool_call_id='T1')]})`;
    expect(formatSubagentResult(repr)).toBe("## Q2\n\nC:\\temp\n中文");
  });

  it("accepts structured messages and leaves unrecognized Command data intact", () => {
    expect(formatSubagentResult({ update: { messages: [{ content: "**done**" }] } })).toBe("**done**");
    const malformed = "Command(update={'messages': [unexpected()]})";
    expect(formatSubagentResult(malformed)).toBe(malformed);
  });

  it("uses descriptions directly and only falls back when absent", () => {
    const task = {type: "tool" as const, toolCallId: "t1", toolName: "task", state: "input-ready" as const};
    expect(subagentTitle({...task, input: {description: "整理題庫\n詳細工作"}}, "子代理")).toBe("整理題庫");
    expect(subagentTitle({...task, input: {description: "question_123"}}, "子代理")).toBe("question_123");
    expect(subagentTitle({...task, input: {prompt: "批改第2題"}}, "子代理")).toBe("子代理");
  });
});
