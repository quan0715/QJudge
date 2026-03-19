/**
 * LoginRecordsPanel - 登入紀錄面板
 *
 * 顯示最近 30 天的登入紀錄，並提供「登出其他裝置」功能。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  DataTable,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  SkeletonText,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import type { UserLoginRecord } from "@/core/entities/auth.entity";
import {
  getLoginRecords,
  logoutOtherDevices,
} from "@/infrastructure/api/repositories/auth.repository";

/** Parse user-agent into a short readable label. */
function parseUA(ua: string): string {
  if (!ua) return "-";
  // Browser
  let browser = "Unknown";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";
  // OS
  let os = "";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return os ? `${browser} / ${os}` : browser;
}

const LOGIN_METHOD_LABELS: Record<string, string> = {
  email: "Email",
  "nycu-oauth": "NYCU OAuth",
  google: "Google",
  github: "GitHub",
  takeover: "Takeover",
  token_refresh: "Token Refresh",
};

const headers = [
  { key: "device", header: "裝置" },
  { key: "ip_address", header: "IP" },
  { key: "login_method", header: "登入方式" },
  { key: "created_at", header: "時間" },
  { key: "status", header: "狀態" },
];

export const LoginRecordsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<UserLoginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [logoutMsg, setLogoutMsg] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getLoginRecords();
      setRecords(res.data ?? []);
    } catch {
      setError(t("settings.loginRecords.fetchError", "無法載入登入紀錄"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleLogoutOther = async () => {
    setLoggingOut(true);
    setLogoutMsg("");
    try {
      const res = await logoutOtherDevices();
      setLogoutMsg(
        res.message ||
          t("settings.loginRecords.logoutSuccess", "已登出其他裝置")
      );
      fetchRecords();
    } catch {
      setLogoutMsg(
        t("settings.loginRecords.logoutError", "登出其他裝置失敗")
      );
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "1rem" }}>
        <SkeletonText paragraph lineCount={5} />
      </div>
    );
  }

  const rows = records.map((r) => ({
    id: String(r.id),
    device: parseUA(r.user_agent),
    ip_address: r.ip_address,
    login_method: LOGIN_METHOD_LABELS[r.login_method] || r.login_method,
    created_at: new Date(r.created_at).toLocaleString(),
    status: r.is_current ? "current" : "",
  }));

  return (
    <div className="login-records-panel" style={{ padding: "1rem 0" }}>
      {error && (
        <InlineNotification
          kind="error"
          title={error}
          lowContrast
          hideCloseButton
          style={{ marginBottom: "1rem" }}
        />
      )}

      {logoutMsg && (
        <InlineNotification
          kind="success"
          title={logoutMsg}
          lowContrast
          onCloseButtonClick={() => setLogoutMsg("")}
          style={{ marginBottom: "1rem" }}
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <p className="cds--label">
          {t(
            "settings.loginRecords.description",
            "最近 30 天的登入紀錄"
          )}
        </p>
        <Button
          kind="danger--tertiary"
          size="sm"
          onClick={handleLogoutOther}
          disabled={loggingOut}
        >
          {loggingOut
            ? t("settings.loginRecords.loggingOut", "登出中...")
            : t("settings.loginRecords.logoutOther", "登出其他裝置")}
        </Button>
      </div>

      <DataTable rows={rows} headers={headers}>
        {({
          rows: tableRows,
          headers: tableHeaders,
          getTableProps,
          getHeaderProps,
          getRowProps,
        }: any) => (
          <TableContainer>
            <Table {...getTableProps()} size="lg">
              <TableHead>
                <TableRow>
                  {tableHeaders.map((h: any) => (
                    <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                      {h.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map((row: any) => (
                  <TableRow key={row.id} {...getRowProps({ row })}>
                    {row.cells.map((cell: any) => (
                      <TableCell key={cell.id}>
                        {cell.info.header === "status" ? (
                          cell.value === "current" ? (
                            <Tag type="green" size="sm">
                              {t(
                                "settings.loginRecords.current",
                                "目前裝置"
                              )}
                            </Tag>
                          ) : null
                        ) : (
                          cell.value
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      {records.length === 0 && !loading && (
        <p
          style={{ textAlign: "center", padding: "2rem", color: "#525252" }}
        >
          {t("settings.loginRecords.empty", "沒有登入紀錄")}
        </p>
      )}
    </div>
  );
};

export default LoginRecordsPanel;
