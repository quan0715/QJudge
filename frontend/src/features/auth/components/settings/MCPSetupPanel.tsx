import {
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  CodeSnippet,
  InlineNotification,
} from "@carbon/react";
import { useTranslation } from "react-i18next";
import { Section } from "@/shared/layout/SettingsPanel";

const MCP_URL = import.meta.env.VITE_MCP_PUBLIC_URL || "https://mcp.q-judge.com/mcp";

const CLAUDE_CODE_CMD = `claude mcp add --transport http qjudge ${MCP_URL}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "qjudge": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`;

const CODEX_CMD = `codex mcp add --transport http qjudge ${MCP_URL}`;

export const MCPSetupPanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div>
      <Section
        title={t("mcp.setup.title")}
        description={t("mcp.setup.description")}
      >
        <Tabs>
          <TabList aria-label="MCP client setup">
            <Tab>{t("mcp.setup.claudeCode")}</Tab>
            <Tab>{t("mcp.setup.cursor")}</Tab>
            <Tab>{t("mcp.setup.codex")}</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <p style={{ marginBottom: "0.5rem" }}>{t("mcp.setup.step1")}</p>
              <CodeSnippet type="single" feedback={t("mcp.setup.copySuccess")}>
                {CLAUDE_CODE_CMD}
              </CodeSnippet>
            </TabPanel>
            <TabPanel>
              <p style={{ marginBottom: "0.5rem" }}>{t("mcp.setup.step1Cursor")}</p>
              <CodeSnippet type="multi" feedback={t("mcp.setup.copySuccess")}>
                {CURSOR_CONFIG}
              </CodeSnippet>
            </TabPanel>
            <TabPanel>
              <p style={{ marginBottom: "0.5rem" }}>{t("mcp.setup.step1")}</p>
              <CodeSnippet type="single" feedback={t("mcp.setup.copySuccess")}>
                {CODEX_CMD}
              </CodeSnippet>
            </TabPanel>
          </TabPanels>
        </Tabs>

        <InlineNotification
          kind="info"
          title={t("mcp.setup.verifyHint")}
          hideCloseButton
          lowContrast
          style={{ marginTop: "1rem" }}
        />
      </Section>
    </div>
  );
};
