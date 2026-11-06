import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Theme, Button } from "@carbon/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n";
import type { ExamQuestion, OpenAnswerDocument } from "@/core/entities/contest.entity";
import type { ExamItem } from "../../types/exam.types";
import { ExamQuestionCard } from "./ExamQuestionCard";
import { PaperExamCore } from "./PaperExamCore";
import styles from "../../screens/paperExam/PaperExamAnswering.module.scss";

const questions: ExamQuestion[] = [
  { questionType: "single_choice", prompt: "若 $2x+3=11$，則 $x$ 的值為何？", options: ["2", "3", "4", "7"] },
  { questionType: "multiple_choice", prompt: "下列哪些數是 $x^2=9$ 的解？", options: ["−3", "0", "3", "9"] },
  { questionType: "true_false", prompt: "圓的半徑變為兩倍，面積也變為兩倍。", options: [] },
  { questionType: "short_answer", prompt: "直線經過 $(2,3)$ 與 $(6,11)$。求斜率並簡述理由。", options: [] },
  { questionType: "essay", prompt: "學校規劃停用一次性飲水杯。請提出你的立場、理由，並回應一項反對意見。", options: [] },
  { questionType: "essay", prompt: "圓心 $P=(4,-4)$，圓通過原點。寫出半徑平方與圓方程式，並說明理由。", options: [] },
].map((question, index) => ({
  id: `workspace-${index}`, contestId: "storybook", explanation: "", score: 5,
  order: index, answerFormat: "open_document", createdAt: "", updatedAt: "", ...question,
})) as ExamQuestion[];
const items: ExamItem[] = questions.map(data => ({ kind: "question", data }));
const sample: OpenAnswerDocument = { version: 1, nodes: [
  { type: "paragraph", children: [{ type: "text", text: "由圓心到原點的距離可得 " }, { type: "math", latex: "r^2=4^2+(-4)^2=32" }, { type: "text", text: "。" }] },
  { type: "paragraph", children: [{ type: "text", text: "因此圓方程式為" }] },
  { type: "paragraph", children: [{ type: "math", latex: "(x-4)^2+(y+4)^2=32" }] },
  { type: "paragraph", children: [{ type: "text", text: "點選公式即可編輯，按 Enter 完成後繼續書寫。" }] },
] };
function Workbench() {
  const [dashboard, setDashboard] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({ "workspace-5": sample });
  const [marked, setMarked] = useState(new Set<string>());
  if (dashboard) return <Theme theme="white"><div style={{padding:32}}><h2>競賽儀表板 · 預覽</h2><Button onClick={() => setDashboard(false)}>返回作答</Button></div></Theme>;
  return <I18nextProvider i18n={i18n}><Theme theme="white"><div style={{ height: "100dvh" }}>
    <PaperExamCore overviewLabel="返回競賽儀表板" onSelectOverview={() => setDashboard(true)} workbench items={items} answeredIds={new Set(Object.keys(answers).filter(id => answers[id] !== ""))} markedIds={marked} styles={styles}
      toolbarLeft={<span className={styles.title}>學科綜合測驗 · 作答預覽</span>}
      renderItem={(item, index, _mode, footer) => item.kind === "question" && <ExamQuestionCard onBackToDashboard={() => setDashboard(true)} layout="workspace" question={item.data} index={index} answer={answers[item.data.id]} footer={footer}
        onAnswerChange={(id, value) => setAnswers(prev => ({ ...prev, [id]: value }))}
        isMarked={marked.has(item.data.id)} onToggleMark={id => setMarked(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
      />}
    />
  </div></Theme></I18nextProvider>;
}
const meta = { title: "Contest/PaperExamWorkbench", component: Workbench, parameters: { layout: "fullscreen" } } satisfies Meta<typeof Workbench>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Unified: Story = {};
