import { useCallback, useEffect, useRef } from "react";
import { Button, Checkbox, IconButton, NumberInput, OverflowMenu, OverflowMenuItem, RadioButton, Select, SelectItem, Tag, TextInput } from "@carbon/react";
import { Add, ArrowLeft, ArrowRight, TrashCan } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion, ExamQuestionType } from "@/core/entities/contest.entity";
import type { ExistingGradesAction, ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories";
import { ALLOWED_TYPE_SWITCHES, isChoiceType, toLockedGradingPayload } from "@/features/contest/components/admin/examEditor/examQuestionFormModel";
import type { ToolbarSaveStatus } from "@/features/contest/components/admin/examEditor/hooks/useToolbarSaveStatus";
import { GlobalSaveStatus } from "@/shared/ui/autoSave";
import { MarkdownField } from "@/shared/ui/markdown/markdownEditor";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import { OpenAnswerDocumentEditor, createEmptyOpenAnswerDocument } from "@/shared/ui/editor";
import type { WorkbenchEditActions } from "./WorkbenchEditScreen";
import { useQuestionDraft } from "./useQuestionDraft";
import styles from "./WorkbenchEdit.module.scss";
export interface WorkbenchQuestionEditorProps {
 question:ExamQuestion;label:string;locked:boolean;groups:Array<{id:string;label:string}>;
 prevLabel?:string;nextLabel?:string;onNavigate(direction:"prev"|"next"):void;actions:WorkbenchEditActions;
 saveStatus:ToolbarSaveStatus;onOpenScorePolicy():void;compact?:boolean;
 registerFlush?:(flush:(()=>Promise<void>)|null)=>void;
}
export function WorkbenchQuestionEditor({question,label,locked,groups,prevLabel,nextLabel,onNavigate,actions,saveStatus,onOpenScorePolicy,compact=false,registerFlush}:WorkbenchQuestionEditorProps){
 const {t}=useTranslation("contest");const saveAction=useRef<ExistingGradesAction|undefined>(undefined);
 const save=useCallback((payload:Partial<ExamQuestionUpsertPayload>)=>locked
  ?actions.saveQuestion(question.id,toLockedGradingPayload(payload as ExamQuestionUpsertPayload),saveAction.current)
  :actions.saveQuestion(question.id,payload),[actions,question.id,locked]);
 const draft=useQuestionDraft(question,{autosave:!locked,requireScore:true,save});const {form,setForm}=draft;
 useEffect(()=>{registerFlush?.(locked?async()=>{}:draft.flush);return()=>registerFlush?.(null);},[draft.flush,locked,registerFlush]);
 const names={single_choice:"單選題",multiple_choice:"多選題",true_false:"是非題",short_answer:"簡答題",essay:"問答題"};
 const typeText=(type:ExamQuestionType)=>t(`common:questionType.label.${type}`,names[type]);
 const switchType=(type:ExamQuestionType)=>setForm(p=>({...p,questionType:type,
  singleAnswerIndex:type==="single_choice"?p.multiAnswerIndexes[0]??"":p.singleAnswerIndex,
  multiAnswerIndexes:type==="multiple_choice"&&p.singleAnswerIndex!==""?[p.singleAnswerIndex]:p.multiAnswerIndexes,
  essayReferenceAnswer:type==="essay"?p.shortAnswer:p.essayReferenceAnswer,shortAnswer:type==="short_answer"?p.essayReferenceAnswer:p.shortAnswer}));
 const removeOption=(index:number)=>setForm(p=>({...p,options:p.options.filter((_,i)=>i!==index),
  singleAnswerIndex:p.singleAnswerIndex===""||Number(p.singleAnswerIndex)===index?"":String(Number(p.singleAnswerIndex)-(Number(p.singleAnswerIndex)>index?1:0)),
  multiAnswerIndexes:p.multiAnswerIndexes.filter(v=>Number(v)!==index).map(v=>String(Number(v)-(Number(v)>index?1:0)))}));
 const policy=question.scorePolicy??"normal";
 const policyText=policy==="full_marks"?t("workbench.edit.fullMarks","送分"):policy==="excluded"||policy==="redistribute"?t("workbench.edit.excluded","不計分"):t("workbench.edit.normal","正常計分");
 return <article className={styles.editor}>
  {!compact&&<header className={styles.editorHeader}><h1><span className={styles.questionLabel}>{label}</span><span className={styles.questionTitle} title={form.prompt}>{form.prompt.split("\n")[0]}</span></h1>
   <GlobalSaveStatus status={saveStatus}/>
   <OverflowMenu flipped iconDescription={t("workbench.edit.more","更多操作")} aria-label={t("workbench.edit.more","更多操作")}>
    {!locked&&<OverflowMenuItem itemText={t("workbench.edit.duplicate","複製這題")} onClick={()=>{void actions.duplicate(question.id);}}/>}
    <OverflowMenuItem itemText={t("workbench.edit.saveToBank","收錄到題庫")} onClick={()=>actions.saveToBank(question)}/>
    {!locked&&groups.filter(g=>g.id!==question.groupId).map(g=><OverflowMenuItem key={g.id} itemText={t("workbench.edit.moveInto","移入{{label}}",{label:g.label})} onClick={()=>{void actions.move(question.id,{zone:"group",groupId:g.id,refQuestionId:null,position:"after"});}}/>)}
    {!locked&&question.groupId&&<OverflowMenuItem itemText={t("workbench.edit.moveOut","移出題組")} onClick={()=>{void actions.move(question.id,{zone:"top",refBlockId:question.groupId!,position:"after"});}}/>}
    {!locked&&<OverflowMenuItem hasDivider isDelete itemText={t("workbench.edit.deleteQuestion","刪除這題")} onClick={()=>{void actions.remove(question.id);}}/>}
   </OverflowMenu>
  </header>}
  <div className={styles.settingsRow}>
   <Select id={`type-${question.id}`} labelText={t("workbench.edit.type","題型")} value={form.questionType} disabled={locked} onChange={e=>switchType(e.target.value as ExamQuestionType)}>
    {ALLOWED_TYPE_SWITCHES[form.questionType].map(type=><SelectItem key={type} value={type} text={typeText(type)}/>)}
   </Select>
   <NumberInput id={`score-${question.id}`} label={t("workbench.edit.score","配分")} min={0} value={form.score} allowEmpty invalid={draft.error==="invalidScore"} invalidText={t("workbench.edit.invalidScore","配分必須大於 0")} onChange={(_,data)=>setForm(p=>({...p,score:String(data.value)}))}/>
   <div className={styles.policyControl}><span>{t("workbench.edit.scorePolicy","分數政策")}</span><div><Tag size="sm" type="gray">{policyText}</Tag><Button kind="ghost" size="sm" onClick={onOpenScorePolicy}>{t("workbench.edit.change","變更")}</Button></div></div>
  </div>
  <section className={styles.field} aria-label={t("workbench.edit.prompt","題目敘述")}>
   <h2>{t("workbench.edit.prompt","題目敘述")}</h2>
   {locked?<MarkdownRenderer>{form.prompt}</MarkdownRenderer>:<MarkdownField id={`prompt-${question.id}`} labelText={t("workbench.edit.prompt","題目敘述")} value={form.prompt} onChange={value=>setForm(p=>({...p,prompt:value}))} showPreview invalid={draft.error==="emptyPrompt"} invalidText={t("workbench.edit.emptyPrompt","題目內容不可為空")}/>}
  </section>
  <section className={styles.field} aria-label={isChoiceType(form.questionType)?t("workbench.edit.optionsAnswer","選項與正確答案"):t("workbench.edit.reference","評分參考答案")}>
   <h2>{isChoiceType(form.questionType)?t("workbench.edit.optionsAnswer","選項與正確答案"):t("workbench.edit.reference","評分參考答案")}</h2>
   {isChoiceType(form.questionType)?<>
    {form.options.map((option,index)=>{const letter=String.fromCharCode(65+index);const correct=form.questionType==="multiple_choice"?form.multiAnswerIndexes.includes(String(index)):form.singleAnswerIndex===String(index);
     return <div className={`${styles.optionRow} ${correct?styles.correctOption:""}`} key={index}>
      {form.questionType==="multiple_choice"?<Checkbox id={`answer-${question.id}-${index}`} labelText={letter} checked={correct} onChange={(_,data)=>setForm(p=>({...p,multiAnswerIndexes:data.checked?[...p.multiAnswerIndexes,String(index)]:p.multiAnswerIndexes.filter(v=>v!==String(index))}))}/>
       :<RadioButton id={`answer-${question.id}-${index}`} name={`answer-${question.id}`} value={String(index)} labelText={letter} checked={correct} onChange={()=>setForm(p=>({...p,singleAnswerIndex:String(index)}))}/>}
      <TextInput id={`option-${question.id}-${index}`} labelText={t("workbench.edit.option","選項 {{letter}}",{letter})} hideLabel value={option} readOnly={locked||form.questionType==="true_false"} invalid={!option.trim()} invalidText={t("workbench.edit.blankOption","選項文字不可空白")} onChange={e=>setForm(p=>({...p,options:p.options.map((v,i)=>i===index?e.target.value:v)}))}/>
      {correct&&<Tag type="green" size="sm">{t("workbench.edit.correctAnswer","正確答案")}</Tag>}
      {!locked&&form.questionType!=="true_false"&&<IconButton kind="ghost" size="sm" label={t("workbench.edit.deleteOption","刪除選項 {{letter}}",{letter})} disabled={form.options.length<=2} onClick={()=>removeOption(index)}><TrashCan size={16}/></IconButton>}
     </div>;
    })}
    {!locked&&form.questionType!=="true_false"&&<Button kind="ghost" size="sm" renderIcon={Add} onClick={()=>setForm(p=>({...p,options:[...p.options,""]}))}>{t("workbench.edit.addOption","新增選項")}</Button>}
   </>:form.answerFormat==="open_document"?<OpenAnswerDocumentEditor value={form.referenceAnswerDocument??createEmptyOpenAnswerDocument()} onChange={document=>setForm(p=>({...p,referenceAnswerDocument:document}))} ariaLabel={t("workbench.edit.reference","評分參考答案")}/>
    :<MarkdownField id={`reference-${question.id}`} labelText={t("workbench.edit.reference","評分參考答案")} value={form.questionType==="essay"?form.essayReferenceAnswer:form.shortAnswer} onChange={value=>setForm(p=>({...p,...(p.questionType==="essay"?{essayReferenceAnswer:value}:{shortAnswer:value})}))} showPreview/>}
  </section>
  <section className={styles.field} aria-label={t("workbench.edit.explanation","詳解")}><h2>{t("workbench.edit.explanation","詳解")}</h2>
   {form.answerFormat==="open_document"?<OpenAnswerDocumentEditor value={form.explanationDocument??createEmptyOpenAnswerDocument()} onChange={document=>setForm(p=>({...p,explanationDocument:document}))} ariaLabel={t("workbench.edit.explanation","詳解")}/>
    :<MarkdownField id={`explanation-${question.id}`} labelText={t("workbench.edit.explanation","詳解")} value={form.explanation} onChange={value=>setForm(p=>({...p,explanation:value}))} showPreview/>}
  </section>
  {!compact&&<nav className={styles.questionNavigation} aria-label={t("workbench.edit.questionNavigation","切換題目")}>
   <Button kind="ghost" size="sm" renderIcon={ArrowLeft} disabled={!prevLabel} onClick={()=>{void draft.flush().then(()=>onNavigate("prev")).catch(()=>{});}}>{prevLabel??t("workbench.edit.previous","上一題")}</Button>
   <Button kind="ghost" size="sm" renderIcon={ArrowRight} disabled={!nextLabel} onClick={()=>{void draft.flush().then(()=>onNavigate("next")).catch(()=>{});}}>{nextLabel??t("workbench.edit.next","下一題")}</Button>
  </nav>}
 </article>;
}
