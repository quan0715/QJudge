import type {
  CopilotTranslationKey,
  CopilotTranslations,
} from "@/core/copilot";

const ENGLISH_TEXT: Record<CopilotTranslationKey, string> = {
  "composer.placeholder": "Type a message…",
  "composer.send": "Send",
  "run.stop": "Stop generating",
  "run.retry": "Retry",
  "session.new": "New chat",
  "session.empty": "No conversations yet",
  "approval.approve": "Approve",
  "approval.reject": "Reject",
  "error.not-found": "The requested conversation could not be found.",
  "error.forbidden": "You do not have access to this conversation.",
  "error.transport-error": "The AI service is unavailable. Please try again.",
  "error.validation-error": "Check your message and try again.",
  "error.stream-disconnected": "The response was interrupted. Reconnecting may help.",
  "error.stream-sequence-error": "The response stream is out of sequence.",
  "error.unsupported-capability": "This action is not supported by the current AI service.",
  "error.run-failed": "The AI task failed. Please try again.",
  "error.run-timeout": "The AI task took too long. Please continue or retry.",
  "error.unknown": "Something went wrong. Please try again.",
};

export class DefaultCopilotTranslations implements CopilotTranslations {
  t(
    key: CopilotTranslationKey,
    values: Record<string, unknown> = {},
  ): string {
    return Object.entries(values).reduce(
      (text, [name, value]) =>
        text.replaceAll(`{{${name}}}`, String(value)),
      ENGLISH_TEXT[key],
    );
  }
}
