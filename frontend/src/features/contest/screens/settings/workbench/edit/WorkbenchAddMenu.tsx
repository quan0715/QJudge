import { OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { ExamQuestionType } from "@/core/entities/contest.entity";
import styles from "./WorkbenchEdit.module.scss";
export type AddMenuChoice = { kind: "question"; type: ExamQuestionType } | { kind: "group" } | { kind: "bank" };
export function WorkbenchAddMenu({onAdd,questionsOnly=false,label}:{onAdd(choice:AddMenuChoice):void;questionsOnly?:boolean;label?:string}){
 const {t}=useTranslation("contest");const types:ExamQuestionType[]=["single_choice","multiple_choice","true_false","short_answer","essay"];
 const names={single_choice:"單選題",multiple_choice:"多選題",true_false:"是非題",short_answer:"簡答題",essay:"問答題"};
 const text=label??t("workbench.edit.addQuestion","新增題目");
 return <OverflowMenu className={styles.addMenu} iconDescription={text} aria-label={text} renderIcon={()=><span className={styles.addLabel}>{text}<Add size={16}/></span>}>
  {types.map(type=><OverflowMenuItem key={type} itemText={t(`common:questionType.label.${type}`,names[type])} onClick={()=>onAdd({kind:"question",type})}/>)}
  {!questionsOnly&&<OverflowMenuItem hasDivider itemText={t("workbench.edit.addGroup","題組")} onClick={()=>onAdd({kind:"group"})}/>}
  {!questionsOnly&&<OverflowMenuItem hasDivider itemText={t("workbench.edit.importBank","從題庫匯入…")} onClick={()=>onAdd({kind:"bank"})}/>}
 </OverflowMenu>;
}
