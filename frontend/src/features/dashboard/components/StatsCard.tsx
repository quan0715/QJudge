import { Tile, SkeletonText, Stack } from "@carbon/react";
import { CheckmarkOutline } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import type { FC } from "react";
import "./StatsCard.scss";

export interface StatsData {
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  total_easy: number;
  total_medium: number;
  total_hard: number;
}

interface StatsCardProps {
  loading?: boolean;
  stats: StatsData | null;
  title: string;
  subtitle?: string;
}

const difficultyMeta = [
  { key: "easy" },
  { key: "medium" },
  { key: "hard" },
];

export const StatsCard: FC<StatsCardProps> = ({ loading, stats, title, subtitle }) => {
  const { t } = useTranslation("common");
  const totalProblems =
    (stats?.total_easy || 0) + (stats?.total_medium || 0) + (stats?.total_hard || 0);

  return (
    <Tile className="stats-card">
      <div className="stats-card__header">
        <CheckmarkOutline size={24} className="stats-card__icon" />
        <div className="stats-card__titles">
          <h4 className="stats-card__title">{title}</h4>
          {subtitle && <p className="stats-card__subtitle">{subtitle}</p>}
        </div>
      </div>

      {loading ? (
        <SkeletonText paragraph lineCount={4} />
      ) : stats ? (
        <Stack gap={3}>
          <div className="stats-card__total">
            <span className="stats-card__total-number">{stats.total_solved}</span>
            <span className="stats-card__total-caption">
              {t("dashboard.stats.solvedCount", { total: totalProblems })}
            </span>
          </div>
          <div className="stats-card__segments">
            {difficultyMeta.map((item) => {
              const solved = (stats as any)[`${item.key}_solved`] || 0;
              const total = (stats as any)[`total_${item.key}`] || 0;
              return (
                <div className="stats-card__segment" key={item.key}>
                  <div className="stats-card__segment-header">
                    <div className="stats-card__segment-label" data-variant={item.key}>
                      {t(`dashboard.difficulty.${item.key}`)}
                    </div>
                    <div className="stats-card__segment-value">
                      {solved} / {total}
                    </div>
                  </div>
                  <div className="stats-card__segment-bar">
                    <span
                      className="stats-card__segment-fill"
                      data-variant={item.key}
                      style={{
                        width: total ? `${Math.min(100, (solved / total) * 100)}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Stack>
      ) : (
        <p className="stats-card__empty">{t("dashboard.stats.noStats")}</p>
      )}
    </Tile>
  );
};

export default StatsCard;
