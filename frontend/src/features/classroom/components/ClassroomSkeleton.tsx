import { SkeletonPlaceholder, SkeletonText } from "@carbon/react";

export const ClassroomSkeleton = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      backgroundColor: "var(--cds-background)",
    }}
  >
    <div style={{ minHeight: "12.5rem", position: "relative", overflow: "hidden" }}>
      <SkeletonPlaceholder style={{ width: "100%", height: "12.5rem" }} />
    </div>
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <SkeletonText heading width="40%" />
      <SkeletonText width="70%" />
      <SkeletonText width="55%" />
    </div>
  </div>
);
