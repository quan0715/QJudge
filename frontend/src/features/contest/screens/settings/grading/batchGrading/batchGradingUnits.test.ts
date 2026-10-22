import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { GradingAnswerRow } from "../gradingTypes";
import { selectBatchQuestions, groupForRuns } from "./batchGradingModel";
import { buildGradingUnits, prepareGradingUnit, buildBatchRunPrompt } from "./batchGradingUnits";
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const qs = ['a','b','c','d','e'].map((id, i) => ({id, groupId: i > 1 ? 'group' : null,
  prompt: id, gradingPrompt: `Shared: loop; no math. ${id}`, questionType: 'short_answer', score: 3, order:i,
  explanation:'Partial credit allowed'})) as ExamQuestion[];
const rows = qs.flatMap(q => ['s1','s2'].map(s => ({id:`${s}-${q.id}`, studentId:s, studentUsername:s,
  questionId:q.id, questionGroupId:q.groupId, questionIndex:q.order+1, questionType:q.questionType,
  maxScore:q.score, score:null, answerContent:{text:`${s} original ${q.id}`}}))) as GradingAnswerRow[];

describe('complete grading units', () => {
  it('never splits a group at the three-unit boundary', () => {
    const units = buildGradingUnits(selectBatchQuestions(rows),qs);
    expect(groupForRuns(units).map(batch => batch.map(u=>u.questions.map(q=>q.id))))
      .toEqual([[['a'],['b'],['c','d','e']]]);
  });
  it('keeps readonly and unanswered siblings in same-student context for a child retry', async () => {
    const changed = rows.filter(r=>r.id!=='s1-e').map(r=>r.id==='s1-d'?{...r,score:2}:r);
    const [unit] = buildGradingUnits(selectBatchQuestions(changed).filter(q=>q.questionId==='c'),qs);
    const prepared=await prepareGradingUnit(unit,changed);
    const data=JSON.parse(prepared.content);
    expect(data.students[0].answers).toEqual([
      {question_id:'c',exam_answer_id:'s1-c',answer:'s1 original c',writable:true},
      {question_id:'d',exam_answer_id:'s1-d',answer:'s1 original d',writable:false},
      {question_id:'e',exam_answer_id:null,answer:null,writable:false},
    ]);
    expect(data.students[1].answers[0].answer).toBe('s2 original c');
    const prompt=buildBatchRunPrompt({contestId:'contest',units:[prepared.manifest]});
    expect(JSON.parse(prompt.split('\n')[1].slice('batch_units: '.length))).toEqual([prepared.manifest]);
  });
  it('reuses the rubric across students but versions changed instructions', async () => {
    const [unit]=buildGradingUnits(selectBatchQuestions(rows).filter(q=>q.questionId==='c'),qs);
    const a=await prepareGradingUnit(unit,rows);
    const b=await prepareGradingUnit({...unit,targets:unit.targets.map(t=>({...t,ungradedRows:t.ungradedRows.slice(1)}))},rows);
    const c=await prepareGradingUnit(unit,rows,'loop is worth one point');
    expect(a.manifest.rubric_file).toBe(b.manifest.rubric_file);
    expect(a.manifest.context_sha256).not.toBe(b.manifest.context_sha256);
    expect(a.manifest.rubric_file).not.toBe(c.manifest.rubric_file);
    const [allSiblings] = buildGradingUnits(selectBatchQuestions(rows).filter(q=>['c','d','e'].includes(q.questionId)),qs);
    expect((await prepareGradingUnit(allSiblings,rows)).manifest.rubric_file).toBe(a.manifest.rubric_file);
  });
});
