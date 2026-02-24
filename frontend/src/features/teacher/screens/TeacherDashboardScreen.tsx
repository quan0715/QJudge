import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabList, Tab, TabPanels, TabPanel } from "@carbon/react";
import { Code, Trophy } from "@carbon/icons-react";
import TeacherProblemsScreen from "./TeacherProblemsScreen";
import TeacherContestsScreen from "./TeacherContestsScreen";

const TeacherDashboardScreen = () => {
  const { t } = useTranslation("common");
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        backgroundColor: "var(--cds-background)",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
          padding: "0 1rem",
        }}
      >
        <div style={{ marginTop: "2rem" }}>
          <h1
            style={{
              fontSize: "var(--cds-productive-heading-05, 2rem)",
              fontWeight: 400,
              marginBottom: "1.5rem",
              color: "var(--cds-text-primary)",
            }}
          >
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
    </div>
  );
};

export default TeacherDashboardScreen;
