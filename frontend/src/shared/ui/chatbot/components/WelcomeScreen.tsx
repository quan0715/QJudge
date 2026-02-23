import type { FC } from "react";
import { AgentAvatar } from "./AgentAvatar";
import styles from "../ChatbotWidget.module.scss";

export interface SuggestedPrompt {
  icon?: React.ComponentType<{ size?: number }>;
  text: string;
  onClick: () => void;
}

export interface WelcomeScreenProps {
  title?: string;
  subtitle?: string;
  suggestedPrompts?: SuggestedPrompt[];
}

/**
 * Chatbot 歡迎畫面
 * 在沒有訊息時顯示，提供建議操作
 */
export const WelcomeScreen: FC<WelcomeScreenProps> = ({
  title = "我能為您做什麼？",
  subtitle,
  suggestedPrompts = [],
}) => {
  return (
    <div className={styles.welcomeScreen}>
      <div className={styles.welcomeIcon}>
        <AgentAvatar size="lg" />
      </div>

      <h2 className={styles.welcomeTitle}>{title}</h2>

      {subtitle && <p className={styles.welcomeSubtitle}>{subtitle}</p>}

      {suggestedPrompts.length > 0 && (
        <div className={styles.suggestedPrompts}>
          {suggestedPrompts.map((prompt, index) => {
            const Icon = prompt.icon;
            return (
              <button
                key={index}
                className={styles.promptButton}
                onClick={prompt.onClick}
              >
                {Icon && (
                  <div className={styles.promptIcon}>
                    <Icon size={20} />
                  </div>
                )}
                <span className={styles.promptText}>{prompt.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WelcomeScreen;
