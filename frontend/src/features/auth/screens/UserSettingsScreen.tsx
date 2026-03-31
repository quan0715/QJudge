import React, { useState } from "react";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@carbon/react";
import { UserAvatar, Settings, Password, Catalog } from "@carbon/icons-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/contexts/AuthContext";
import { ProfilePanel } from "@/features/auth/components/ProfilePanel";
import { PreferencesPanel } from "@/features/auth/components/PreferencesPanel";
import { APIKeyPanel } from "@/features/auth/components/APIKeyPanel";
import { PlansPanel } from "@/features/auth/components/PlansPanel";
import "./UserSettingsScreen.scss";

export const UserSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState(0);

  const isTeacherOrAdmin =
    user?.role === "teacher" || user?.role === "admin";

  return (
    <div className="user-settings-screen">
      <div className="user-settings-screen__header">
        <h1 className="user-settings-screen__title">
          {t("settings.title", "設定")}
        </h1>
      </div>

      <div className="user-settings-screen__content">
        <Tabs
          selectedIndex={selectedTab}
          onChange={(e) => setSelectedTab(e.selectedIndex)}
        >
          <TabList aria-label="Settings tabs" contained>
            <Tab renderIcon={UserAvatar}>
              {t("settings.tabs.profile", "個人檔案")}
            </Tab>
            <Tab renderIcon={Settings}>
              {t("settings.tabs.preferences", "偏好設定")}
            </Tab>
            {isTeacherOrAdmin && (
              <Tab renderIcon={Password}>
                {t("settings.tabs.apiKey", "API Key")}
              </Tab>
            )}
            <Tab renderIcon={Catalog}>
              {t("settings.tabs.plans", "探索方案")}
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <ProfilePanel />
            </TabPanel>
            <TabPanel>
              <PreferencesPanel />
            </TabPanel>
            {isTeacherOrAdmin && (
              <TabPanel>
                <APIKeyPanel />
              </TabPanel>
            )}
            <TabPanel>
              <PlansPanel />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </div>
  );
};

export default UserSettingsScreen;
