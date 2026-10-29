import { Fragment, useId, useState, type ReactNode } from "react";
import {
  Table, TableBody, TableCell, TableExpandHeader, TableExpandRow,
  TableHead, TableHeader, TableRow, Tag,
} from "@carbon/react";
import styles from "./PaperAnswerRecordsTable.module.scss";

export interface PaperAnswerRecordRow {
  id: string;
  label: string;
  typeLabel: string;
  score: string;
  status: string;
  tone: "warm-gray" | "cool-gray" | "green" | "cyan" | "red";
  detail: ReactNode;
}

interface PaperAnswerRecordsTableProps {
  rows: PaperAnswerRecordRow[];
  showGrading: boolean;
}

export default function PaperAnswerRecordsTable({ rows, showGrading }: PaperAnswerRecordsTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tableId = useId();

  const toggleRow = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className={styles.root}>
      <p className={styles.hint}>展開題目查看原作答、評語與申訴紀錄。</p>
      <Table aria-label="各題作答紀錄" size="lg" className={styles.table}>
        <TableHead>
          <TableRow>
            <TableExpandHeader className={styles.columnHeader} id={`${tableId}-expand`} />
            <TableHeader className={styles.columnHeader}>題目</TableHeader>
            <TableHeader className={styles.columnHeader}>得分</TableHeader>
            <TableHeader className={styles.columnHeader}>狀態</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const open = expanded.has(row.id);
            const detailId = `${tableId}-detail-${index}`;
            return (
              <Fragment key={row.id}>
                <TableExpandRow
                  aria-label={`${open ? "收合" : "展開"}第 ${row.label} 題`}
                  aria-controls={detailId}
                  expandHeader={`${tableId}-expand`}
                  isExpanded={open}
                  onExpand={() => toggleRow(row.id)}
                >
                  <TableCell>
                    <span className={styles.question}>第 {row.label} 題</span>
                    <span className={styles.type}>{row.typeLabel}</span>
                  </TableCell>
                  <TableCell className={styles.score}>{showGrading ? row.score : "未公布"}</TableCell>
                  <TableCell><Tag type={row.tone} className={styles.status}>{row.status}</Tag></TableCell>
                </TableExpandRow>
                {open && (
                  <TableRow id={detailId}>
                    <TableCell colSpan={4} className={styles.detailCell}>
                      <div className={styles.detail} role="region" aria-label={`第 ${row.label} 題作答詳情`}>
                        {row.detail}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
