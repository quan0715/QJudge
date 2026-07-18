import { useCopilotComposer } from "../hooks/useCopilotComposer";
import { useCopilotRun } from "../hooks/useCopilotRun";

export interface CopilotComposerProps {
  disabled?: boolean;
  placeholder?: string;
}

export function CopilotComposer({ disabled = false, placeholder = "Message AI Copilot" }: CopilotComposerProps) {
  const composer = useCopilotComposer();
  const run = useCopilotRun();
  const busy = run.state.status === "submitted" || run.state.status === "streaming";
  return (
    <form className="copilot-composer" onSubmit={(event) => { event.preventDefault(); void composer.send(); }}>
      <label><span className="copilot-visually-hidden">{placeholder}</span><textarea aria-label={placeholder} value={composer.draft} disabled={disabled} placeholder={placeholder} onChange={(event) => composer.setDraft(event.target.value)} /></label>
      {busy && run.capabilities.cancellableRuns ? <button type="button" onClick={() => void run.stop()}>Stop</button> : <button type="submit" disabled={disabled || !composer.canSend}>Send</button>}
    </form>
  );
}
