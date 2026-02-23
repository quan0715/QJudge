import type { FC } from "react";
import agentAvatarWebp from "@/assets/agent-avatar.webp";
import styles from "../ChatbotWidget.module.scss";

export interface AgentAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Agent Avatar 元件
 * 顯示 AI Agent 的頭像圖片
 */
export const AgentAvatar: FC<AgentAvatarProps> = ({
  size = "md",
  className = "",
}) => {
  const sizeMap = {
    sm: 24,
    md: 32,
    lg: 48,
  };

  const dimension = sizeMap[size];

  return (
    <img
      src={agentAvatarWebp}
      alt="Agent Avatar"
      width={dimension}
      height={dimension}
      className={`${styles.agentAvatar} ${styles[`agentAvatar--${size}`]} ${className}`}
      loading="lazy"
    />
  );
};

export default AgentAvatar;
