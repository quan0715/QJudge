import React from "react";
import { Outlet } from "react-router-dom";
import { ContestProvider } from "@/features/contest/contexts/ContestContext";

/**
 * Lightweight wrapper for exam-v2 screens.
 * Provides ContestContext without the full ContestLayout (no sidebar/header).
 * Renders as a standalone full-page experience.
 */
const ExamV2Layout: React.FC = () => (
  <ContestProvider>
    <Outlet />
  </ContestProvider>
);

export default ExamV2Layout;
