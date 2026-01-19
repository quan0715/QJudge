import { Outlet } from "react-router-dom";
import DocsHeader from "./DocsHeader";

const DocsLayout: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        backgroundColor: "var(--cds-background)",
      }}
    >
      <DocsHeader />
      {/* No Carbon <Content> - direct render without extra padding */}
      <div style={{ flex: 1, marginTop: "3rem" }}>
        <Outlet />
      </div>
    </div>
  );
};

export default DocsLayout;
