/**
 * APIKeyPanel - API Key 管理面板
 *
 * 功能：
 * - 顯示 API Key 狀態
 * - 新增/更新 API Key
 * - 刪除 API Key
 * - 顯示基本用量統計
 */

import React, { useState, useEffect } from "react";
import {
  Button,
  Modal,
  TextInput,
  InlineNotification,
  SkeletonText,
  Tag,
} from "@carbon/react";
import { Add, TrashCan, Renew, Checkmark, WarningAlt } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import {
  getAPIKeyInfo,
  setAPIKey,
  deleteAPIKey,
} from "@/infrastructure/api/repositories/auth.repository";
import type { APIKeyInfo } from "@/core/entities/auth.entity";
import "./APIKeyPanel.scss";

export const APIKeyPanel: React.FC = () => {
  const { t } = useTranslation();
  const [apiKeyInfo, setAPIKeyInfo] = useState<APIKeyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [keyName, setKeyName] = useState("My API Key");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAPIKeyInfo();
  }, []);

  const loadAPIKeyInfo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAPIKeyInfo();
      if (result.success && result.data) {
        setAPIKeyInfo(result.data);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load API key info");
    } finally {
      setIsLoading(false);
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

    // 驗證格式
    if (!keyInput.trim()) {
      setError("請輸入 API Key");
      return;
    }

    if (!keyInput.startsWith("sk-ant-")) {
      setError("無效的 API Key 格式。Anthropic API Key 應該以 'sk-ant-' 開頭。");
      return;
    }

    setIsSaving(true);
    try {
      await setAPIKey({
        api_key: keyInput,
        key_name: keyName || "My API Key",
      });

      setSuccess("API Key 已成功儲存！");
      await loadAPIKeyInfo();

      // 延遲關閉 modal
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess(null);
      }, 1500);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || "儲存失敗";
      setError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    const confirmed = window.confirm(
      "確定要刪除 API Key 嗎？刪除後將無法使用 AI 功能。"
    );

    if (!confirmed) return;

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

  if (isLoading) {
    return (
      <div className="api-key-panel">
        <SkeletonText paragraph lineCount={3} />
      </div>
    );
  }

  return (
    <div className="api-key-panel">
      {error && (
        <InlineNotification
          kind="error"
          title="錯誤"
          subtitle={error}
          onClose={() => setError(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}

      {success && (
        <InlineNotification
          kind="success"
          title="成功"
          subtitle={success}
          onClose={() => setSuccess(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}

      {!apiKeyInfo?.has_key ? (
        <div className="api-key-panel__empty">
          <div className="api-key-panel__empty-icon">
            <WarningAlt size={32} />
          </div>
          <h3 className="api-key-panel__empty-title">尚未設定 API Key</h3>
          <p className="api-key-panel__empty-description">
            您需要新增 Anthropic API Key 才能使用 AI 功能。
            <br />
            請到{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anthropic Console
            </a>{" "}
            建立 API Key。
          </p>
          <Button
            renderIcon={Add}
            onClick={handleOpenModal}
            style={{ marginTop: "1rem" }}
          >
            新增 API Key
          </Button>
        </div>
      ) : (
        <div className="api-key-panel__info">
          <div className="api-key-panel__header">
            <h3 className="api-key-panel__title">API Key 資訊</h3>
            <div className="api-key-panel__status">
              {apiKeyInfo.is_validated ? (
                <Tag type="green" renderIcon={Checkmark}>
                  已驗證
                </Tag>
              ) : (
                <Tag type="red" renderIcon={WarningAlt}>
                  未驗證
                </Tag>
              )}
              {apiKeyInfo.is_active ? (
                <Tag type="blue">啟用中</Tag>
              ) : (
                <Tag type="gray">已停用</Tag>
              )}
            </div>
          </div>

          <div className="api-key-panel__details">
            <div className="api-key-panel__detail-item">
              <span className="api-key-panel__detail-label">名稱</span>
              <span className="api-key-panel__detail-value">
                {apiKeyInfo.key_name}
              </span>
            </div>
            <div className="api-key-panel__detail-item">
              <span className="api-key-panel__detail-label">建立時間</span>
              <span className="api-key-panel__detail-value">
                {apiKeyInfo.created_at
                  ? new Date(apiKeyInfo.created_at).toLocaleDateString("zh-TW")
                  : "-"}
              </span>
            </div>
          </div>

          <div className="api-key-panel__stats">
            <h4 className="api-key-panel__stats-title">累計用量</h4>
            <div className="api-key-panel__stats-grid">
              <div className="api-key-panel__stat-item">
                <span className="api-key-panel__stat-label">總請求數</span>
                <span className="api-key-panel__stat-value">
                  {apiKeyInfo.total_requests?.toLocaleString() || 0}
                </span>
              </div>
              <div className="api-key-panel__stat-item">
                <span className="api-key-panel__stat-label">總 Tokens</span>
                <span className="api-key-panel__stat-value">
                  {(
                    (apiKeyInfo.total_input_tokens || 0) +
                    (apiKeyInfo.total_output_tokens || 0)
                  ).toLocaleString()}
                </span>
              </div>
              <div className="api-key-panel__stat-item">
                <span className="api-key-panel__stat-label">總費用</span>
                <span className="api-key-panel__stat-value">
                  ${apiKeyInfo.total_cost_usd?.toFixed(4) || "0.0000"}
                </span>
              </div>
            </div>
          </div>

          <div className="api-key-panel__actions">
            <Button
              kind="tertiary"
              renderIcon={Renew}
              onClick={handleOpenModal}
            >
              更新 Key
            </Button>
            <Button
              kind="danger--tertiary"
              renderIcon={TrashCan}
              onClick={handleDeleteKey}
            >
              刪除 Key
            </Button>
          </div>
        </div>
      )}

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
          <TextInput
            id="key-name-input"
            labelText="名稱（選填）"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="My API Key"
          />
        </div>
        <div>
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
        </div>
        {success && (
          <InlineNotification
            kind="success"
            title="成功"
            subtitle={success}
            hideCloseButton
            lowContrast
            style={{ marginTop: "1rem" }}
          />
        )}
        <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
          <p>
            如何取得 API Key：
            <br />
            1. 前往{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
            >
              Anthropic Console
            </a>
            <br />
            2. 點擊「Create Key」建立新的 API Key
            <br />
            3. 複製 Key 並貼上到上方欄位
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default APIKeyPanel;
