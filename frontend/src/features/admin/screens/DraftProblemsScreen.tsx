import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  InlineLoading,
  Tag,
  Layer,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import { requestJson, httpClient } from "@/infrastructure/api/http.client";

interface DraftProblem {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  question_asset_id: string | null;
  submission_count: number;
  accepted_count: number;
  created_by: number | null;
  created_at: string;
}

const fetchDrafts = async (): Promise<DraftProblem[]> =>
  requestJson<DraftProblem[]>(
    httpClient.get("/api/v1/problems/drafts/"),
    "Failed to fetch draft problems"
  );

const DIFFICULTY_TAG: Record<string, "green" | "blue" | "red"> = {
  easy: "green",
  medium: "blue",
  hard: "red",
};

export default function DraftProblemsScreen() {
  const { t } = useTranslation("common");
  const [drafts, setDrafts] = useState<DraftProblem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDrafts(await fetchDrafts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const headers = [
    { key: "title", header: t("drafts.title", "Title") },
    { key: "difficulty", header: t("drafts.difficulty", "Difficulty") },
    { key: "submissions", header: t("drafts.submissions", "Submissions") },
    { key: "created_at", header: t("drafts.createdAt", "Created") },
  ];

  const rows = drafts.map((d) => ({
    id: d.id,
    title: d.title || d.slug || d.id.slice(0, 8),
    difficulty: d.difficulty || "medium",
    submissions: `${d.accepted_count}/${d.submission_count}`,
    created_at: d.created_at
      ? new Date(d.created_at).toLocaleDateString()
      : "-",
  }));

  return (
    <Layer style={{ maxWidth: "64rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ marginBottom: "0.25rem" }}>
        {t("drafts.pageTitle", "Draft Problems")}
      </h2>
      <p style={{ marginBottom: "1.5rem", color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
        {t(
          "drafts.pageDesc",
          "Coding problems not yet added to any question bank. Use the question bank inbox to collect them."
        )}
      </p>

      {loading ? (
        <InlineLoading description={t("loading", "Loading...")} />
      ) : (
        <DataTable rows={rows} headers={headers} isSortable>
          {({
            rows: tableRows,
            headers: tableHeaders,
            getHeaderProps,
            getRowProps,
            getTableContainerProps,
            onInputChange,
          }: any) => (
            <TableContainer {...getTableContainerProps()}>
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    onChange={onInputChange}
                    placeholder={t("drafts.search", "Search by title...")}
                    persistent
                  />
                  <Button
                    kind="ghost"
                    size="sm"
                    hasIconOnly
                    renderIcon={Renew}
                    iconDescription={t("button.refresh", "Refresh")}
                    onClick={() => void load()}
                  />
                </TableToolbarContent>
              </TableToolbar>
              <Table size="lg">
                <TableHead>
                  <TableRow>
                    {tableHeaders.map((header: any) => {
                      const { key, ...headerProps } = getHeaderProps({ header });
                      return (
                        <TableHeader key={key} {...headerProps}>
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length}>
                        <p style={{ padding: "2rem", textAlign: "center", color: "var(--cds-text-secondary)" }}>
                          {t("drafts.empty", "No draft problems. All problems are in a bank.")}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableRows.map((row: any) => {
                      const { key, ...rowProps } = getRowProps({ row });
                      return (
                        <TableRow key={key} {...rowProps}>
                          {row.cells.map((cell: any) => (
                            <TableCell key={cell.id}>
                              {cell.info.header === "difficulty" ? (
                                <Tag size="sm" type={DIFFICULTY_TAG[cell.value] ?? "blue"}>
                                  {cell.value}
                                </Tag>
                              ) : (
                                cell.value
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}
    </Layer>
  );
}
