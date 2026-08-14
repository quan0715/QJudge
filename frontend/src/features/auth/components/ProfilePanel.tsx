import React, { useState, useEffect, useRef, useCallback } from "react";
import { TextInput, Tag, Button, SkeletonText } from "@carbon/react";
import { Laptop, Tablet } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { ImageEditDialog } from "@/shared/ui/image";
import { Section, ActionRow } from "@/shared/layout/SettingsPanel";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { useUserPreferences } from "@/features/auth/hooks/useUserPreferences";
import { useToast } from "@/shared/contexts";
import {
  getAuthSessions,
  logoutOtherSessions,
} from "@/infrastructure/api/repositories/auth.repository";
import type { UserLoginRecord } from "@/core/entities/auth.entity";
import "./ProfilePanel.scss";

// ── helpers ──

const ROLE_TAG_TYPE: Record<string, "blue" | "green" | "purple"> = {
  student: "blue",
  teacher: "green",
  admin: "purple",
};

type DeviceType = "mobile" | "tablet" | "desktop";

function parseUA(ua: string): { browser: string; os: string; deviceType: DeviceType } {
  if (!ua) return { browser: "Unknown", os: "", deviceType: "desktop" };

  let browser = "Unknown";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  let os = "";
  let deviceType: DeviceType = "desktop";
  if (ua.includes("iPhone") || (ua.includes("Android") && ua.includes("Mobile"))) {
    os = ua.includes("iPhone") ? "iOS" : "Android";
    deviceType = "mobile";
  } else if (ua.includes("iPad") || ua.includes("Android")) {
    os = ua.includes("iPad") ? "iPadOS" : "Android";
    deviceType = "tablet";
  } else if (ua.includes("Windows")) {
    os = "Windows";
  } else if (ua.includes("Mac OS")) {
    os = "macOS";
  } else if (ua.includes("Linux")) {
    os = "Linux";
  }

  return { browser, os, deviceType };
}

const DEVICE_ICON = {
  mobile: Tablet,
  tablet: Tablet,
  desktop: Laptop,
} as const;

function formatDateTime(dateStr: string, locale: string): string {
  return new Date(dateStr).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Device grouping ──

interface DeviceGroup {
  key: string;
  browser: string;
  os: string;
  deviceType: DeviceType;
  isCurrent: boolean;
  lastActive: string;
  ip: string;
  loginMethod: string;
  records: UserLoginRecord[];
}

function groupByDevice(records: UserLoginRecord[]): DeviceGroup[] {
  const map = new Map<string, DeviceGroup>();
  for (const r of records) {
    const { browser, os, deviceType } = parseUA(r.user_agent);
    const key = `${browser}|${os}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key, browser, os, deviceType, isCurrent: false,
        lastActive: r.created_at, ip: r.ip_address,
        loginMethod: r.login_method, records: [],
      };
      map.set(key, group);
    }
    group.records.push(r);
    if (r.is_current) group.isCurrent = true;
    // Track the most recent record
    if (new Date(r.created_at) > new Date(group.lastActive)) {
      group.lastActive = r.created_at;
      group.ip = r.ip_address;
      group.loginMethod = r.login_method;
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
  });
}

// ── Component ──

interface ProfilePanelProps {
  hideDevices?: boolean;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ hideDevices = false }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { showToast } = useToast();
  const {
    displayName,
    updateDisplayName,
    avatarUrl,
    updateAvatar,
    uploadAvatar,
    removeAvatar,
  } = useUserPreferences();

  const isPasswordUser = !user?.auth_provider || user.auth_provider === "email" || user.auth_provider === "password";

  // ── Display name ──
  const [localDisplayName, setLocalDisplayName] = useState(displayName);
  const [dnState, setDnState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const savedNameRef = useRef(displayName);
  const debounceRef = useRef<number | undefined>(undefined);
  const resetRef = useRef<number | undefined>(undefined);
  const reqIdRef = useRef(0);

  useEffect(() => {
    setLocalDisplayName(displayName);
    savedNameRef.current = displayName;
    setDnState("idle");
  }, [displayName]);

  const persistDN = useCallback(async (val: string) => {
    const trimmed = val.trim();
    if (trimmed === savedNameRef.current) { setDnState("idle"); return; }
    const id = ++reqIdRef.current;
    setDnState("saving");
    window.clearTimeout(resetRef.current);
    try {
      await updateDisplayName(trimmed);
      if (id !== reqIdRef.current) return;
      savedNameRef.current = trimmed;
      setDnState("saved");
      resetRef.current = window.setTimeout(() => setDnState("idle"), 1200);
    } catch {
      if (id !== reqIdRef.current) return;
      setDnState("error");
    }
  }, [updateDisplayName]);

  const handleDNChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalDisplayName(e.target.value);
    if (dnState === "error") setDnState("idle");
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => persistDN(e.target.value), 800);
  };

  const handleDNBlur = () => {
    window.clearTimeout(debounceRef.current);
    persistDN(localDisplayName);
  };

  useEffect(() => () => {
    window.clearTimeout(debounceRef.current);
    window.clearTimeout(resetRef.current);
  }, []);

  // ── Avatar ──
  const [avatarState, setAvatarState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const handleAvatarUrl = async (url: string) => {
    setAvatarState("saving");
    try { await updateAvatar(url.trim()); setAvatarState("saved"); setTimeout(() => setAvatarState("idle"), 1200); }
    catch { setAvatarState("error"); }
  };
  const handleAvatarUpload = async (file: File) => {
    setAvatarState("saving");
    try { await uploadAvatar(file); setAvatarState("saved"); setTimeout(() => setAvatarState("idle"), 1200); }
    catch { setAvatarState("error"); }
  };
  const handleAvatarRemove = async () => {
    setAvatarState("saving");
    try { await removeAvatar(); setAvatarState("saved"); setTimeout(() => setAvatarState("idle"), 1200); }
    catch { setAvatarState("error"); }
  };

  // ── Devices ──
  const [records, setRecords] = useState<UserLoginRecord[]>([]);
  const [devLoading, setDevLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const fetchRecords = useCallback(async () => {
    setDevLoading(true);
    try {
      const res = await getAuthSessions();
      setRecords(res.data ?? []);
    } catch { /* silent */ }
    finally { setDevLoading(false); }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleLogoutOther = async () => {
    setLoggingOut(true);
    try {
      await logoutOtherSessions();
      showToast({ kind: "success", title: t("settings.loginRecords.logoutSuccess", "已登出其他裝置") });
      fetchRecords();
    } catch {
      showToast({ kind: "error", title: t("settings.loginRecords.logoutError", "登出其他裝置失敗") });
    } finally { setLoggingOut(false); }
  };

  const deviceGroups = groupByDevice(records);
  const locale = t("common.locale", "zh-TW");

  return (
    <>
      {/* ── Section: Profile ── */}
      <Section
        title={t("profile.personalInfo", "個人資訊")}
      >
        <div className="profile-panel__identity">
          <ImageEditDialog
            variant="avatar"
            previewUrl={avatarUrl || undefined}
            alt={localDisplayName.trim() || user?.username || "avatar"}
            emptyLabel={t("preferences.avatarEmpty", "新增頭像")}
            modalHeading={t("preferences.editAvatar", "編輯頭像")}
            urlPlaceholder="https://example.com/avatar.png"
            uploadLabel={t("preferences.avatarUpload", "上傳頭像")}
            removeLabel={t("preferences.avatarRemove", "移除頭像")}
            applyLabel={t("common.apply", "套用")}
            dropzoneLabel={t("preferences.avatarDropzoneTitle", "拖曳圖片到此處")}
            dropzoneHint={t("preferences.avatarDropzoneHint", "或點擊這裡選擇圖片檔案")}
            disabled={avatarState === "saving"}
            onUpload={handleAvatarUpload}
            onApplyUrl={handleAvatarUrl}
            onRemove={avatarUrl ? handleAvatarRemove : undefined}
          />
          <div className="profile-panel__identity-fields">
            <TextInput
              id="profile-display-name"
              labelText={t("preferences.displayName", "顯示名稱")}
              value={localDisplayName}
              onChange={handleDNChange}
              onBlur={handleDNBlur}
              maxLength={50}
              placeholder={t("preferences.displayName", "顯示名稱")}
              helperText={
                dnState === "saving" ? t("preferences.savingDisplayName", "儲存中...") :
                dnState === "saved" ? t("preferences.displayNameSaved", "已更新") :
                dnState === "error" ? t("preferences.displayNameSaveFailed", "更新失敗") :
                undefined
              }
            />
          </div>
        </div>

        <div className="profile-panel__account-fields">
          <ActionRow label={t("preferences.username", "使用者名稱")}>
            <span>{user?.username}</span>
          </ActionRow>
          <ActionRow label={t("preferences.email", "電子郵件")}>
            <span>{user?.email}</span>
          </ActionRow>
          <ActionRow label={t("preferences.role", "角色")}>
            <Tag type={ROLE_TAG_TYPE[user?.role ?? "student"] ?? "blue"} size="sm">
              {t(`user.role.${user?.role ?? "student"}`)}
            </Tag>
          </ActionRow>
          <ActionRow label={t("preferences.loginMethod", "登入方式")}>
            <Tag type={isPasswordUser ? "cool-gray" : "blue"} size="sm">
              {isPasswordUser
                ? t("auth.providers.password.displayName", "密碼憑證")
                : (user?.auth_provider ?? "").toUpperCase()}
            </Tag>
          </ActionRow>
        </div>

      </Section>

      {/* ── Section: Devices ── */}
      {!hideDevices && <Section
        title={t("profile.devices", "裝置管理")}
        description={t("profile.devicesDesc", "最近 30 天登入的裝置")}
      >
        <ActionRow
          label={t("settings.loginRecords.logoutOther", "登出其他裝置")}
          description={t("settings.loginRecords.logoutOtherDesc", "登出除了此裝置以外的所有作用中工作階段")}
        >
          <Button
            kind="danger--ghost"
            size="sm"
            onClick={handleLogoutOther}
            disabled={loggingOut}
          >
            {loggingOut ? t("action.processing", "處理中...") : t("settings.loginRecords.logoutOther", "登出其他裝置")}
          </Button>
        </ActionRow>
        {devLoading ? (
          <SkeletonText paragraph lineCount={3} />
        ) : deviceGroups.length === 0 ? (
          <p className="profile-panel__empty">{t("settings.loginRecords.empty", "沒有登入紀錄")}</p>
        ) : (
          <>
            {/* Table header */}
            <div className="profile-panel__device-table-head">
              <span className="profile-panel__device-col profile-panel__device-col--name">
                {t("profile.deviceName", "裝置名稱")}
              </span>
              <span className="profile-panel__device-col profile-panel__device-col--time">
                {t("profile.lastActive", "最後活動")}
              </span>
              <span className="profile-panel__device-col profile-panel__device-col--ip">
                IP
              </span>
            </div>

            {/* Device rows */}
            <div className="profile-panel__device-list">
              {deviceGroups.map((g) => {
                const Icon = DEVICE_ICON[g.deviceType] ?? Laptop;
                const deviceLabel = g.os || g.browser;
                const isNow = g.isCurrent;
                return (
                  <div key={g.key} className="profile-panel__device-row">
                    <div className="profile-panel__device-col profile-panel__device-col--name">
                      <Icon size={20} className="profile-panel__device-icon" />
                      <div>
                        <span className="profile-panel__device-name">{deviceLabel}</span>
                        {isNow && (
                          <span className="profile-panel__device-current">
                            {t("settings.loginRecords.current", "此裝置")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="profile-panel__device-col profile-panel__device-col--time">
                      {isNow ? t("profile.now", "現在") : formatDateTime(g.lastActive, locale)}
                    </span>
                    <span className="profile-panel__device-col profile-panel__device-col--ip">
                      {g.ip}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Section>}

    </>
  );
};

export default ProfilePanel;
