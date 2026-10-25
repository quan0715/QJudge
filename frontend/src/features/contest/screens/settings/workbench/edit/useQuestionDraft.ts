import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import type { ExamQuestionUpsertPayload } from "@/infrastructure/api/repositories";
import { buildPayload, getQuestionValidationError, isFormDirty, toFormState, type QuestionFormState } from "@/features/contest/components/admin/examEditor/examQuestionFormModel";
export interface QuestionDraft {
 form:QuestionFormState;setForm(update:(prev:QuestionFormState)=>QuestionFormState):void;dirty:boolean;
 error:ReturnType<typeof getQuestionValidationError>;flush():Promise<void>;reset():void;
}
interface DraftOptions {autosave:boolean;requireScore:boolean;save(payload:Partial<ExamQuestionUpsertPayload>):Promise<void>;delayMs?:number}
export function useQuestionDraft(question:ExamQuestion,opts:DraftOptions):QuestionDraft {
 const initial=()=>{const form=toFormState(question);return {id:question.id,form,saved:form};};
 const [state,setState]=useState(initial);
 if(state.id!==question.id)setState(initial());
 const snapshot=useRef({state,opts});
 useLayoutEffect(()=>{snapshot.current={state,opts};});
 const inFlight=useRef<Promise<void>|null>(null);
 const flush=useCallback(async()=>{
  if(inFlight.current)await inFlight.current;
  const current=snapshot.current;
  if(!isFormDirty(current.state.form,current.state.saved,current.opts.requireScore)||getQuestionValidationError(current.state.form,{requireScore:current.opts.requireScore}))return;
  const sent=current.state.form;const id=current.state.id;
  const payload=buildPayload(sent,current.opts.requireScore);
  // Clearing an answer must clear the persisted key as well.
  payload.correct_answer=payload.correct_answer??null;
  const operation=current.opts.save(payload).then(()=>{
   if(snapshot.current.state.id!==id)return;
   snapshot.current={...snapshot.current,state:{...snapshot.current.state,saved:sent}};
   setState(prev=>prev.id===id?{...prev,saved:sent}:prev);
  });
  inFlight.current=operation;
  try{await operation;}finally{if(inFlight.current===operation)inFlight.current=null;}
 },[]);
 const dirty=isFormDirty(state.form,state.saved,opts.requireScore);
 const error=getQuestionValidationError(state.form,{requireScore:opts.requireScore});
 useEffect(()=>{
  if(!opts.autosave||!dirty||error)return;
  const timer=setTimeout(()=>{void flush().catch(()=>{});},opts.delayMs??1000);
  return()=>clearTimeout(timer);
 },[state.form,dirty,error,opts.autosave,opts.delayMs,flush]);
 // Layout cleanups run before the next question's snapshot is installed.
 useLayoutEffect(()=>()=>{if(snapshot.current.opts.autosave)void flush().catch(()=>{});},[question.id,flush]);
 return {form:state.form,dirty,error,flush,
  setForm:useCallback((update:(prev:QuestionFormState)=>QuestionFormState)=>setState(prev=>({...prev,form:update(prev.form)})),[]),
  reset:useCallback(()=>setState(prev=>({...prev,form:prev.saved})),[])};
}
