import { DocsFrameworkProvider, DocsShell } from "@/shared/docs";
import { qjudgeDocsConfig } from "../QJudgeDocsConfig";

const DocsLayout: React.FC = () => {
  return (
    <DocsFrameworkProvider config={qjudgeDocsConfig}>
      <DocsShell />
    </DocsFrameworkProvider>
  );
};

export default DocsLayout;
