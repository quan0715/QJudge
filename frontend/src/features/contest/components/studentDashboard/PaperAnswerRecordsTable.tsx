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
  hint?: string;
  layout?: "table" | "document";
}

export default function PaperAnswerRecordsTable({
  rows,
  showGrading,
  layout = "table",
  hint = "展開題目查看原作答、評語與申訴紀錄。",
}: PaperAnswerRecordsTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tableId = useId();

  const toggleRow = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (layout === "document") return (
    <div className={styles.document}>
      {rows.map((row) => <section key={row.id} className={styles.questionSection} aria-label={`第 ${row.label} 題作答內容`}>
        <header className={styles.questionHeader}>
          <div><h3>第 {row.label} 題</h3><span className={styles.type}>{row.typeLabel}</span></div>
          <div className={styles.questionResult}><Tag type={row.tone}>{row.status}</Tag><span className={styles.score}>{showGrading ? row.score : "成績未公布"}</span></div>
        </header>
        {row.detail}
      </section>)}
    </div>
  );

  return (
    <div className={styles.root}>
      <p className={styles.hint}>{hint}</p>
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
                  className={styles.row}
                  onExpand={() => toggleRow(row.id)}
                >
                  {/* Every cell toggles too, so the whole row expands on click. */}
                  <TableCell onClick={() => toggleRow(row.id)}>
                    <span className={styles.question}>第 {row.label} 題</span>
                    <span className={styles.type}>{row.typeLabel}</span>
                  </TableCell>
                  <TableCell className={styles.score} onClick={() => toggleRow(row.id)}>{showGrading ? row.score : "未公布"}</TableCell>
                  <TableCell onClick={() => toggleRow(row.id)}><Tag type={row.tone} className={styles.status}>{row.status}</Tag></TableCell>
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
