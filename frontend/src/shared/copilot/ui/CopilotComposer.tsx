import { useCopilotComposer } from "../hooks/useCopilotComposer";
import { useCopilotModels } from "../hooks/useCopilotModels";
import { useCopilotRun } from "../hooks/useCopilotRun";

export interface CopilotComposerProps {
  disabled?: boolean;
  placeholder?: string;
}

export function CopilotComposer({ disabled = false, placeholder = "Message AI Copilot" }: CopilotComposerProps) {
  const composer = useCopilotComposer();
  const models = useCopilotModels();
  const run = useCopilotRun();
  const busy = run.state.status === "submitted" || run.state.status === "streaming";
  return (
    <form className="copilot-composer" onSubmit={(event) => { event.preventDefault(); void composer.send(); }}>
      {models.status !== "unavailable" && models.models.length > 0 && <label><span className="copilot-visually-hidden">Model</span><select aria-label="Model" value={models.selectedModelId ?? ""} disabled={disabled || models.status === "loading"} onChange={(event) => models.select(event.target.value || null)}>{models.models.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}</select></label>}
      <label><span className="copilot-visually-hidden">{placeholder}</span><textarea aria-label={placeholder} value={composer.draft} disabled={disabled} placeholder={placeholder} onChange={(event) => composer.setDraft(event.target.value)} /></label>
      {busy && run.capabilities.cancellableRuns ? <button type="button" onClick={() => void run.stop()}>Stop</button> : <button type="submit" disabled={disabled || !composer.canSend}>Send</button>}
    </form>
  );
}
