import { useEffect, useMemo, useState } from "react";
import {
  DataTable,
  InlineLoading,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { useTranslation } from "react-i18next";

import {
  fetchArtifactContent,
  type ArtifactRecord,
} from "@/infrastructure/api/repositories/artifact.repository";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";

import styles from "./ArtifactPreview.module.scss";

interface ArtifactPreviewProps {
  artifact: ArtifactRecord;
}

type PreviewKind = "csv" | "json" | "markdown" | "text";

function detectKind(artifact: ArtifactRecord): PreviewKind {
  const filename = artifact.filename.toLowerCase();
  if (filename.endsWith(".csv")) return "csv";
  if (filename.endsWith(".json")) return "json";
  if (filename.endsWith(".md") || filename.endsWith(".markdown")) return "markdown";
  const ct = (artifact.content_type || "").toLowerCase();
  if (ct.includes("csv")) return "csv";
  if (ct.includes("json")) return "json";
  if (ct.includes("markdown")) return "markdown";
  return "text";
}

/** RFC 4180-style CSV parser: handles "quoted,fields", embedded newlines
 *  inside quotes, and escaped quotes ("") correctly. Trailing empty rows are
 *  stripped. */
function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\r") {
      // Normalize CRLF — the LF next tick closes the row.
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      continue;
    }
    field += ch;
  }
  // Flush trailing field / row if not newline-terminated.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop empty trailing rows (e.g. single empty string from trailing newline).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) {
    rows.pop();
  }
  return rows;
}

interface CsvTableProps {
  header: string[];
  body: string[][];
}

function CsvTable({ header, body }: CsvTableProps) {
  const headers = useMemo(
    () =>
      header.map((h, i) => ({
        key: `col_${i}`,
        header: h,
      })),
    [header],
  );
  const rows = useMemo(
    () =>
      body.map((row, rowIdx) => {
        const entry: { id: string } & Record<string, string> = {
          id: String(rowIdx),
        };
        header.forEach((_, colIdx) => {
          entry[`col_${colIdx}`] = row[colIdx] ?? "";
        });
        return entry;
      }),
    [header, body],
  );

  return (
    <div className={styles.tableWrapper}>
      <DataTable rows={rows} headers={headers} size="sm">
        {({ rows: renderRows, headers: renderHeaders, getHeaderProps, getRowProps, getTableProps }) => (
          <TableContainer>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {renderHeaders.map((h) => (
                    <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                      {h.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {renderRows.map((row) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
}

export function ArtifactPreview({ artifact }: ArtifactPreviewProps) {
  const { t } = useTranslation("chatbot");
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    fetchArtifactContent(artifact.id)
      .then(({ content: body }) => {
        if (cancelled) return;
        setContent(body);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifact.id]);

  if (loading) {
    return (
      <div className={styles.state}>
        <InlineLoading description={t("artifact.loading", "載入中…")} />
      </div>
    );
  }
  if (error) {
    return <div className={styles.error}>{error}</div>;
  }
  if (content == null) {
    return null;
  }

  const kind = detectKind(artifact);

  if (kind === "csv") {
    const rows = parseCsv(content);
    if (rows.length === 0) {
      return <div className={styles.state}>{t("artifact.empty", "空檔案")}</div>;
    }
    const [header, ...body] = rows;
    return <CsvTable header={header} body={body} />;
  }

  if (kind === "json") {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      // fall through to raw
    }
    return <pre className={styles.code}>{pretty}</pre>;
  }

  if (kind === "markdown") {
    return (
      <div className={styles.markdownWrapper}>
        <MarkdownRenderer enableMath enableHighlight enableCopy>
          {content}
        </MarkdownRenderer>
      </div>
    );
  }

  return <pre className={styles.code}>{content}</pre>;
}
