import React from "react";
import BasicInfoSection from "@/features/problems/components/edit/problemForm/sections/BasicInfoSection";
import ContentSection from "@/features/problems/components/edit/problemForm/sections/ContentSection";
import TestCasesSection from "@/features/problems/components/edit/problemForm/sections/TestCasesSection";
import LanguageConfigSection from "@/features/problems/components/edit/problemForm/sections/LanguageConfigSection";
import DangerZoneSection from "@/features/problems/components/edit/problemForm/sections/DangerZoneSection";

interface ProblemEditSectionsProps {
  problemTitle: string;
  onDelete: () => Promise<void>;
}

const ProblemEditSections: React.FC<ProblemEditSectionsProps> = ({
  problemTitle,
  onDelete,
}) => {
  return (
    <div className="problem-edit-page__sections">
      <BasicInfoSection />
      <ContentSection />
      <TestCasesSection />
      <LanguageConfigSection />
      <DangerZoneSection
        problemTitle={problemTitle}
        onDelete={onDelete}
      />
    </div>
  );
};

export default ProblemEditSections;
