import React from "react";
import { Outlet } from "react-router-dom";
import { PaperExamProvider } from "@/features/contest/contexts/PaperExamContext";

/**
 * Lightweight wrapper for paper-exam screens.
 * Provides PaperExamContext (contest only, no standings/participants/events).
 * Renders as a standalone full-page experience.
 */
const PaperExamLayout: React.FC = () => (
  <PaperExamProvider>
    <Outlet />
  </PaperExamProvider>
);

export default PaperExamLayout;
