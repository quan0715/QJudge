import { describe, expect, it } from "vitest";
import type { ExamPaperBlock, ExamQuestion } from "@/core/entities/contest.entity";
import { movePaperItem, resolveDropTarget, toReorderPayload } from "./paperMoveModel";
const q = (id: string, groupId: string | null = null): ExamQuestion => ({ id, groupId, contestId: "c", questionType: "essay", prompt: id, options: [], explanation: "", score: 5, order: 0, createdAt: "", updatedAt: "" });
const blocks: ExamPaperBlock[] = [
 {kind: "question", id: "q1", question: q("q1")},
 {kind: "group", id: "g", group: {id: "g", contestId: "c", title: "G", sharedStemMarkdown: "", order: 1, totalScore: 10, createdAt: "", updatedAt: ""}, children: [q("c1", "g"),q("c2", "g")]},
 {kind: "question", id: "q2", question: q("q2")},
];
const childRow = {kind: "child" as const, blockId: "g", questionId: "c2", isLastInBlock: true, firstChildId: "c1"};
describe("paper moves", () => {
 it("moves a child out to the top level", () => {
  const next=movePaperItem(blocks,"c2",{zone:"top",refBlockId:"g",position:"after"});
  expect(next.map(b=>b.id)).toEqual(["q1","g","c2","q2"]);
  expect(next[2]).toMatchObject({question:{groupId:null}});
  expect(blocks[1]).toMatchObject({children:[{id:"c1"},{id:"c2"}]});
 });
 it("moves a question into a group before a child", () => {
  expect(movePaperItem(blocks,"q1",{zone:"group",groupId:"g",refQuestionId:"c2",position:"before"})[0]).toMatchObject({children:[{id:"c1"},{id:"q1",groupId:"g"},{id:"c2"}]});
 });
 it("keeps an emptied group", () => {
  const first=movePaperItem(blocks,"c1",{zone:"top",refBlockId:"g",position:"after"});
  expect(movePaperItem(first,"c2",{zone:"top",refBlockId:"g",position:"after"})[1]).toMatchObject({kind:"group",id:"g",children:[]});
 });
 it("moves a child to another group", () => {
  const second: ExamPaperBlock = {...blocks[1],id:"g2",group:{...(blocks[1] as Extract<ExamPaperBlock,{kind:"group"}>).group,id:"g2"},children:[]} as ExamPaperBlock;
  expect(movePaperItem([...blocks,second],"c1",{zone:"group",groupId:"g2",refQuestionId:null,position:"after"}).at(-1)).toMatchObject({children:[{id:"c1",groupId:"g2"}]});
 });
 it("never nests a group", () => {
  expect(resolveDropTarget(childRow,{kind:"group",id:"other",groupId:null},0.5)).toEqual({zone:"top",refBlockId:"g",position:"after"});
  expect(movePaperItem(blocks,"g",{zone:"group",groupId:"g",refQuestionId:"c1",position:"before"})).toBe(blocks);
 });
 it("maps the lower part of a group header to its first child", () => {
  expect(resolveDropTarget({...childRow,kind:"group",questionId:null}, {kind:"question",id:"q1",groupId:null},0.6)).toEqual({zone:"group",groupId:"g",refQuestionId:"c1",position:"before"});
 });
 it("maps the bottom of the last child outside the group", () => {
  expect(resolveDropTarget(childRow,{kind:"question",id:"q1",groupId:null},0.8)).toEqual({zone:"top",refBlockId:"g",position:"after"});
 });
 it("rejects self and nonexistent targets", () => {
  expect(resolveDropTarget(childRow,{kind:"child",id:"c2",groupId:"g"},0.4)).toBeNull();
  expect(movePaperItem(blocks,"q1",{zone:"group",groupId:"missing",refQuestionId:null,position:"after"})).toBe(blocks);
 });
 it("serialises groups with children", () => {expect(toReorderPayload(blocks)[1]).toEqual({kind:"group",id:"g",children:["c1","c2"]});});
});
