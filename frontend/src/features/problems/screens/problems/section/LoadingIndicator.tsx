import React from "react";
import { InlineLoading } from "@carbon/react";

export const LoadingIndicator: React.FC = () => (
  <div style={{ textAlign: "center", padding: "2rem" }}>
    <InlineLoading description="載入更多題目..." />
  </div>
);
