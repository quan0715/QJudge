import { describe, expect, it } from "vitest";
import type { ParticipantDashboard } from "@/core/entities/contest.entity";
import { getParticipantKpis } from "./participantKpis";

const t = (_key: string, fallback: string) => fallback;

const dashboard = (
  contestType: "paper_exam" | "coding",
  overview: Partial<ParticipantDashboard["overview"]>,
  participant: Partial<ParticipantDashboard["participant"]> = {},
) =>
  ({
    contestType,
    participant: { userId: "7", username: "s7", violationCount: 0, ...participant },
    overview: { totalScore: 0, maxScore: 100, ...overview },
  }) as unknown as ParticipantDashboard;

describe("getParticipantKpis", () => {
  it("uses solved/totalProblems and acceptedRate for coding and hides violations when disabled", () => {
    const kpis = getParticipantKpis(
      dashboard("coding", { solved: 2, totalProblems: 5, acceptedRate: 40 }),
      { showViolations: false, t },
    );
    expect(kpis.map((kpi) => kpi.key)).toEqual(["time", "score", "accuracy", "progress"]);
    expect(kpis.find((kpi) => kpi.key === "progress")?.value).toBe("2 / 5 題");
    expect(kpis.find((kpi) => kpi.key === "accuracy")?.value).toBe("40%");
  });

  it("uses graded questions and correct rate for paper exams", () => {
    const kpis = getParticipantKpis(
      dashboard("paper_exam", { totalScore: 64, maxScore: 100, gradedCount: 15, totalQuestions: 15, correctRate: 53.3 }),
      { showViolations: true, t },
    );
    expect(kpis.find((kpi) => kpi.key === "score")?.value).toBe("64.00 / 100.00 分");
    expect(kpis.find((kpi) => kpi.key === "progress")?.value).toBe("15 / 15 題");
    expect(kpis.find((kpi) => kpi.key === "accuracy")?.value).toBe("53.3%");
  });

  it("marks violations as danger only when there are some", () => {
    const none = getParticipantKpis(dashboard("paper_exam", {}), { showViolations: true, t });
    const some = getParticipantKpis(dashboard("paper_exam", {}, { violationCount: 8 }), { showViolations: true, t });
    expect(none.find((kpi) => kpi.key === "violations")).toMatchObject({ value: "0 次", tone: undefined });
    expect(some.find((kpi) => kpi.key === "violations")).toMatchObject({ value: "8 次", tone: "danger" });
  });

  it("shows a dash for missing accuracy and times", () => {
    const kpis = getParticipantKpis(dashboard("paper_exam", {}), { showViolations: false, t });
    expect(kpis.find((kpi) => kpi.key === "accuracy")?.value).toBe("-");
    expect(kpis.find((kpi) => kpi.key === "time")?.value).toBe("- → -");
  });
});
