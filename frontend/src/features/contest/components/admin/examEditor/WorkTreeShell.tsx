import type { ReactNode } from "react";
import { SkeletonPlaceholder } from "@carbon/react";
import styles from "./WorkTree.module.scss";

interface WorkTreeShellProps {
  title: ReactNode;
  actions?: ReactNode;
  hasItems: boolean;
  loading?: boolean;
  loadingRows?: number;
  emptyState: ReactNode;
  footer: ReactNode;
  children?: ReactNode;
}

const WorkTreeShell = ({
  title,
  actions,
  hasItems,
  loading = false,
  loadingRows = 8,
  emptyState,
  footer,
  children,
}: WorkTreeShellProps) => (
  <div className={styles.workTree}>
    <div className={styles.treeHeader}>
      <span className={styles.treeTitle}>{title}</span>
      <div className={styles.treeActions}>{actions}</div>
    </div>

    <div className={styles.treeBody} data-testid="work-tree-body">
      {loading ? (
        <div className={styles.skeletonList} data-testid="work-tree-skeleton">
          {Array.from({ length: loadingRows }).map((_, index) => (
            <div key={index} className={styles.skeletonItem}>
              <SkeletonPlaceholder className={styles.skeletonHandle} />
              <SkeletonPlaceholder className={styles.skeletonOrder} />
              <div className={styles.skeletonContent}>
                <SkeletonPlaceholder className={styles.skeletonTitle} />
                <SkeletonPlaceholder className={styles.skeletonMeta} />
              </div>
            </div>
          ))}
        </div>
      ) : hasItems ? (
        children
      ) : (
        <div className={styles.emptyState}>{emptyState}</div>
      )}
    </div>

    <div className={styles.scoreSummary} data-testid="work-tree-footer">
      {footer}
    </div>
  </div>
);

export default WorkTreeShell;

