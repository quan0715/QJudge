import { ChartColumn } from "@carbon/icons-react";
import styles from "./ExamStatisticsPanel.module.scss";

export default function CodingStatisticsPlaceholder() {
  return (
    <div className={styles.placeholder}>
      <ChartColumn size={48} />
      <p>Coding 類型的作答統計暫時不支援</p>
    </div>
  );
}
