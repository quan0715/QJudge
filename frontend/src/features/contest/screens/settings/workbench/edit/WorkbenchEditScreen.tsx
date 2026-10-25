import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Button, InlineLoading } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamPaper, ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import { createExamPaperBlock, deleteExamPaperBlock, getExamPaper, importExamQuestionsFromBank, reorderExamPaperBlocks, updateExamPaperBlock, type ExamQuestionUpsertPayload, type ExistingGradesAction } from "@/infrastructure/api/repositories";
import { useContest } from "@/features/contest/contexts";
import { useToast } from "@/shared/contexts/ToastContext";
import { EmptyState } from "@/shared/ui/EmptyState";
import { ConfirmModal, useConfirmModal } from "@/shared/ui/modal";
import { SaveToBankModal } from "@/features/question-banks/components/SaveToBankModal";
import QuestionBankImportModal from "@/features/contest/components/admin/examEditor/QuestionBankImportModal";
import { buildDuplicatePayload, DEFAULT_QUESTION_PAYLOADS } from "@/features/contest/components/admin/examEditor/examQuestionFormModel";
import useToolbarSaveStatus from "@/features/contest/components/admin/examEditor/hooks/useToolbarSaveStatus";
import { getExamPublishIssueItems } from "@/features/contest/domain/examPublishIssues";
import { movePaperItem, toReorderPayload, type PaperMoveTarget } from "@/features/contest/domain/paperMoveModel";
import { buildEditRailRows } from "./editRailModel";
import { WorkbenchEditRail } from "./WorkbenchEditRail";
import type { AddMenuChoice } from "./WorkbenchAddMenu";
import styles from "./WorkbenchEdit.module.scss";

export interface WorkbenchEditActions {
 saveQuestion(questionId:string,payload:Partial<ExamQuestionUpsertPayload>,action?:ExistingGradesAction):Promise<void>;
 saveGroup(groupId:string,group:{title?:string;shared_stem_markdown?:string}):Promise<void>;
 duplicate(questionId:string):Promise<void>;remove(itemId:string):Promise<void>;move(itemId:string,target:PaperMoveTarget):Promise<void>;
 saveToBank(question:ExamQuestion):void;addChild(groupId:string,type:ExamQuestionType):Promise<void>;
}
export default function WorkbenchEditScreen({header}:{header:ReactNode;onPreview?:()=>void}){
 const {contest}=useContest();const contestId=contest?.id??"";const locked=contest?.questionEditLocked??false;
 const lockedRef=useRef(locked);useLayoutEffect(()=>{lockedRef.current=locked;},[locked]);
 const {t}=useTranslation("contest");const {showToast}=useToast();const [params,setParams]=useSearchParams();const location=useLocation();
 const [paper,setPaper]=useState<ExamPaper|null>(null);const [error,setError]=useState<string|null>(null);
 const [importOpen,setImportOpen]=useState(false);const [bankQuestion,setBankQuestion]=useState<ExamQuestion|null>(null);
 const {confirm,modalProps}=useConfirmModal();const {track,status:saveStatus}=useToolbarSaveStatus();const structuralBusy=useRef(false);
 const loadPaper=useCallback(async()=>{const next=await getExamPaper(contestId);setPaper(next);return next;},[contestId]);
 useEffect(()=>{let active=true;if(contestId)getExamPaper(contestId).then(next=>{if(active)setPaper(next);}).catch(err=>{if(active)setError(String(err));});return()=>{active=false;};},[contestId]);
 const issues=useMemo(()=>getExamPublishIssueItems(paper?.questions??[]),[paper]);
 const rows=useMemo(()=>paper?buildEditRailRows(paper,issues,t):[],[paper,issues,t]);
 const selected=rows.some(row=>row.key===params.get("edit_item"))?params.get("edit_item"):rows[0]?.key??null;
 const select=useCallback((id:string)=>setParams(prev=>{const next=new URLSearchParams(prev);next.set("edit_item",id);return next;},{replace:true}),[setParams]);
 const failed=useCallback((err:unknown)=>showToast({kind:"error",title:t("workbench.edit.operationFailed","操作失敗"),subtitle:err instanceof Error?err.message:String(err)}),[showToast,t]);
 const runSave=useCallback(async(operation:()=>Promise<unknown>)=>{try{await track(async()=>{await operation();await loadPaper();});}catch(err){failed(err);throw err;}},[track,loadPaper,failed]);
 const structural=useCallback(async(operation:()=>Promise<void>)=>{
  if(lockedRef.current||structuralBusy.current)return;structuralBusy.current=true;
  try{await track(operation);}catch(err){try{await loadPaper();}catch{/* Keep the last known server snapshot when reload also fails. */}failed(err);}finally{structuralBusy.current=false;}
 },[track,loadPaper,failed]);
 const actions=useMemo<WorkbenchEditActions>(()=>({
  saveQuestion:async(id,payload,action)=>runSave(()=>updateExamPaperBlock(contestId,id,{kind:"question",question:{...payload,...(action?{existing_grades_action:action}:{})}})),
  saveGroup:async(id,group)=>{if(lockedRef.current)return;await runSave(()=>updateExamPaperBlock(contestId,id,{kind:"group",group}));},
  move:async(id,target)=>structural(async()=>{if(!paper)return;const blocks=movePaperItem(paper.blocks,id,target);if(blocks===paper.blocks)return;
   const previous=paper;setPaper({...paper,blocks,questions:blocks.flatMap(b=>b.kind==="group"?b.children:[b.question])});
   try{setPaper(await reorderExamPaperBlocks(contestId,toReorderPayload(blocks)));}catch(err){setPaper(previous);throw err;}
  }),
  addChild:async(groupId,type)=>structural(async()=>{await updateExamPaperBlock(contestId,groupId,{kind:"group",children:[DEFAULT_QUESTION_PAYLOADS[type]]});await loadPaper();select(groupId);}),
  duplicate:async(id)=>structural(async()=>{const source=paper?.questions.find(q=>q.id===id);if(!source)return;const payload=buildDuplicatePayload(source,source.order+1);
   if(source.groupId){const block=await updateExamPaperBlock(contestId,source.groupId,{kind:"group",children:[payload]});await loadPaper();if(block.kind==="group")select(block.children.at(-1)?.id??block.id);}
   else{const block=await createExamPaperBlock(contestId,{kind:"question",question:payload});await loadPaper();select(block.id);}
  }),
  remove:async(id)=>{if(lockedRef.current)return;const accepted=await confirm({title:t("workbench.edit.deleteQuestion","刪除這題"),body:t("workbench.edit.deleteConfirm","確定刪除選取的題目或題組？"),danger:true,confirmLabel:t("workbench.edit.delete","刪除"),cancelLabel:t("workbench.edit.cancel","取消")});if(!accepted)return;
   await structural(async()=>{await deleteExamPaperBlock(contestId,id);await loadPaper();});},
  saveToBank:setBankQuestion,
 }),[contestId,runSave,structural,paper,loadPaper,select,confirm,t]);
 const add=async(choice:AddMenuChoice)=>{
  if(lockedRef.current)return;if(choice.kind==="bank"){setImportOpen(true);return;}
  const block=paper?.blocks.find(b=>b.id===selected||(b.kind==="group"&&b.children.some(q=>q.id===selected)));
  if(choice.kind==="question"&&block?.kind==="group"&&selected===block.id){await actions.addChild(block.id,choice.type);return;}
  await structural(async()=>{const order=block?.kind==="group"?Math.max(block.group.order,...block.children.map(q=>q.order))+1:block?.question.order!=null?block.question.order+1:paper?.questions.length??0;
   const created=await createExamPaperBlock(contestId,choice.kind==="group"?{kind:"group",group:{title:t("workbench.edit.newGroup","新題組"),shared_stem_markdown:"",order}}:{kind:"question",question:{...DEFAULT_QUESTION_PAYLOADS[choice.type],order}});
   await loadPaper();select(created.id);
  });
 };
 if(error)return <EmptyState title={error} action={<Button onClick={()=>{setError(null);void loadPaper().catch(err=>setError(String(err)));}}>{t("workbench.edit.retry","重新載入")}</Button>}/>;
 if(!paper)return <InlineLoading description={t("workbench.edit.loading","載入考卷中…")}/>;
 const currentQuestion=paper.questions.find(q=>q.id===selected);const currentBlock=paper.blocks.find(b=>b.id===selected);
 const legacy=new URLSearchParams(params);legacy.set("panel","problem_editor");
 return <div className={styles.root}>
  <WorkbenchEditRail header={header} rows={rows} activeKey={selected} locked={locked} issueCount={issues.length}
   summary={{questions:paper.questions.length,blocks:paper.blocks.length,totalScore:paper.questions.reduce((sum,q)=>sum+(q.effectiveMaxScore??q.score),0)}}
   onSelect={select} onMove={(id,target)=>{void actions.move(id,target);}} onAdd={choice=>{void add(choice);}} onOpenPublishCheck={()=>{}} legacyHref={`${location.pathname}?${legacy}`}/>
  <main className={styles.main} aria-label={t("workbench.edit.editor","題目編輯")}>
   {selected?<><h1>{currentQuestion?.prompt??(currentBlock?.kind==="group"?currentBlock.group.title:"")}</h1>
    {!locked&&<Button kind="danger--ghost" onClick={()=>{void actions.remove(selected);}}>{t("workbench.edit.deleteQuestion","刪除這題")}</Button>}
    <span aria-live="polite">{saveStatus==="saving"?t("workbench.edit.saving","儲存中…"):""}</span></>:<EmptyState title={t("workbench.edit.emptyPaper","考卷尚無題目")}/>}
  </main>
  <ConfirmModal {...modalProps}/>
  <QuestionBankImportModal open={importOpen} category="exam" onClose={()=>setImportOpen(false)} onConfirm={async items=>{await structural(async()=>{await importExamQuestionsFromBank(contestId,{items:items.map(item=>({question_bank_id:item.questionBankId,question_id:item.questionId}))});const next=await loadPaper();setImportOpen(false);const last=next.blocks.at(-1);if(last)select(last.id);});}}/>
  <SaveToBankModal open={bankQuestion!==null} onClose={()=>setBankQuestion(null)} sourceType="exam_question" sourceId={bankQuestion?.id??""} sourceTitle={bankQuestion?.prompt.slice(0,60)??""}/>
 </div>;
}
