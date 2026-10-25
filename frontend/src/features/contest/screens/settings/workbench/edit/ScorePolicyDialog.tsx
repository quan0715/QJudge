import { useState } from "react";
import { Modal, RadioButton, RadioButtonGroup } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { ExamQuestion } from "@/core/entities/contest.entity";
import { useContest } from "@/features/contest/contexts";
import { useToast } from "@/shared/contexts/ToastContext";
import { setExamQuestionScorePolicy } from "@/infrastructure/api/repositories/examQuestions.repository";
import { choiceFromPolicy, policyFromChoice, redistributedScore, type ScorePolicyChoice } from "@/features/contest/domain/scorePolicyChoice";
import { compactScore as formatScore } from "../../grading/workbench/workbenchStatsModel";
import styles from "./WorkbenchEdit.module.scss";
export interface ScorePolicyDialogProps {
 open:boolean;question:ExamQuestion;label:string;paperTotal:number;sampleTarget:{label:string;score:number}|null;
 affectedStudents:number;onClose():void;onApplied():void|Promise<void>;sampleAfterScore?:number;impactReady?:boolean;
}
export function ScorePolicyDialog({open,question,label,paperTotal,sampleTarget,affectedStudents,onClose,onApplied,sampleAfterScore,impactReady=true}:ScorePolicyDialogProps){
 const {t}=useTranslation("contest");const {contest}=useContest();const {showToast}=useToast();
 const [choice,setChoice]=useState<ScorePolicyChoice>(()=>choiceFromPolicy(question.scorePolicy??"normal"));const [saving,setSaving]=useState(false);
 const excluded=choice==="excluded_lower"||choice==="excluded_keep";
 const apply=async()=>{if(!contest||saving||!impactReady)return;setSaving(true);try{const next=policyFromChoice(choice);await setExamQuestionScorePolicy(contest.id,question.id,next.policy,next.config);await onApplied();onClose();}catch(err){showToast({kind:"error",title:t("workbench.edit.operationFailed","操作失敗"),subtitle:err instanceof Error?err.message:String(err)});}finally{setSaving(false);}};
 return <Modal open={open} size="sm" modalHeading={t("workbench.edit.scorePolicy","分數政策")} modalLabel={`${label} · ${question.prompt.split("\n")[0]}`} primaryButtonText={t("workbench.edit.apply","套用")} secondaryButtonText={t("workbench.edit.cancel","取消")} primaryButtonDisabled={saving||!impactReady} onRequestSubmit={()=>{void apply();}} onRequestClose={()=>{if(!saving)onClose();}}>
  <div className={styles.policyDialog}>
   <RadioButtonGroup name="score-policy" legendText={t("workbench.edit.scorePolicy","分數政策")} orientation="vertical" valueSelected={excluded?"excluded":choice} onChange={value=>setChoice(value==="excluded"?"excluded_lower":value as ScorePolicyChoice)}>
    <RadioButton id="policy-normal" value="normal" labelText={t("workbench.edit.normal","正常計分")}/>
    <RadioButton id="policy-full" value="full_marks" labelText={t("workbench.edit.fullMarks","送分")}/>
    <RadioButton id="policy-excluded" value="excluded" labelText={t("workbench.edit.excluded","不計分")}/>
   </RadioButtonGroup>
   {choice==="full_marks"&&<p>{t("workbench.edit.fullMarksHint","所有學生這題都拿滿分 {{score}} 分",{score:question.score})}</p>}
   {excluded&&<div className={styles.policySubchoices}>
    <RadioButtonGroup name="score-total" legendText={t("workbench.edit.totalPolicy","考卷總分")} orientation="vertical" valueSelected={choice} onChange={value=>setChoice(value as ScorePolicyChoice)}>
     <RadioButton id="policy-lower" value="excluded_lower" labelText={t("workbench.edit.lowerTotal","總分降為 {{score}} 分",{score:formatScore(paperTotal-question.score)})}/>
     <RadioButton id="policy-keep" value="excluded_keep" labelText={t("workbench.edit.keepTotal","總分維持 {{score}} 分",{score:formatScore(paperTotal)})}/>
    </RadioButtonGroup>
    {choice==="excluded_keep"&&sampleTarget&&<p>{t("workbench.edit.redistributeExample","這題的 {{points}} 分依配分比例分給其他正常計分的題目，例如 {{label}} {{before}} 分 → {{after}} 分",{points:question.score,label:sampleTarget.label,before:formatScore(sampleTarget.score),after:formatScore(sampleAfterScore??redistributedScore(sampleTarget.score,paperTotal-question.score,question.score))})}</p>}
   </div>}
   <div className={styles.policyFootnote}><p>{impactReady?t("workbench.edit.affectedStudents","會重新計算 {{count}} 位學生的總分",{count:affectedStudents}):t("workbench.edit.loadingImpact","載入作答統計中…")}</p><p>{t("workbench.edit.canRestore","之後可以隨時改回「正常計分」")}</p></div>
  </div>
 </Modal>;
}
