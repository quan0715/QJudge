import {
  Button,
  DataTable,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import {
  ChartBar,
  TaskComplete,
  UserFollow,
  Warning,
} from "@carbon/icons-react";
import type { AdminPanelId } from "@/features/contest/modules/types";
import type {
  AdminOverviewDashboardData,
  AttentionKind,
  OverviewKpiItem,
} from "@/features/contest/screens/admin/panels/adminOverviewDashboard.model";
import styles from "./AdminOverviewCommandCenter.module.scss";

interface AdminOverviewCommandCenterProps {
  data: AdminOverviewDashboardData;
  onOpenPanel: (panel: AdminPanelId) => void;
}

const attentionTagType = (kind: AttentionKind) => {
  if (kind === "locked") return "red";
  if (kind === "violation") return "magenta";
  if (kind === "offline") return "warm-gray";
  return "gray";
};

const kpiToneClass = (tone: OverviewKpiItem["tone"]) => {
  if (tone === "warning") return styles.toneWarning;
  if (tone === "danger") return styles.toneDanger;
  return "";
};

export default function AdminOverviewCommandCenter({
  data,
  onOpenPanel,
}: AdminOverviewCommandCenterProps) {
  const attentionHeaders = [
    { key: "status", header: "狀態" },
    { key: "student", header: "考生" },
    { key: "event", header: "事件" },
    { key: "time", header: "時間" },
    { key: "action", header: "操作" },
  ];
  const attentionRows = data.attentionRows.map((row) => ({
    id: row.id,
    status: row.statusLabel,
    student: row.studentName,
    event: row.eventLabel,
    time: row.timeLabel,
    action: row.id,
  }));
  const panelEntries: Array<{
    key: string;
    title: string;
    description: string;
    panel: AdminPanelId;
    kind: "primary" | "tertiary";
  }> = [
    {
      key: "proctoring",
      title: "即時監控",
      description: "查看監考狀態與異常考生",
      panel: "proctoring",
      kind: "primary",
    },
    {
      key: "problem-editor",
      title: "題目編輯與管理",
      description: `${data.examStatus.workItemLabel} · ${data.examStatus.workItemCount}`,
      panel: "problem_editor",
      kind: "tertiary",
    },
    {
      key: "participants",
      title: "參賽者管理",
      description: "名單、狀態與個別處理",
      panel: "participants",
      kind: "tertiary",
    },
  ];

  return (
    <section className={styles.root} aria-label="教師管理總覽">
      <div className={styles.kpiGrid}>
        {data.kpis.map((item) => {
          const Icon =
            item.key === "attention" || item.key === "locked"
              ? Warning
              : UserFollow;
          return (
            <Tile
              key={item.key}
              className={`${styles.kpiTile} ${kpiToneClass(item.tone)}`}
            >
              <div className={styles.kpiHeader}>
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
              <div className={styles.kpiValue}>{item.value}</div>
            </Tile>
          );
        })}
      </div>

      <div className={styles.primaryGrid}>
        <Tile className={styles.attentionPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>待處理考生</h3>
              <p>只列出需要老師立即確認的狀態。</p>
            </div>
            <Button kind="ghost" onClick={() => onOpenPanel("participants")}>
              查看全部
            </Button>
          </div>
          {attentionRows.length === 0 ? (
            <div className={styles.emptyState}>目前沒有待處理考生</div>
          ) : (
            <DataTable rows={attentionRows} headers={attentionHeaders} size="lg">
              {({
                rows,
                headers,
                getTableProps,
                getHeaderProps,
                getRowProps,
              }) => (
                <TableContainer>
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHeader
                            {...getHeaderProps({ header })}
                            key={header.key}
                          >
                            {header.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => {
                        const source = data.attentionRows.find(
                          (item) => item.id === row.id,
                        );
                        return (
                          <TableRow {...getRowProps({ row })} key={row.id}>
                            <TableCell>
                              <Tag
                                size="sm"
                                type={
                                  source
                                    ? attentionTagType(source.kind)
                                    : "gray"
                                }
                              >
                                {source?.statusLabel}
                              </Tag>
                            </TableCell>
                            <TableCell>{source?.studentName}</TableCell>
                            <TableCell>{source?.eventLabel}</TableCell>
                            <TableCell>{source?.timeLabel}</TableCell>
                            <TableCell>
                              <Button
                                kind="ghost"
                                size="sm"
                                aria-label={`處理 ${source?.studentName}`}
                                onClick={() =>
                                  source && onOpenPanel(source.panelTarget)
                                }
                              >
                                處理
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
          )}
        </Tile>

        <Tile className={styles.statusPanel}>
          <div className={styles.panelHeaderCompact}>
            <h3>考務狀態</h3>
          </div>
          <ProgressBar
            label="時間進度"
            value={data.examStatus.timeProgressPercent}
            size="small"
          />
          <dl className={styles.statusList}>
            <div>
              <dt>考試時間</dt>
              <dd>{data.examStatus.timeWindowLabel}</dd>
            </div>
            <div>
              <dt>剩餘時間</dt>
              <dd>{data.examStatus.remainingLabel}</dd>
            </div>
            <div>
              <dt>{data.examStatus.workItemLabel}</dt>
              <dd>{data.examStatus.workItemCount}</dd>
            </div>
            <div>
              <dt>批改進度</dt>
              <dd>{data.examStatus.gradingLabel}</dd>
            </div>
            <div>
              <dt>成績狀態</dt>
              <dd>{data.examStatus.resultsLabel}</dd>
            </div>
          </dl>
        </Tile>
      </div>

      <div className={styles.secondaryGrid}>
        <Tile className={styles.panel}>
          <div className={styles.panelTitleRow}>
            <ChartBar size={18} />
            <h3>考生分布</h3>
          </div>
          <div className={styles.distributionList}>
            {data.distribution.map((item) => (
              <div key={item.key} className={styles.distributionItem}>
                <div className={styles.distributionMeta}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
                <div
                  className={styles.distributionTrack}
                  role="progressbar"
                  aria-label={item.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.percent}
                >
                  <div
                    className={styles.distributionFill}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className={styles.panel}>
          <div className={styles.panelTitleRow}>
            <Warning size={18} />
            <h3>考務事件</h3>
          </div>
          <ul className={styles.eventList}>
            {data.recentEvents.length === 0 ? (
              <li className={styles.emptyState}>目前沒有事件</li>
            ) : (
              data.recentEvents.map((event) => (
                <li key={event.id}>
                  <span>{event.timeLabel}</span>
                  <strong>{event.label}</strong>
                  <span>{event.studentName}</span>
                </li>
              ))
            )}
          </ul>
        </Tile>

        <Tile className={styles.panel}>
          <div className={styles.panelTitleRow}>
            <TaskComplete size={18} />
            <h3>下一步</h3>
          </div>
          <div className={styles.nextActionList}>
            {panelEntries.map((entry) => (
              <Button
                key={entry.key}
                kind={entry.kind}
                onClick={() => onOpenPanel(entry.panel)}
              >
                <span className={styles.nextActionText}>
                  <span>{entry.title}</span>
                  <small>{entry.description}</small>
                </span>
              </Button>
            ))}
          </div>
        </Tile>
      </div>
    </section>
  );
}
