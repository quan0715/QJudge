export interface CopilotScrollToLatestButtonProps { visible: boolean; onClick(): void; }
export function CopilotScrollToLatestButton({ visible, onClick }: CopilotScrollToLatestButtonProps) { return visible ? <button className="copilot-scroll-latest" type="button" onClick={onClick}>Latest messages</button> : null; }
