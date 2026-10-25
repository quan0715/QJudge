import type { ExamPaper, ExamQuestion } from "@/core/entities/contest.entity";
export const questionFixture=(id:string,overrides:Partial<ExamQuestion>={}):ExamQuestion=>({id,contestId:"c1",questionType:"single_choice",prompt:`Prompt ${id}`,options:["A","B"],correctAnswer:0,explanation:"",score:5,order:0,answerFormat:"plain_text",createdAt:"",updatedAt:"",...overrides});
export function paperFixture():ExamPaper {
 const q1=questionFixture("q1");const c1=questionFixture("c1",{order:1,groupId:"g",orderInGroup:1});const c2=questionFixture("c2",{order:2,groupId:"g",orderInGroup:2});const q2=questionFixture("q2",{order:3});
 const group={id:"g",contestId:"c1",title:"Shared task",sharedStemMarkdown:"Shared stem",order:1,totalScore:10,createdAt:"",updatedAt:""};
 return {questions:[q1,c1,c2,q2],groups:[group],sections:[{kind:"flat",item:q1},{kind:"group",group,items:[c1,c2]},{kind:"flat",item:q2}],blocks:[{kind:"question",id:"q1",question:q1},{kind:"group",id:"g",group,children:[c1,c2]},{kind:"question",id:"q2",question:q2}]};
}
