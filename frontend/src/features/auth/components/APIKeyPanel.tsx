import React, { useState, useEffect } from "react";
import {
  Button,
  Modal,
  TextInput,
  InlineNotification,
  SkeletonText,
  Tag,
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
  Tile,
} from "@carbon/react";
import { Add, TrashCan, Renew, Checkmark, WarningAlt } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/features/auth/components/SettingsSection";
import {
  getAPIKeyInfo,
  setAPIKey,
  deleteAPIKey,
  getUsageStats,
} from "@/infrastructure/api/repositories/auth.repository";
import type { APIKeyInfo, UsageStatsData } from "@/core/entities/auth.entity";
import "./APIKeyPanel.scss";

type Granularity = "day" | "week" | "month";

interface APIKeyPanelProps {
  hideUsageDetails?: boolean;
}

export const APIKeyPanel: React.FC<APIKeyPanelProps> = ({ hideUsageDetails = false }) => {
  useTranslation();

  // ── API Key state ──
  const [apiKeyInfo, setAPIKeyInfo] = useState<APIKeyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyName, setKeyName] = useState("My API Key");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Usage state ──
  const [usageData, setUsageData] = useState<UsageStatsData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [startDate, setStartDate] = useState<Date>(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState<Date>(new Date());

  useEffect(() => { loadAPIKeyInfo(); }, []);

  useEffect(() => { loadUsageData(); }, [granularity, startDate, endDate]);

  const loadAPIKeyInfo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAPIKeyInfo();
      if (result.success && result.data) setAPIKeyInfo(result.data);
    } catch (err: any) {
      setError(err.message || "Failed to load API key info");
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsageData = async () => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const result = await getUsageStats({
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        granularity,
      });
      if (result.success && result.data) setUsageData(result.data);
    } catch (err: any) {
      setUsageError(err.message || "Failed to load usage data");
    } finally {
      setUsageLoading(false);
    }
  };

  const handleOpenModal = () => {
    setKeyInput("");
    setKeyName(apiKeyInfo?.key_name || "My API Key");
    setError(null);
    setSuccess(null);
    setIsModalOpen(true);
  };

  const handleSaveKey = async () => {
    setError(null);
    setSuccess(null);
    if (!keyInput.trim()) { setError("請輸入 API Key"); return; }
    if (!keyInput.startsWith("sk-ant-")) {
      setError("無效的 API Key 格式，應以 'sk-ant-' 開頭");
      return;
    }
    setIsSaving(true);
    try {
      await setAPIKey({ api_key: keyInput, key_name: keyName || "My API Key" });
      setSuccess("API Key 已成功儲存！");
      await loadAPIKeyInfo();
      setTimeout(() => { setIsModalOpen(false); setSuccess(null); }, 1500);
    } catch (err: any) {
      const raw = err.response?.data?.error;
      setError(typeof raw === "string" ? raw : raw?.message || err.message || "儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!window.confirm("確定要刪除 API Key 嗎？刪除後將無法使用 AI 功能。")) return;
    setError(null);
    try {
      await deleteAPIKey();
      setSuccess("API Key 已刪除");
      await loadAPIKeyInfo();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "刪除失敗");
    }
  };

  // Usage table
  const tableHeaders = [
    { key: "period", header: "日期" },
    { key: "requests", header: "請求數" },
    { key: "input_tokens", header: "輸入 Tokens" },
    { key: "output_tokens", header: "輸出 Tokens" },
    { key: "cost_usd", header: "費用 (USD)" },
  ];

  const tableRows = (usageData?.breakdown ?? []).map((item, i) => ({
    id: String(i),
    period: new Date(item.period).toLocaleDateString("zh-TW"),
    requests: item.requests.toLocaleString(),
    input_tokens: item.input_tokens.toLocaleString(),
    output_tokens: item.output_tokens.toLocaleString(),
    cost_usd: `$${item.cost_usd.toFixed(4)}`,
  }));

  return (
    <div className="settings-panel">
      {/* ── Section: API Key ── */}
      <SettingsSection title="API Key" description="管理您的 Anthropic API Key，用於 AI 功能">
        {isLoading ? (
          <SkeletonText paragraph lineCount={3} />
        ) : (
          <>
            {error && (
              <InlineNotification kind="error" title={error} onClose={() => setError(null)} lowContrast style={{ marginBottom: "1rem" }} />
            )}
            {success && (
              <InlineNotification kind="success" title={success} onClose={() => setSuccess(null)} lowContrast style={{ marginBottom: "1rem" }} />
            )}

            {!apiKeyInfo?.has_key ? (
              <div className="api-key-panel__empty">
                <WarningAlt size={24} />
                <p>尚未設定 API Key。前往 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic Console</a> 建立。</p>
                <Button renderIcon={Add} size="sm" onClick={handleOpenModal}>新增 API Key</Button>
              </div>
            ) : (
              <>
                <div className="api-key-panel__info-row">
                  <span className="api-key-panel__info-label">名稱</span>
                  <span>{apiKeyInfo.key_name}</span>
                </div>
                <div className="api-key-panel__info-row">
                  <span className="api-key-panel__info-label">狀態</span>
                  <span className="api-key-panel__tags">
                    {apiKeyInfo.is_validated ? <Tag type="green" size="sm" renderIcon={Checkmark}>已驗證</Tag> : <Tag type="red" size="sm">未驗證</Tag>}
                    {apiKeyInfo.is_active ? <Tag type="blue" size="sm">啟用中</Tag> : <Tag type="gray" size="sm">已停用</Tag>}
                  </span>
                </div>
                <div className="api-key-panel__info-row">
                  <span className="api-key-panel__info-label">建立時間</span>
                  <span>{apiKeyInfo.created_at ? new Date(apiKeyInfo.created_at).toLocaleDateString("zh-TW") : "-"}</span>
                </div>
                <div className="api-key-panel__actions">
                  <Button kind="tertiary" size="sm" renderIcon={Renew} onClick={handleOpenModal}>更新 Key</Button>
                  <Button kind="danger--tertiary" size="sm" renderIcon={TrashCan} onClick={handleDeleteKey}>刪除 Key</Button>
                </div>
              </>
            )}
          </>
        )}
      </SettingsSection>

      {/* ── Section: Usage ── */}
      <SettingsSection title="用量統計" description="AI API 使用量摘要與明細">
        {usageLoading ? (
          <SkeletonText paragraph lineCount={3} />
        ) : usageError ? (
          <InlineNotification kind="error" title={usageError} onClose={() => setUsageError(null)} lowContrast />
        ) : usageData ? (
          <>
            <div className="api-key-panel__stats-grid">
              <Tile className="api-key-panel__stat-card">
                <span className="api-key-panel__stat-label">總 Tokens</span>
                <span className="api-key-panel__stat-value">
                  {(usageData.total.input_tokens + usageData.total.output_tokens).toLocaleString()}
                </span>
              </Tile>
              <Tile className="api-key-panel__stat-card">
                <span className="api-key-panel__stat-label">總請求數</span>
                <span className="api-key-panel__stat-value">{usageData.total.requests.toLocaleString()}</span>
              </Tile>
              <Tile className="api-key-panel__stat-card">
                <span className="api-key-panel__stat-label">總費用</span>
                <span className="api-key-panel__stat-value">${usageData.total.cost_usd.toFixed(4)}</span>
              </Tile>
            </div>

            {!hideUsageDetails && (
              <>
                <div className="api-key-panel__filters">
                  <DatePicker
                    datePickerType="range"
                    value={[startDate, endDate]}
                    onChange={(dates: Date[]) => { if (dates.length === 2) { setStartDate(dates[0]); setEndDate(dates[1]); } }}
                  >
                    <DatePickerInput id="start-date" placeholder="yyyy-mm-dd" labelText="開始日期" size="sm" />
                    <DatePickerInput id="end-date" placeholder="yyyy-mm-dd" labelText="結束日期" size="sm" />
                  </DatePicker>
                  <Select id="granularity" labelText="粒度" value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)} size="sm">
                    <SelectItem value="day" text="每日" />
                    <SelectItem value="week" text="每週" />
                    <SelectItem value="month" text="每月" />
                  </Select>
                </div>

                {tableRows.length === 0 ? (
                  <p className="api-key-panel__no-data">所選日期範圍內無用量資料</p>
                ) : (
                  <DataTable rows={tableRows} headers={tableHeaders}>
                    {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
                      <Table {...getTableProps()} size="sm">
                        <TableHead>
                          <TableRow>
                            {headers.map((h: any) => {
                              const { key: _k, ...hp } = getHeaderProps({ header: h });
                              return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>;
                            })}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row: any) => {
                            const { key: _k, ...rp } = getRowProps({ row });
                            return (
                              <TableRow key={row.id} {...rp}>
                                {row.cells.map((cell: any) => (
                                  <TableCell key={cell.id}>{cell.value}</TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </DataTable>
                )}
              </>
            )}
          </>
        ) : (
          <p className="api-key-panel__no-data">無用量資料</p>
        )}
      </SettingsSection>

      {/* Modal */}
      <Modal
        open={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        modalHeading={apiKeyInfo?.has_key ? "更新 API Key" : "新增 API Key"}
        primaryButtonText={isSaving ? "儲存中..." : "儲存"}
        secondaryButtonText="取消"
        onRequestSubmit={handleSaveKey}
        primaryButtonDisabled={isSaving}
      >
        <div style={{ marginBottom: "1rem" }}>
          <TextInput id="key-name-input" labelText="名稱（選填）" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="My API Key" />
        </div>
        <TextInput
          id="api-key-input"
          labelText="Anthropic API Key"
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="sk-ant-api03-..."
          helperText="您的 API Key 將被加密儲存"
          invalid={!!error && !success}
          invalidText={error || ""}
        />
        {success && <InlineNotification kind="success" title={success} hideCloseButton lowContrast style={{ marginTop: "1rem" }} />}
      </Modal>
    </div>
  );
};

export default APIKeyPanel;
