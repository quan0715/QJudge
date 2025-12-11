import { useState, useEffect, useMemo } from "react";
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
  Loading,
  InlineNotification,
  Pagination,
  Tag,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import type { ExamEvent } from "@/core/entities/contest.entity";
import { useContest } from "@/domains/contest/contexts/ContestContext";
import ContainerCard from "@/ui/components/layout/ContainerCard";
import SurfaceSection from "@/ui/components/layout/SurfaceSection";

const ContestAdminLogsPage = () => {
  // Use examEvents from context - no local fetch needed
  const { examEvents, isRefreshing, refreshAdminData } = useContest();

  const [filteredEvents, setFilteredEvents] = useState<ExamEvent[]>([]);
  const [notification, setNotification] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Sort events by timestamp (most recent first)
  const sortedEvents = useMemo(() => {
    return [...examEvents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [examEvents]);

  // Filter events when search term changes
  useEffect(() => {
    if (!searchTerm) {
      setFilteredEvents(sortedEvents);
    } else {
      const lowerSearch = searchTerm.toLowerCase();
      const filtered = sortedEvents.filter(
        (e) =>
          e.userName?.toLowerCase().includes(lowerSearch) ||
          e.eventType?.toLowerCase().includes(lowerSearch) ||
          e.reason?.toLowerCase().includes(lowerSearch)
      );
      setFilteredEvents(filtered);
    }
    setPage(1); // Reset to first page on search
  }, [searchTerm, sortedEvents]);

  // Comprehensive event type mapping
  const getEventTag = (type: string) => {
    const eventMap: Record<string, { label: string; type: any }> = {
      // Exam/Contest events
      join: { label: "加入", type: "green" },
      register: { label: "註冊", type: "green" },
      enter_contest: { label: "進入競賽", type: "blue" },
      start_exam: { label: "開始考試", type: "cyan" },
      end_exam: { label: "結束考試", type: "magenta" },
      leave: { label: "離開競賽", type: "gray" },

      // Submission events
      submit: { label: "提交", type: "blue" },
      submit_code: { label: "提交程式碼", type: "purple" },

      // Cheat detection events
      tab_switch: { label: "切換分頁", type: "red" },
      tab_hidden: { label: "隱藏分頁", type: "red" },
      window_blur: { label: "離開視窗", type: "red" },
      exit_fullscreen: { label: "退出全螢幕", type: "red" },
      cheat_warning: { label: "違規警告", type: "red" },
      lock: { label: "鎖定", type: "magenta" },
      lock_user: { label: "鎖定用戶", type: "red" },
      unlock: { label: "解鎖", type: "teal" },
      unlock_user: { label: "解鎖用戶", type: "teal" },

      // Exam state events
      resume_exam: { label: "繼續考試", type: "cyan" },
      pause_exam: { label: "暫停考試", type: "gray" },

      // Q&A events
      ask_question: { label: "提問", type: "blue" },
      reply_question: { label: "回覆提問", type: "blue" },
      announce: { label: "發布公告", type: "magenta" },

      // Admin events
      update_problem: { label: "更新題目", type: "gray" },
      update_participant: { label: "更新參與者", type: "gray" },
      publish_problem_to_practice: { label: "發布到練習區", type: "cool-gray" },
    };

    const config = eventMap[type] || { label: type, type: "outline" };
    return (
      <Tag type={config.type} size="sm">
        {config.label}
      </Tag>
    );
  };

  const headers = [
    { key: "timestamp", header: "時間" },
    { key: "userName", header: "使用者" },
    { key: "eventType", header: "事件類型" },
    { key: "reason", header: "詳細內容" },
  ];

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedEvents = filteredEvents.slice(startIndex, endIndex);

  const loading = examEvents.length === 0 && isRefreshing;

  return (
    <SurfaceSection maxWidth="1056px" style={{ flex: 1, minHeight: "100%" }}>
      <div
        style={{
          padding: "0",
          maxWidth: "100%",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {notification && (
          <InlineNotification
            kind={notification.kind}
            title={notification.kind === "success" ? "成功" : "錯誤"}
            subtitle={notification.message}
            onClose={() => setNotification(null)}
            style={{ marginBottom: "1rem", maxWidth: "100%" }}
          />
        )}

        {loading ? (
          <Loading withOverlay={false} />
        ) : (
          <ContainerCard
            title="考試紀錄"
            noPadding
            action={
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Renew}
                onClick={refreshAdminData}
                hasIconOnly
                iconDescription="重新整理"
                disabled={isRefreshing}
              />
            }
          >
            <DataTable
              rows={paginatedEvents.map((e, index) => ({
                ...e,
                id: e.id ? e.id.toString() : index.toString(),
                userName: e.userName || "Unknown",
                reason: e.reason || "-",
              }))}
              headers={headers}
            >
              {({
                rows,
                headers,
                getHeaderProps,
                getRowProps,
                getTableProps,
              }: any) => (
                <TableContainer>
                  <TableToolbar>
                    <TableToolbarContent>
                      <TableToolbarSearch
                        onChange={(e: any) =>
                          setSearchTerm(e.target?.value || "")
                        }
                        placeholder="搜尋事件..."
                        persistent
                      />
                    </TableToolbarContent>
                  </TableToolbar>
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header: any) => {
                          const { key, ...headerProps } = getHeaderProps({
                            header,
                          });
                          return (
                            <TableHeader key={key} {...headerProps}>
                              {header.header}
                            </TableHeader>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row: any) => {
                        const event = filteredEvents.find(
                          (e, i) =>
                            (e.id ? e.id.toString() : i.toString()) === row.id
                        );
                        const { key: rowKey, ...rowProps } = getRowProps({
                          row,
                        });
                        return (
                          <TableRow key={rowKey} {...rowProps}>
                            <TableCell>
                              {new Date(
                                row.cells.find(
                                  (c: any) => c.info.header === "timestamp"
                                )?.value
                              ).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {
                                row.cells.find(
                                  (c: any) => c.info.header === "userName"
                                )?.value
                              }
                            </TableCell>
                            <TableCell>
                              {event
                                ? getEventTag(event.eventType)
                                : row.cells.find(
                                    (c: any) => c.info.header === "eventType"
                                  )?.value}
                            </TableCell>
                            <TableCell>
                              {
                                row.cells.find(
                                  (c: any) => c.info.header === "reason"
                                )?.value
                              }
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
            <Pagination
              totalItems={filteredEvents.length}
              backwardText="上一頁"
              forwardText="下一頁"
              itemsPerPageText="每頁顯示"
              page={page}
              pageSize={pageSize}
              pageSizes={[20, 50, 100, 200]}
              onChange={({ page: newPage, pageSize: newPageSize }: any) => {
                setPage(newPage);
                setPageSize(newPageSize);
              }}
            />
          </ContainerCard>
        )}
      </div>
    </SurfaceSection>
  );
};

export default ContestAdminLogsPage;
