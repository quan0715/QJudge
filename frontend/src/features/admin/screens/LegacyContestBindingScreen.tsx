import { Column, Grid, Tile } from "@carbon/react";
import { PageHeader } from "@/shared/layout/PageHeader";

/**
 * In-app placeholder for the retired “batch bind unbound contests” flow.
 * New contests must be created from a classroom; production data is expected
 * to have every contest classroom-bound. Use the backend audit command before deploy.
 */
const LegacyContestBindingScreen = () => {
  return (
    <div style={{ padding: "1rem 2rem 2rem" }}>
      <PageHeader
        title="Contest–classroom binding"
        subtitle="Manual bulk binding from this UI is retired."
      />
      <Grid fullWidth condensed>
        <Column lg={16} md={8} sm={4}>
          <Tile>
            <p style={{ marginBottom: "1rem", maxWidth: "46rem", lineHeight: 1.5 }}>
              競賽應由課堂建立並綁定。若需確認資料是否仍有「未綁課堂」的競賽列，請在 backend 容器或本機執行：
            </p>
            <pre
              style={{
                padding: "1rem",
                background: "var(--cds-layer-01)",
                fontSize: "0.875rem",
                overflow: "auto",
              }}
            >
              python manage.py audit_contest_classroom_bindings
            </pre>
            <p style={{ marginTop: "1rem", color: "var(--cds-text-secondary)" }}>
              命令僅讀取資料庫；若有未綁定列會以非零退出碼結束，便於 CI／佈署前檢查。
            </p>
          </Tile>
        </Column>
      </Grid>
    </div>
  );
};

export default LegacyContestBindingScreen;
