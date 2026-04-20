import { Document, ArrowRight } from "@carbon/icons-react";
import { Tag } from "@carbon/react";

import type { ArtifactRecord } from "@/infrastructure/api/repositories/artifact.repository";
import styles from "./ArtifactInlineCard.module.scss";

interface ArtifactInlineCardProps {
  artifact: ArtifactRecord;
  onClick?: (artifactId: string) => void;
  isActive?: boolean;
}

function formatBytes(n?: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function ArtifactInlineCard({
  artifact,
  onClick,
  isActive = false,
}: ArtifactInlineCardProps) {
  return (
    <button
      type="button"
      className={`${styles.card} ${isActive ? styles.active : ""}`}
      onClick={() => onClick?.(artifact.id)}
      disabled={!onClick}
    >
      <Document size={16} className={styles.icon} />
      <div className={styles.body}>
        <span className={styles.filename}>{artifact.filename}</span>
        <span className={styles.meta}>
          <Tag size="sm" type="cool-gray" className={styles.stepTag}>
            {artifact.step}
          </Tag>
          <span className={styles.size}>{formatBytes(artifact.size_bytes)}</span>
        </span>
      </div>
      {onClick && <ArrowRight size={16} className={styles.arrow} />}
    </button>
  );
}
