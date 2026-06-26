/**
 * Score policy impact simulation.
 *
 * Mirrors backend ExamScoringService for display-only "what-if" preview.
 * The backend remains the source of truth for persisted scores.
 */
import type { ExamQuestionScorePolicy } from "@/core/entities/contest.entity";
import { roundScore } from "@/features/contest/utils/scoreFormat";
import type { GradingAnswerRow, QuestionProgress } from "./gradingTypes";

// ── Internal types ─────────────────────────────────────────────────────────

interface SimQuestion {
  id: string;
  maxScore: number;
  scorePolicy: ExamQuestionScorePolicy;
  /** From score_policy_config.redistribute_to. Empty = distribute to all normal questions. */
  redistributeTargetIds: string[];
}

// ── Public types ───────────────────────────────────────────────────────────

export interface ScoreDistributionBucket {
  rangeLabel: string;
  count: number;
}

export interface ScoreImpactResult {
  beforeScores: number[];
  afterScores: number[];
  beforeMax: number;
  afterMax: number;
  beforeAvg: number;
  afterAvg: number;
  /** 10 percent-of-max buckets ("0-10%", …, "90-100%") */
  beforeDistribution: ScoreDistributionBucket[];
  afterDistribution: ScoreDistributionBucket[];
}

export interface SimulateImpactInput {
  questions: QuestionProgress[];
  /** All participant student IDs — including those with no answers. */
  studentIds: string[];
  answersByStudent: Map<string, GradingAnswerRow[]>;
  targetQuestionId: string;
  newPolicy: ExamQuestionScorePolicy;
  /** For redistribute: selected target question IDs. Empty = all normal questions. */
  redistributeTargetIds?: string[];
}

// ── Core simulation — mirrors ExamScoringService._compute_effective_max ───

function simulateEffectiveMax(questions: SimQuestion[]): Map<string, number> {
  const effectiveMax = new Map<string, number>();
  const normalIds = new Set(questions.filter((q) => q.scorePolicy === "normal").map((q) => q.id));

  // Initialise: non-contributing questions get 0, others get their base score
  for (const q of questions) {
    effectiveMax.set(
      q.id,
      q.scorePolicy === "excluded" || q.scorePolicy === "redistribute" ? 0 : q.maxScore,
    );
  }

  // Distribute each redistribute source proportionally to its valid targets
  for (const r of questions) {
    if (r.scorePolicy !== "redistribute") continue;

    // Backend filters targets to normal questions only (excludes full_marks/excluded/redistribute)
    const specified = r.redistributeTargetIds.filter((id) => normalIds.has(id));
    const targetIds = specified.length > 0 ? new Set(specified) : normalIds;

    const targets = questions.filter((q) => targetIds.has(q.id));
    const totalTargetScore = targets.reduce((sum, q) => sum + q.maxScore, 0);
    if (totalTargetScore <= 0) continue;

    for (const t of targets) {
      const bonus = r.maxScore * (t.maxScore / totalTargetScore);
      effectiveMax.set(t.id, (effectiveMax.get(t.id) ?? 0) + bonus);
    }
  }

  return effectiveMax;
}

function totalMax(questions: SimQuestion[], effectiveMax: Map<string, number>): number {
  let sum = 0;
  for (const q of questions) {
    if (q.scorePolicy === "excluded" || q.scorePolicy === "redistribute") continue;
    sum += q.scorePolicy === "full_marks" ? q.maxScore : (effectiveMax.get(q.id) ?? q.maxScore);
  }
  return roundScore(sum);
}

function studentScore(
  answers: GradingAnswerRow[],
  questions: SimQuestion[],
  effectiveMax: Map<string, number>,
): number {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.score]));
  let sum = 0;
  for (const q of questions) {
    if (q.scorePolicy === "excluded" || q.scorePolicy === "redistribute") continue;
    if (q.scorePolicy === "full_marks") { sum += q.maxScore; continue; }
    const raw = answerMap.get(q.id) ?? null;
    if (raw === null) continue;
    const eff = effectiveMax.get(q.id) ?? q.maxScore;
    sum += q.maxScore > 0 && eff !== q.maxScore ? raw * (eff / q.maxScore) : raw;
  }
  return sum;
}

/** 10 equal-width percentage buckets so before/after are visually comparable. */
function buildDistribution(scores: number[], maxScore: number): ScoreDistributionBucket[] {
  const BUCKETS = 10;
  const buckets: ScoreDistributionBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
    rangeLabel: `${i * 10}-${(i + 1) * 10}%`,
    count: 0,
  }));
  if (maxScore <= 0 || scores.length === 0) return buckets;
  for (const s of scores) {
    const pct = Math.max(0, Math.min(1, s / maxScore));
    const idx = Math.min(Math.floor(pct * BUCKETS), BUCKETS - 1);
    buckets[idx].count += 1;
  }
  return buckets;
}

function average(scores: number[]): number {
  return scores.length > 0 ? roundScore(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
}

// ── Public API ────────────────────────────────────────────────────────────

export function simulateScoreImpact(input: SimulateImpactInput): ScoreImpactResult {
  const {
    questions,
    studentIds,
    answersByStudent,
    targetQuestionId,
    newPolicy,
    redistributeTargetIds = [],
  } = input;

  const toSim = (q: QuestionProgress): SimQuestion => ({
    id: q.questionId,
    maxScore: q.maxScore,
    scorePolicy: (q.scorePolicy ?? "normal") as ExamQuestionScorePolicy,
    redistributeTargetIds: q.scorePolicyConfig?.redistributeTo ?? [],
  });

  const beforeQs = questions.map(toSim);
  const afterQs = beforeQs.map((q) =>
    q.id === targetQuestionId
      ? {
          ...q,
          scorePolicy: newPolicy,
          redistributeTargetIds: newPolicy === "redistribute" ? redistributeTargetIds : q.redistributeTargetIds,
        }
      : q,
  );

  const beforeEff = simulateEffectiveMax(beforeQs);
  const afterEff = simulateEffectiveMax(afterQs);

  const beforeMax = roundScore(totalMax(beforeQs, beforeEff));
  const afterMax = roundScore(totalMax(afterQs, afterEff));

  const beforeScores: number[] = [];
  const afterScores: number[] = [];
  for (const sid of studentIds) {
    const answers = answersByStudent.get(sid) ?? [];
    beforeScores.push(studentScore(answers, beforeQs, beforeEff));
    afterScores.push(studentScore(answers, afterQs, afterEff));
  }

  return {
    beforeScores,
    afterScores,
    beforeMax,
    afterMax,
    beforeAvg: average(beforeScores),
    afterAvg: average(afterScores),
    beforeDistribution: buildDistribution(beforeScores, beforeMax),
    afterDistribution: buildDistribution(afterScores, afterMax),
  };
}
