import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Button,
  Tag,
  Loading,
  Modal,
} from "@carbon/react";
import { Edit, TrashCan, Archive } from "@carbon/icons-react";
import { getContests, deleteContest, archiveContest } from "@/services/contest";
import {
  getContestState,
  getContestStateColor,
  getContestStateLabel,
} from "@/core/entities/contest.entity";
import type { Contest } from "@/core/entities/contest.entity";

interface TeacherContestListProps {
  contests?: Contest[];
  onRefresh?: () => void;
}

const TeacherContestList = ({
  contests: propContests,
  onRefresh,
}: TeacherContestListProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation("contest");
  const { t: tc } = useTranslation("common");
  const [localContests, setLocalContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [contestToDelete, setContestToDelete] = useState<string | null>(null);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);

  const [contestToArchive, setContestToArchive] = useState<string | null>(null);

  // Error Modal State
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setErrorModalOpen(true);
  };

  const contests = propContests || localContests;

  useEffect(() => {
    if (!propContests) {
      loadContests();
    } else {
      setLoading(false);
    }
  }, [propContests]);

  const loadContests = async () => {
    setLoading(true);
    try {
      const data = await getContests("manage");
      setLocalContests(data);
    } catch (err) {
      console.error("Failed to fetch contests", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setContestToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (contestToDelete) {
      try {
        await deleteContest(contestToDelete);
        setDeleteModalOpen(false);
        setContestToDelete(null);
        if (onRefresh) onRefresh();
        else loadContests();
      } catch (error) {
        showError(t("delete.error"));
      }
    }
  };

  const handleArchiveClick = (id: string) => {
    setContestToArchive(id);
    setArchiveModalOpen(true);
  };

  const confirmArchive = async () => {
    if (contestToArchive) {
      try {
        await archiveContest(contestToArchive);
        setArchiveModalOpen(false);
        setContestToArchive(null);
        if (onRefresh) onRefresh();
        else loadContests();
      } catch (error) {
        showError(t("archive.error"));
      }
    }
  };

  const headers = [
    { key: "title", header: tc("table.title") },
    { key: "status", header: tc("table.status") },
    { key: "time", header: tc("table.time") },
    { key: "visibility", header: tc("table.visibility") },
    { key: "actions", header: tc("table.actions") },
  ];

  const rows = contests.map((c) => ({
    id: c.id,
    title: c.name,
    status: (
      <Tag type={getContestStateColor(getContestState(c))}>
        {getContestStateLabel(getContestState(c))}
      </Tag>
    ),
    time: `${new Date(c.startTime).toLocaleString()} ~ ${new Date(
      c.endTime
    ).toLocaleString()}`,
    visibility:
      c.visibility === "private" ? (
        <Tag type="purple">{tc("table.private")}</Tag>
      ) : (
        <Tag type="teal">{tc("table.public")}</Tag>
      ),
    actions: (
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Edit}
          iconDescription={tc("button.edit")}
          hasIconOnly
          onClick={() => navigate(`/contests/${c.id}`)}
        />
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Archive}
          iconDescription={tc("button.archive")}
          hasIconOnly
          onClick={() => handleArchiveClick(c.id)}
          disabled={c.status === "archived"}
        />
        <Button
          kind="danger--ghost"
          size="sm"
          renderIcon={TrashCan}
          iconDescription={tc("button.delete")}
          hasIconOnly
          onClick={() => handleDeleteClick(c.id)}
        />
      </div>
    ),
  }));

  if (loading && !propContests) return <Loading />;

  return (
    <div>
      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getHeaderProps, getTableProps }) => (
          <TableContainer title={t("myContestManagement")}>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
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
                {rows.map((row) => (
                  <TableRow key={row.id}>
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

      <Modal
        open={deleteModalOpen}
        modalHeading={t("delete.title")}
        primaryButtonText={tc("button.delete")}
        secondaryButtonText={tc("button.cancel")}
        danger
        onRequestClose={() => setDeleteModalOpen(false)}
        onRequestSubmit={confirmDelete}
      >
        <p>{t("delete.confirm")}</p>
      </Modal>

      <Modal
        open={archiveModalOpen}
        modalHeading={t("archive.title")}
        primaryButtonText={tc("button.archive")}
        secondaryButtonText={tc("button.cancel")}
        onRequestClose={() => setArchiveModalOpen(false)}
        onRequestSubmit={confirmArchive}
      >
        <p>{t("archive.confirm")}</p>
      </Modal>

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading={tc("message.error")}
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </div>
  );
};

export default TeacherContestList;
