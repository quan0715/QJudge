import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@carbon/react";
import { Code, Trophy } from "@carbon/icons-react";
import TeacherProblemsScreen from "./TeacherProblemsScreen";
import TeacherContestsScreen from "./TeacherContestsScreen";
import { ChatbotWidget } from "@/features/chatbot";
import { useAuth } from "@/features/auth";
import styles from "./TeacherDashboardScreen.module.scss";

const TeacherDashboardScreen = () => {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {/* Left: scrollable dashboard content */}
        <div className={styles.content}>
          <div className={styles.inner}>
            <h1 className={styles.title}>
              {t("page.teacherDashboard", "教師後台")}
            </h1>

            <Tabs
              selectedIndex={selectedIndex}
              onChange={({ selectedIndex }) => setSelectedIndex(selectedIndex)}
            >
              <TabList aria-label="Teacher management tabs">
                <Tab renderIcon={Code}>{t("page.problemManagement")}</Tab>
                <Tab renderIcon={Trophy}>{t("page.contestManagement")}</Tab>
              </TabList>
              <TabPanels>
                <TabPanel style={{ padding: "1rem 0" }}>
                  <TeacherProblemsScreen embedded />
                </TabPanel>
                <TabPanel style={{ padding: "1rem 0" }}>
                  <TeacherContestsScreen embedded />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </div>
        </div>

        {/* Right: chatbot panel (flex sibling, expands as side panel) */}
        <ChatbotWidget
          defaultExpanded={false}
          backgroundInfo={{
            user: user
              ? { username: user.username, role: user.role }
              : undefined,
          }}
        />
      </div>
    </div>
  );
};

export default TeacherDashboardScreen;
