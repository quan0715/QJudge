import React, { useMemo, useState } from "react";
import { Tab, TabList, TabPanel, TabPanels, Tabs } from "@carbon/react";
import { useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ProblemPreview } from "@/shared/ui/problem";
import type { ProblemFormSchema } from "../../forms/problemFormSchema";
import { formSchemaToPreview } from "../../forms/problemPreviewAdapter";
import BasicInfoSection from "../edit/problemForm/sections/BasicInfoSection";
import ContentSection from "../edit/problemForm/sections/ContentSection";
import TestCasesSection from "../edit/problemForm/sections/TestCasesSection";
import LanguageConfigSection from "../edit/problemForm/sections/LanguageConfigSection";
import "./CodingProblemEditorShell.scss";
import styles from "./CodingProblemEditor.module.scss";

interface CodingProblemEditorProps {
  scoring?: React.ReactNode;
  showTags?: boolean;
}

export default function CodingProblemEditor({ scoring, showTags = true }: CodingProblemEditorProps) {
  const { t } = useTranslation("contest");
  const [activeTab, setActiveTab] = useState(0);
  return (
    <Tabs
      selectedIndex={activeTab}
      onChange={({ selectedIndex }) => setActiveTab(selectedIndex ?? 0)}
    >
      <TabList aria-label={t("examEditor.problemEditTabs", "題目編輯分頁")} contained>
        <Tab>{t("examEditor.tabBasicInfo", "基本資訊")}</Tab>
        <Tab>{t("examEditor.tabContent", "題目內容")}</Tab>
        <Tab>{scoring ? t("examEditor.tabTestCasesAndScoring", "測資與配分") : t("common:questionBank.testCases", "測試資料")}</Tab>
        <Tab>{t("examEditor.tabCodeSettings", "撰寫設定")}</Tab>
        <Tab>{t("examEditor.tabPreview", "預覽")}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel className={styles.tabPanel}>
          <BasicInfoSection directEdit showTags={showTags} />
        </TabPanel>
        <TabPanel className={styles.tabPanel}>
          <ContentSection directEdit />
        </TabPanel>
        <TabPanel className={styles.tabPanel}>
          {scoring}
          <TestCasesSection />
        </TabPanel>
        <TabPanel className={styles.tabPanel}>
          <LanguageConfigSection />
        </TabPanel>
        <TabPanel className={styles.tabPanel}>
          <PreviewTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
}

const PreviewTab: React.FC = () => {
  const { control } = useFormContext<ProblemFormSchema>();
  const formValues = useWatch({ control });
  const previewData = useMemo(
    () => formSchemaToPreview(formValues as ProblemFormSchema),
    [formValues],
  );
  return <ProblemPreview problem={previewData} />;
};

