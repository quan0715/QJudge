import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Theme } from "@carbon/react";
import i18n from "@/i18n";
import "@/styles/globals.scss";
import { WorkbenchEditRail } from "@/features/contest/screens/settings/workbench/edit/WorkbenchEditRail";
import { buildEditRailRows } from "@/features/contest/screens/settings/workbench/edit/editRailModel";
import { paperFixture, questionFixture } from "@/features/contest/screens/settings/workbench/edit/workbenchEdit.fixture";
import { movePaperItem, type PaperMoveTarget } from "@/features/contest/domain/paperMoveModel";

const params = new URLSearchParams(location.search);
const theme = params.has("dark") ? "g100" : "white";
document.documentElement.dataset.carbonTheme = theme;
const initialPaper = paperFixture();
initialPaper.blocks.push(...Array.from({ length: 35 }, (_, index) => {
  const id = `extra-${index}`;
  return { kind: "question" as const, id, question: questionFixture(id) };
}));

export function Fixture() {
  const [paper, setPaper] = useState(initialPaper);
  const [activeKey, setActiveKey] = useState("q1");
  const [moves, setMoves] = useState<{ id: string; target: PaperMoveTarget }[]>([]);
  const [finishSave, setFinishSave] = useState<(() => void) | null>(null);
  return (
    <Theme theme={theme}>
      <div style={{ display: "grid", gridTemplateColumns: "18rem 1fr", height: "100dvh" }}>
        <WorkbenchEditRail
          header={<h2>合成考卷</h2>}
          rows={buildEditRailRows(paper, [], i18n.getFixedT("zh-TW", "contest"))}
          activeKey={activeKey}
          locked={params.has("locked")}
          issueCount={0}
          summary={{ totalScore: 195 }}
          onSelect={setActiveKey}
          onMove={async (id, target) => {
            setMoves((previous) => [...previous, { id, target }]);
            if (params.has("pending")) {
              await new Promise<void>((resolve) => setFinishSave(() => resolve));
              setFinishSave(null);
            }
            setPaper((previous) => ({ ...previous, blocks: movePaperItem(previous.blocks, id, target) }));
          }}
          onAdd={() => {}}
          onOpenPublishCheck={() => {}}
        />
        <main>
          <output aria-label="選取題目">{activeKey}</output>
          <output aria-label="儲存次數">{moves.length}</output>
          <output aria-label="最後移動">{JSON.stringify(moves.at(-1) ?? null)}</output>
          {finishSave && <Button onClick={finishSave}>完成合成儲存</Button>}
        </main>
      </div>
    </Theme>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
