import type { FC } from "react";
import styles from "./Avatar.module.scss";

export interface AvatarProps {
  /** 使用者名稱（用於顯示首字母或 alt 文字） */
  name?: string;
  /** 頭像圖片 URL */
  url?: string;
  /** 尺寸：sm (28px)、md (40px)、lg (56px) */
  size?: "sm" | "md" | "lg";
}

const sizeClassMap = {
  sm: styles.avatarSm,
  md: styles.avatarMd,
  lg: styles.avatarLg,
};

/**
 * 頭像元件
 * 支援圖片 URL 顯示或首字母顯示（當無圖片時）
 */
export const Avatar: FC<AvatarProps> = ({ name, url, size = "md" }) => {
  const initial = name?.charAt(0).toUpperCase() || "?";
  const sizeClass = sizeClassMap[size];

  if (url) {
    return (
      <img
        src={url}
        alt={name || "avatar"}
        className={`${styles.avatar} ${sizeClass}`}
      />
    );
  }

  return (
    <div className={`${styles.avatar} ${styles.avatarInitial} ${sizeClass}`}>
      {initial}
    </div>
  );
};

export default Avatar;
