import { DocsFrameworkProvider, DocsLayout as SharedDocsLayout } from "@/shared/docs";
import { qjudgeDocsConfig } from "../QJudgeDocsConfig";

const DocsLayout: React.FC = () => {
  return (
    <DocsFrameworkProvider config={qjudgeDocsConfig}>
      <SharedDocsLayout />
    </DocsFrameworkProvider>
  );
};

export default DocsLayout;
