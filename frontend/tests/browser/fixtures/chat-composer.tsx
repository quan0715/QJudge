// Real chat UI; synthetic session/stream data and intercepted artifact API only.
import { createRoot } from "react-dom/client";
import { Theme } from "@carbon/react";
import { DefaultCopilotTranslations, type CopilotMessage, type CopilotStartRunInput } from "@copilot";
import { MemoryCopilotTransport, MemoryCopilotModelCatalog, MemoryCopilotSessionLocation, MemoryCopilotStorage } from "@copilot/testing";
import { QJudgeCopilotBoundary } from "@/features/chatbot/contexts/QJudgeCopilotProvider";
import { QJudgeChatPanel } from "@/features/chatbot/components/chat-ui/QJudgeChatPanel";
import workspace from "@/features/chatbot/components/workspace/WorkspaceShell.module.scss";
import "@/i18n";
import "@/styles/globals.scss";

const params = new URLSearchParams(location.search);
const side = params.has("side");
const mobile = params.has("mobile");
const width = Number(params.get("width") || 400);
const theme = params.get("theme") === "white" ? "white" : "g100";
document.documentElement.dataset.carbonTheme = theme;

class ChatTransport extends MemoryCopilotTransport {
  messages: CopilotMessage[] = [{
    id: "intro", role: "assistant", createdAt: new Date(), parts: [
      { type: "text", text: "已整理題目，接下來會核對答案與輸出報告。" },
      { type: "data-todo-items", data: [
        { id: "1", label: "檢查題目與評分規則", status: "success" },
        { id: "2", label: "核對答案", status: "in_progress" },
        { id: "3", label: "輸出報告", status: "pending" },
      ] },
    ],
  }];
  async getSession(id: string) { return { ...await super.getSession(id), messages: this.messages }; }
  async startRun(input: CopilotStartRunInput) {
    const run = await super.startRun(input);
    this.messages.push({ id: `user-${run.id}`, role: "user", createdAt: new Date(), parts: [{type:"text", text:input.text}] });
    document.documentElement.dataset.sendCount = String(this.messages.filter(m => m.role === "user").length);
    setTimeout(() => {
      const messageId = `run-${run.id}-assistant`;
      this.messages.push({id:messageId, role:"assistant", createdAt:new Date(),parts:[{type:"text",text:"已收到訊息。"}]});
      this.emit(run.id, {type:"text-delta",runId:run.id,sessionId:run.sessionId,sequence:1,messageId,delta:"已收到訊息。"});
      this.emit(run.id, {type:"run-status",runId:run.id,sessionId:run.sessionId,sequence:2,status:"completed"});
    }, 150);
    return run;
  }
}
const transport = new ChatTransport();
const session = await transport.createSession({title:"題目檢查"});
const panel = <QJudgeChatPanel mode={side ? "sidebar" : "full"} onClose={side ? () => {} : undefined} />;
createRoot(document.getElementById("root")!).render(
  <Theme theme={theme} style={{height:"100dvh"}}>
    <QJudgeCopilotBoundary enabled transport={transport} location={new MemoryCopilotSessionLocation(session.id)} storage={new MemoryCopilotStorage()} translations={new DefaultCopilotTranslations()} modelCatalog={new MemoryCopilotModelCatalog([{id:"luna",displayName:"GPT-6 Luna",isDefault:true},{id:"deepseek",displayName:"DeepSeek V4.1 Flash"}])}>
      {side ? <aside data-testid="chat-frame" className={mobile ? workspace.mobileRightSheet : `${workspace.panel} ${workspace.panelOpen}`} style={{width,maxWidth:"100vw",marginLeft:"auto",transition:"none"}}>
        <div className={workspace.resizeHandle} data-testid="chat-divider" />
        <div className={workspace.panelContent}>{panel}</div>
      </aside> : <main data-testid="chat-frame" style={{height:"100%"}}>{panel}</main>}
    </QJudgeCopilotBoundary>
  </Theme>,
);
