/**
 * UsagePanel - 用量統計面板
 *
 * 功能：
 * - 顯示總計統計
 * - 查詢特定日期範圍的用量
 * - 按日/週/月顯示明細
 */

import React, { useState, useEffect } from "react";
import {
  DatePicker,
  DatePickerInput,
  Select,
  SelectItem,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  SkeletonText,
  InlineNotification,
  Tile,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { getUsageStats } from "@/infrastructure/api/repositories/auth.repository";
import type { UsageStatsData } from "@/core/entities/auth.entity";
import "./UsagePanel.scss";

type Granularity = "day" | "week" | "month";

export const UsagePanel: React.FC = () => {
  const { t } = useTranslation();
  const [usageData, setUsageData] = useState<UsageStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [startDate, setStartDate] = useState<Date>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 天前
  );
  const [endDate, setEndDate] = useState<Date>(new Date());

  useEffect(() => {
    loadUsageData();
  }, [granularity, startDate, endDate]);

  const loadUsageData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getUsageStats({
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        granularity,
      });

      if (result.success && result.data) {
        setUsageData(result.data);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load usage data");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="usage-panel">
        <SkeletonText paragraph lineCount={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="usage-panel">
        <InlineNotification
          kind="error"
          title="錯誤"
          subtitle={error}
          onClose={() => setError(null)}
        />
      </div>
    );
  }

  if (!usageData) {
    return (
      <div className="usage-panel">
        <p>無用量資料</p>
      </div>
    );
  }

  const { total, breakdown } = usageData;

  // 準備 DataTable 的資料
  const tableHeaders = [
    { key: "period", header: "日期" },
    { key: "requests", header: "請求數" },
    { key: "input_tokens", header: "輸入 Tokens" },
    { key: "output_tokens", header: "輸出 Tokens" },
    { key: "cost_usd", header: "費用 (USD)" },
  ];

  const tableRows = breakdown.map((item, index) => ({
    id: String(index),
    period: new Date(item.period).toLocaleDateString("zh-TW"),
    requests: item.requests.toLocaleString(),
    input_tokens: item.input_tokens.toLocaleString(),
    output_tokens: item.output_tokens.toLocaleString(),
    cost_usd: `$${item.cost_usd.toFixed(4)}`,
  }));

  return (
    <div className="usage-panel">
      {/* 總計統計卡片 */}
      <div className="usage-panel__summary">
        <h3 className="usage-panel__section-title">總計統計</h3>
        <div className="usage-panel__summary-grid">
          <Tile className="usage-panel__summary-card">
            <div className="usage-panel__summary-label">總 Tokens</div>
            <div className="usage-panel__summary-value">
              {(total.input_tokens + total.output_tokens).toLocaleString()}
            </div>
            <div className="usage-panel__summary-detail">
              輸入: {total.input_tokens.toLocaleString()} / 輸出:{" "}
              {total.output_tokens.toLocaleString()}
            </div>
          </Tile>

          <Tile className="usage-panel__summary-card">
            <div className="usage-panel__summary-label">總請求數</div>
            <div className="usage-panel__summary-value">
              {total.requests.toLocaleString()}
            </div>
          </Tile>

          <Tile className="usage-panel__summary-card">
            <div className="usage-panel__summary-label">總費用</div>
            <div className="usage-panel__summary-value">
              ${total.cost_usd.toFixed(4)}
            </div>
          </Tile>
        </div>
      </div>

      {/* 篩選控制 */}
      <div className="usage-panel__filters">
        <h3 className="usage-panel__section-title">明細查詢</h3>
        <div className="usage-panel__filters-row">
          <DatePicker
            datePickerType="range"
            value={[startDate, endDate]}
            onChange={(dates: Date[]) => {
              if (dates.length === 2) {
                setStartDate(dates[0]);
                setEndDate(dates[1]);
              }
            }}
          >
            <DatePickerInput
              id="start-date"
              placeholder="yyyy-mm-dd"
              labelText="開始日期"
              size="md"
            />
            <DatePickerInput
              id="end-date"
              placeholder="yyyy-mm-dd"
              labelText="結束日期"
              size="md"
            />
          </DatePicker>

          <Select
            id="granularity"
            labelText="時間粒度"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
          >
            <SelectItem value="day" text="每日" />
            <SelectItem value="week" text="每週" />
            <SelectItem value="month" text="每月" />
          </Select>
        </div>
      </div>

      {/* 明細表格 */}
      <div className="usage-panel__table">
        {breakdown.length === 0 ? (
          <InlineNotification
            kind="info"
            title="無資料"
            subtitle="所選日期範圍內無用量資料"
            hideCloseButton
            lowContrast
          />
        ) : (
          <DataTable rows={tableRows} headers={tableHeaders}>
            {({
              rows,
              headers,
              getTableProps,
              getHeaderProps,
              getRowProps,
            }) => (
              <Table {...getTableProps()} size="md">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader {...getHeaderProps({ header })} key={header.key}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow {...getRowProps({ row })} key={row.id}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{cell.value}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DataTable>
        )}
      </div>
    </div>
  );
};

export default UsagePanel;
