import React, { createContext, useContext, useMemo, useState } from "react";

interface ProblemEditUIContextValue {
  exportFormat: "pdf" | "yaml";
  setExportFormat: React.Dispatch<React.SetStateAction<"pdf" | "yaml">>;
  pdfScale: number;
  setPdfScale: React.Dispatch<React.SetStateAction<number>>;
}

const ProblemEditUIContext = createContext<ProblemEditUIContextValue | undefined>(undefined);

export const ProblemEditUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [exportFormat, setExportFormat] = useState<"pdf" | "yaml">("pdf");
  const [pdfScale, setPdfScale] = useState(100);

  const value = useMemo(
    () => ({
      exportFormat,
      setExportFormat,
      pdfScale,
      setPdfScale,
    }),
    [exportFormat, pdfScale]
  );

  return (
    <ProblemEditUIContext.Provider value={value}>
      {children}
    </ProblemEditUIContext.Provider>
  );
};

export const useProblemEditUI = () => {
  const context = useContext(ProblemEditUIContext);
  if (!context) {
    throw new Error("useProblemEditUI must be used within a ProblemEditUIProvider");
  }
  return context;
};
