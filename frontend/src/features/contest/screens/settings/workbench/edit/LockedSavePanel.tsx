import { useState } from "react";
import { Button, RadioButton, RadioButtonGroup } from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { LockedSaveImpact, ExistingGradesAction } from "@/features/contest/components/admin/examEditor/lockedQuestionSaveImpact";
import styles from "./WorkbenchEdit.module.scss";
export interface LockedSavePanelProps {impact:LockedSaveImpact;saving:boolean;onSave(action?:ExistingGradesAction):void;onCancel():void}
export function LockedSavePanel({impact,saving,onSave,onCancel}:LockedSavePanelProps){
 const {t}=useTranslation("contest");const [action,setAction]=useState<"keep"|"mark_pending">("keep");
 if(impact.kind==="no-op")return null;
 const waiting=impact.affectedCount===null;
 return <section className={styles.lockedSave} aria-label={t("workbench.edit.saveChanges","儲存變更")}>
  {impact.kind==="objective-regrade"&&!waiting&&<p>{t("workbench.edit.objectiveImpact","這題已有 {{count}} 份作答，儲存後會依新規則重新批改",{count:impact.affectedCount??0})}</p>}
  {impact.kind==="subjective-review"&&<>
   {!waiting&&<p>{t("workbench.edit.subjectiveImpact","這題已有 {{count}} 份批改，儲存後要怎麼處理？",{count:impact.affectedCount??0})}</p>}
   <RadioButtonGroup name="existing-grades-action" legendText={t("workbench.edit.existingGrades","既有批改")} orientation="vertical" valueSelected={action} onChange={value=>setAction(value as "keep"|"mark_pending")}>
    <RadioButton id="grades-keep" value="keep" labelText={t("workbench.edit.keepGrades","保留既有批改")}/>
    <RadioButton id="grades-pending" value="mark_pending" labelText={t("workbench.edit.markPending","標記為待批改")}/>
   </RadioButtonGroup>
  </>}
  {waiting&&<p>{t("workbench.edit.loadingImpact","載入作答統計中…")}</p>}
  <div className={styles.saveActions}><Button kind="secondary" size="sm" disabled={saving} onClick={onCancel}>{t("workbench.edit.cancel","取消")}</Button>
   <Button size="sm" disabled={saving||waiting} onClick={()=>onSave(impact.kind==="objective-regrade"?"regrade":impact.kind==="subjective-review"?action:undefined)}>
    {impact.kind==="objective-regrade"?t("workbench.edit.regrade","重新批改"):t("workbench.edit.saveChanges","儲存變更")}
   </Button></div>
 </section>;
}
