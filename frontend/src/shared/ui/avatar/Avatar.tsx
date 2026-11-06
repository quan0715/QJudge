import { useState, type FC } from "react";
import styles from "./Avatar.module.scss";

export interface AvatarProps {
  /** 使用者名稱（用於替代文字與未提供 identity 時的預設圖樣） */
  name?: string;
  /** 穩定的使用者識別，讓改名後仍保有同一預設頭像。 */
  identity?: string | number;
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

const palette = [styles.blue, styles.purple, styles.magenta, styles.teal, styles.cyan, styles.green];

function hashIdentity(seed: string) {
  let hash = 2166136261;
  for (const character of seed) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  return hash >>> 0;
}

/** Actual profile image first; otherwise a locally generated symmetric identicon. */
export const Avatar: FC<AvatarProps> = ({ name, identity, url, size = "md" }) => {
  const [failedUrl, setFailedUrl] = useState<string>();
  const hash = hashIdentity(String(identity ?? name ?? "anonymous"));
  const sizeClass = sizeClassMap[size];
  const pattern = (hash & 0x7fff) || 0x10;

  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt={name || "avatar"}
        onError={() => setFailedUrl(url)}
        className={`${styles.avatar} ${sizeClass}`}
      />
    );
  }

  return (
    <svg role="img" aria-label={name || "avatar"} viewBox="0 0 32 32" shapeRendering="crispEdges"
      className={`${styles.avatar} ${styles.identicon} ${palette[hash % palette.length]} ${sizeClass}`}>
      {Array.from({ length: 15 }, (_, index) => {
        if (!(pattern & (1 << index))) return null;
        const column = index % 3;
        const y = 6 + Math.floor(index / 3) * 4;
        return <g key={index}>
          <rect x={6 + column * 4} y={y} width={4} height={4} />
          {column < 2 && <rect x={6 + (4 - column) * 4} y={y} width={4} height={4} />}
        </g>;
      })}
    </svg>
  );
};

export default Avatar;
