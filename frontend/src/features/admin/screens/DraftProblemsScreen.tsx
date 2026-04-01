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
  TableSelectAll,
  TableSelectRow,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  InlineLoading,
  Tag,
  Layer,
  Modal,
  Dropdown,
  InlineNotification,
} from "@carbon/react";
import { Renew, SendAlt, TrashCan } from "@carbon/icons-react";
import { requestJson, httpClient } from "@/infrastructure/api/http.client";
import {
  listMine,
  ingestInbox,
} from "@/infrastructure/api/repositories/questionBank.repository";
import { deleteProblem } from "@/infrastructure/api/repositories/problem.repository";
import type { QuestionBank } from "@/core/entities/question-bank.entity";

interface DraftContestRef {
  id: string;
  name: string;
  status: string;
}

interface DraftProblem {
  id: string;
  title: string;
  slug: string;
  difficulty: string;
  question_asset_id: string | null;
  submission_count: number;
  accepted_count: number;
  created_by: number | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
  draft_state: "draft" | "orphan";
  contests: DraftContestRef[];
}

interface DraftTableHeader {
  key: string;
  header: string;
}

interface DraftTableCell {
  id: string;
  value: string;
  info: {
    header: string;
  };
}

interface DraftTableRow {
  id: string;
  cells: DraftTableCell[];
}

interface DraftTableRenderProps {
  rows: DraftTableRow[];
  headers: DraftTableHeader[];
  getHeaderProps: (args: { header: DraftTableHeader }) => Record<string, unknown>;
  getRowProps: (args: { row: DraftTableRow }) => Record<string, unknown>;
  getSelectionProps: (args?: { row?: DraftTableRow; disabled?: boolean }) => Record<string, unknown>;
  getTableContainerProps: () => Record<string, unknown>;
  selectedRows: Array<{ id: string }>;
  onInputChange: (event: unknown) => void;
}

const fetchDrafts = async (): Promise<DraftProblem[]> =>
  requestJson<DraftProblem[]>(
    httpClient.get("/api/v1/problems/drafts/"),
    "Failed to fetch draft problems",
  );

const DIFFICULTY_TAG: Record<string, "green" | "blue" | "red"> = {
  easy: "green",
  medium: "blue",
  hard: "red",
};

export default function DraftProblemsScreen() {
  const { t } = useTranslation("common");
  const [drafts, setDrafts] = useState<DraftProblem[]>([]);
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [targetBank, setTargetBank] = useState<QuestionBank | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, b] = await Promise.all([fetchDrafts(), listMine()]);
      setDrafts(d);
      setBanks(b.filter((bank) => bank.category === "coding"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canIngestProblem = useCallback((problem: DraftProblem) => {
    return Boolean(problem.question_asset_id);
  }, []);

  const openIngestModal = (ids: string[]) => {
    setSelectedIds(ids);
    setTargetBank(null);
    setIngestError(null);
    setModalOpen(true);
  };

  const handleIngest = async () => {
    if (!targetBank || selectedIds.length === 0) return;
    setIngesting(true);
    setIngestError(null);
    try {
      await ingestInbox({
        targetBankId: targetBank.id,
        items: selectedIds.map((id) => ({
          sourceType: "problem" as const,
          sourceId: id,
        })),
      });
      setModalOpen(false);
      setSelectedIds([]);
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add to bank";
      setIngestError(message);
    } finally {
      setIngesting(false);
    }
  };

  const handleDelete = async (problem: DraftProblem) => {
    const confirmed = window.confirm(
      t(
        "drafts.deleteConfirm",
        'Delete "{{title}}"? This cannot be undone.',
        { title: problem.title || problem.slug || problem.id.slice(0, 8) },
      ),
    );
    if (!confirmed) return;

    setDeletingId(problem.id);
    try {
      await deleteProblem(problem.id);
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  const selectedDrafts = selectedIds
    .map((id) => drafts.find((draft) => draft.id === id) ?? null)
    .filter((draft): draft is DraftProblem => draft !== null);

  const hasSelectedOrphans = selectedDrafts.some((draft) => !canIngestProblem(draft));

  const headers = [
    { key: "title", header: t("drafts.colTitle", "Title") },
    { key: "draft_state", header: t("drafts.colState", "State") },
    { key: "difficulty", header: t("drafts.colDifficulty", "Difficulty") },
    { key: "contests", header: t("drafts.colContests", "Contests") },
    { key: "stats", header: t("drafts.colStats", "AC / Total") },
    { key: "author", header: t("drafts.colAuthor", "Author") },
    { key: "updated_at", header: t("drafts.colUpdated", "Last Updated") },
    { key: "actions", header: t("drafts.colActions", "Actions") },
  ];

  const rows = drafts.map((draft) => ({
    id: draft.id,
    title: draft.title || draft.slug || draft.id.slice(0, 8),
    draft_state: draft.draft_state,
    difficulty: draft.difficulty || "medium",
    contests: draft.contests.map((contest) => contest.name).join(", ") || "-",
    stats: `${draft.accepted_count} / ${draft.submission_count}`,
    author: draft.created_by_username || "-",
    updated_at: draft.updated_at
      ? new Date(draft.updated_at).toLocaleDateString()
      : "-",
    actions: "actions",
  }));

  return (
    <Layer style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ marginBottom: "0.25rem" }}>
        {t("drafts.pageTitle", "Draft Problems")}
      </h2>
      <p
        style={{
          marginBottom: "1.5rem",
          color: "var(--cds-text-secondary)",
          fontSize: "0.875rem",
        }}
      >
        {t(
          "drafts.pageDesc",
          "Coding problems not yet in any question bank. Admins also see unresolved orphan problems here.",
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
            getSelectionProps,
            getTableContainerProps,
            selectedRows,
            onInputChange,
          }: DraftTableRenderProps) => (
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
                  <Button
                    kind="primary"
                    size="sm"
                    renderIcon={SendAlt}
                    disabled={
                      selectedRows.length === 0 ||
                      selectedRows.some((row) => {
                        const draft = drafts.find((item) => item.id === row.id);
                        return !draft || !canIngestProblem(draft);
                      })
                    }
                    onClick={() =>
                      openIngestModal(selectedRows.map((row) => row.id))
                    }
                  >
                    {t("drafts.addToBank", "Add to bank")}
                    {selectedRows.length > 0 && ` (${selectedRows.length})`}
                  </Button>
                </TableToolbarContent>
              </TableToolbar>
              <Table size="lg">
                <TableHead>
                  <TableRow>
                    <TableSelectAll {...getSelectionProps()} />
                    {tableHeaders.map((header, headerIndex: number) => {
                      const { key: _headerKey, ...rest } = getHeaderProps({ header });
                      return (
                        <TableHeader key={header.key ?? headerIndex} {...rest}>
                          {header.header}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tableRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length + 1}>
                        <p
                          style={{
                            padding: "2rem",
                            textAlign: "center",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          {t(
                            "drafts.empty",
                            "No draft problems. All problems are in a bank.",
                          )}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    tableRows.map((row: any) => {
                      const draft = drafts.find((item) => item.id === row.id);
                      const { key: _rowKey, ...rowProps } = getRowProps({ row });
                      const { key: _selectionKey, ...selectionProps } = getSelectionProps({
                        row,
                        disabled: !draft || !canIngestProblem(draft),
                      });

                      return (
                        <TableRow key={row.id} {...rowProps}>
                          <TableSelectRow {...selectionProps} />
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {row.cells.map((cell: any) => (
                            <TableCell key={cell.id}>
                              {cell.info.header === "draft_state" ? (
                                <Tag
                                  size="sm"
                                  type={cell.value === "orphan" ? "red" : "cool-gray"}
                                >
                                  {cell.value === "orphan"
                                    ? t("drafts.stateOrphan", "Orphan")
                                    : t("drafts.stateDraft", "Draft")}
                                </Tag>
                              ) : cell.info.header === "difficulty" ? (
                                <Tag size="sm" type={DIFFICULTY_TAG[cell.value] ?? "blue"}>
                                  {cell.value}
                                </Tag>
                              ) : cell.info.header === "contests" ? (
                                draft?.contests.length ? (
                                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                                    {draft.contests.map((contest) => (
                                      <Tag
                                        key={contest.id}
                                        size="sm"
                                        type={contest.status === "published" ? "green" : "cool-gray"}
                                      >
                                        {contest.name}
                                      </Tag>
                                    ))}
                                  </div>
                                ) : (
                                  "-"
                                )
                              ) : cell.info.header === "actions" ? (
                                draft ? (
                                  <Button
                                    kind="danger--ghost"
                                    size="sm"
                                    renderIcon={TrashCan}
                                    onClick={() => void handleDelete(draft)}
                                    disabled={deletingId === draft.id}
                                  >
                                    {deletingId === draft.id
                                      ? t("drafts.deleting", "Deleting...")
                                      : t("drafts.delete", "Delete")}
                                  </Button>
                                ) : null
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

      <Modal
        open={modalOpen}
        modalHeading={t("drafts.ingestModalTitle", "Add to question bank")}
        primaryButtonText={
          ingesting
            ? t("drafts.ingesting", "Adding...")
            : t("drafts.confirmIngest", "Add")
        }
        secondaryButtonText={t("button.cancel", "Cancel")}
        primaryButtonDisabled={!targetBank || ingesting || hasSelectedOrphans}
        onRequestClose={() => !ingesting && setModalOpen(false)}
        onRequestSubmit={() => void handleIngest()}
        size="sm"
      >
        <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
          {t("drafts.ingestModalDesc", "{{count}} problem(s) will be added to the selected bank.", {
            count: selectedIds.length,
          })}
        </p>
        {hasSelectedOrphans ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t(
              "drafts.orphanCannotIngest",
              "Orphan problems must be resolved or deleted before adding to a bank.",
            )}
            style={{ marginBottom: "1rem" }}
          />
        ) : null}
        <Dropdown
          id="draft-target-bank"
          titleText={t("drafts.targetBank", "Target bank")}
          label={t("drafts.selectBank", "Select a coding bank...")}
          items={banks}
          itemToString={(item: QuestionBank | null) => item?.name ?? ""}
          selectedItem={targetBank}
          onChange={({ selectedItem }: { selectedItem: QuestionBank | null }) =>
            setTargetBank(selectedItem ?? null)
          }
        />
        {ingestError ? (
          <InlineNotification
            kind="error"
            title={ingestError}
            lowContrast
            hideCloseButton
            style={{ marginTop: "1rem" }}
          />
        ) : null}
      </Modal>
    </Layer>
  );
}
