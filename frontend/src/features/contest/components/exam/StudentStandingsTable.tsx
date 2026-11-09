import { useTranslation } from "react-i18next";
import type { ScoreboardData, ScoreboardProblemCell } from "@/core/entities/contest.entity";
import { formatScoreCompact as score } from "@/shared/utils/scoreFormat";
import styles from "./StudentStandingsTable.module.scss";

export default function StudentStandingsTable({ data, currentUserId }: { data: ScoreboardData; currentUserId?: string }) {
  const { t } = useTranslation("contest");
  const me = data.rows.find(row => row.userId === currentUserId);
  const label = (key: string, fallback: string) => t(`workspace.standings.${key}`, fallback);
  const cellContent = (cell: ScoreboardProblemCell | undefined, max: number) => {
    if (!cell) return <span aria-label={t("workspace.status.notSubmitted", "未提交")}>—</span>;
    const accepted = cell.status === "AC";
    const partial = !accepted && cell.score > 0;
    const tone = accepted ? "success" : partial || cell.pending ? "warning" : cell.tries > 0 ? "danger" : "neutral";
    return <span className={styles.cell} data-tone={tone}>
      {accepted ? <span aria-label={t("workspace.status.accepted", "已通過")}>{score(cell.score)}</span> : partial ? <><strong>{score(cell.score)} / {score(cell.max_score ?? max)}</strong><small>{cell.status} · {cell.tries}</small></> : cell.tries ? <span>−{cell.tries}</span> : !cell.pending ? "—" : null}
      {cell.pending && <span aria-label={t("workspace.status.judging", "評測中")}>…</span>}
    </span>;
  };
  return <>
    {me && <dl className={styles.summary}>
      <div><dt>{label("rank", "名次")}</dt><dd>#{me.rank}</dd></div>
      <div><dt>{label("solved", "通過")}</dt><dd>{me.solvedCount} / {data.problems.length}</dd></div>
      <div><dt>{label("score", "分數")}</dt><dd>{score(me.totalScore)} / {score(data.problems.reduce((n, p) => n + p.score, 0))}</dd></div>
    </dl>}
    <div className={styles.scroll} role="region" aria-label={label("title", "排行榜")} tabIndex={0}>
      <table className={styles.table}><thead><tr>
        <th scope="col">{label("rank", "名次")}</th><th scope="col">{label("student", "學生")}</th>
        {data.problems.map(p => <th key={p.id} scope="col">{p.label}</th>)}
        <th scope="col">{label("solved", "通過")}</th><th scope="col">{label("score", "分數")}</th>
      </tr></thead><tbody>{data.rows.map(row => <tr key={row.userId} aria-current={row.userId === currentUserId ? "true" : undefined}>
        <td>{row.rank}</td><th scope="row">{row.displayName}</th>
        {data.problems.map(p => <td key={p.id}>{cellContent(row.problems[p.problemId], p.score)}</td>)}
        <td>{row.solvedCount}</td><td><strong>{score(row.totalScore)}</strong></td>
      </tr>)}</tbody></table>
    </div>
  </>;
}
