/**
 * UserSettingsScreen - 用戶設定主頁面
 *
 * 使用 Carbon Tabs 組織不同的設定分類：
 * - Preferences: 主題和語言偏好
 * - API Key: Anthropic API Key 管理
 * - Usage: AI 用量統計
 */

import React, { useState } from "react";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@carbon/react";
import { Settings, Password, ChartLine } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { PreferencesPanel } from "@/features/auth/components/PreferencesPanel";
import { APIKeyPanel } from "@/features/auth/components/APIKeyPanel";
import { UsagePanel } from "@/features/auth/components/UsagePanel";
import "./UserSettingsScreen.scss";

export const UserSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <div className="user-settings-screen">
      <div className="user-settings-screen__header">
        <h1 className="user-settings-screen__title">
          {t("settings.title", "設定")}
        </h1>
        <p className="user-settings-screen__description">
          {t(
            "settings.description",
            "管理您的偏好設定、API Key 和用量統計"
          )}
        </p>
      </div>

      <div className="user-settings-screen__content">
        <Tabs
          selectedIndex={selectedTab}
          onChange={(e) => setSelectedTab(e.selectedIndex)}
        >
          <TabList aria-label="Settings tabs" contained>
            <Tab renderIcon={Settings}>
              {t("settings.tabs.preferences", "偏好設定")}
            </Tab>
            <Tab renderIcon={Password}>
              {t("settings.tabs.apiKey", "API Key")}
            </Tab>
            <Tab renderIcon={ChartLine}>
              {t("settings.tabs.usage", "用量統計")}
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <PreferencesPanel />
            </TabPanel>
            <TabPanel>
              <APIKeyPanel />
            </TabPanel>
            <TabPanel>
              <UsagePanel />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
};

export default UserSettingsScreen;
