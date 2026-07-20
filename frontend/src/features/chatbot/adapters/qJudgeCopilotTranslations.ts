import i18n from "@/i18n";
import type {
  CopilotTranslationKey,
  CopilotTranslations,
} from "@copilot";
import { DefaultCopilotTranslations } from "@copilot";

type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

const QJUDGE_KEYS: Record<CopilotTranslationKey, string> = {
  "composer.placeholder": "chatbot:ui.inputPlaceholder",
  "composer.send": "chatbot:ui.send",
  "run.stop": "chatbot:ui.stopGenerating",
  "run.retry": "chatbot:ui.retry",
  "session.new": "chatbot:ui.newChat",
  "session.empty": "chatbot:ui.noHistory",
  "approval.approve": "chatbot:ui.confirmAction",
  "approval.reject": "chatbot:ui.cancelAction",
  "error.transport-error": "chatbot:errors.aiServiceUnavailable",
  "error.validation-error": "chatbot:errors.sendMessageFailed",
  "error.stream-disconnected": "chatbot:errors.resumeAfterAnswerFailed",
  "error.stream-sequence-error": "chatbot:errors.resumeAfterAnswerFailed",
  "error.unsupported-capability": "chatbot:errors.unknownError",
  "error.run-failed": "chatbot:errors.sendMessageFailed",
  "error.run-timeout": "chatbot:errors.resumeAgentFailed",
  "error.not-found": "chatbot:errors.sessionNotFound",
  "error.forbidden": "chatbot:errors.sessionForbidden",
  "error.unknown": "chatbot:errors.unknownError",
};

export class QJudgeCopilotTranslations implements CopilotTranslations {
  private readonly fallback = new DefaultCopilotTranslations();
  private readonly translate: Translate;

  constructor(translate: Translate = (key, options) => i18n.t(key, options)) {
    this.translate = translate;
  }

  t(
    key: CopilotTranslationKey,
    values: Record<string, unknown> = {},
  ): string {
    return this.translate(QJUDGE_KEYS[key], {
      ...values,
      defaultValue: this.fallback.t(key, values),
    });
  }
}
