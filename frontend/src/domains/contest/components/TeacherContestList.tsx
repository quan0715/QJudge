import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
        showError("刪除失敗");
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
        showError("封存失敗");
      }
    }
  };

  const headers = [
    { key: "title", header: "標題" },
    { key: "status", header: "狀態" },
    { key: "time", header: "時間" },
    { key: "visibility", header: "可見性" },
    { key: "actions", header: "操作" },
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
        <Tag type="purple">私有 (密碼)</Tag>
      ) : (
        <Tag type="teal">公開</Tag>
      ),
    actions: (
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Edit}
          iconDescription="編輯"
          hasIconOnly
          onClick={() => navigate(`/contests/${c.id}`)}
        />
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Archive}
          iconDescription="封存"
          hasIconOnly
          onClick={() => handleArchiveClick(c.id)}
          disabled={c.status === "archived"}
        />
        <Button
          kind="danger--ghost"
          size="sm"
          renderIcon={TrashCan}
          iconDescription="刪除"
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
          <TableContainer title="我的競賽管理">
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
        modalHeading="刪除競賽"
        primaryButtonText="刪除"
        secondaryButtonText="取消"
        danger
        onRequestClose={() => setDeleteModalOpen(false)}
        onRequestSubmit={confirmDelete}
      >
        <p>確定要刪除此競賽嗎？此動作無法復原。</p>
      </Modal>

      <Modal
        open={archiveModalOpen}
        modalHeading="封存競賽"
        primaryButtonText="封存"
        secondaryButtonText="取消"
        onRequestClose={() => setArchiveModalOpen(false)}
        onRequestSubmit={confirmArchive}
      >
        <p>確定要封存此競賽嗎？封存後將移至封存列表。</p>
      </Modal>

      {/* Error Modal */}
      <Modal
        open={errorModalOpen}
        modalHeading="錯誤"
        passiveModal
        onRequestClose={() => setErrorModalOpen(false)}
      >
        <p>{errorMessage}</p>
      </Modal>
    </div>
  );
};

export default TeacherContestList;
