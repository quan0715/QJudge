import React from "react";
import { useTranslation } from "react-i18next";
import type { ProblemVisibility } from "@/core/entities/problem.entity";
import type { NavSection } from "../section/layout";
import { ScrollSpyLayout } from "../section/layout";
import BasicInfoSection from "@/features/problems/components/edit/problemForm/sections/BasicInfoSection";
import ContentSection from "@/features/problems/components/edit/problemForm/sections/ContentSection";
import TestCasesSection from "@/features/problems/components/edit/problemForm/sections/TestCasesSection";
import LanguageConfigSection from "@/features/problems/components/edit/problemForm/sections/LanguageConfigSection";
import DangerZoneSection from "@/features/problems/components/edit/problemForm/sections/DangerZoneSection";

interface ProblemEditSectionsProps {
  sections: NavSection[];
  onPreviewClick: () => void;
  problemTitle: string;
  visibility: ProblemVisibility;
  onVisibilityChange: (visibility: ProblemVisibility) => Promise<void>;
  onDelete: () => Promise<void>;
}

const ProblemEditSections: React.FC<ProblemEditSectionsProps> = ({
  sections,
  onPreviewClick,
  problemTitle,
  visibility,
  onVisibilityChange,
  onDelete,
}) => {
  const { t } = useTranslation("problem");
  return (
    <ScrollSpyLayout sections={sections} onPreviewClick={onPreviewClick}>
      {({ registerSection }) => (
        <div className="problem-edit-page__sections">
          {/* Basic Info */}
          <section
            id="basic-info"
            ref={registerSection("basic-info")}
            className="problem-edit-page__section"
          >
            <h2 className="problem-edit-page__section-title">{t("edit.sections.basicInfo")}</h2>
            <BasicInfoSection />
          </section>

          {/* Content */}
          <section
            id="content"
            ref={registerSection("content")}
            className="problem-edit-page__section"
          >
            <h2 className="problem-edit-page__section-title">{t("edit.sections.content")}</h2>
            <ContentSection />
          </section>

          {/* Test Cases */}
          <section
            id="test-cases"
            ref={registerSection("test-cases")}
            className="problem-edit-page__section"
          >
            <h2 className="problem-edit-page__section-title">{t("edit.sections.testCases")}</h2>
            <TestCasesSection />
          </section>

          {/* Language Config */}
          <section
            id="language-config"
            ref={registerSection("language-config")}
            className="problem-edit-page__section"
          >
            <h2 className="problem-edit-page__section-title">{t("edit.sections.languageSettings")}</h2>
            <LanguageConfigSection />
          </section>

          {/* Danger Zone */}
          <section
            id="danger-zone"
            ref={registerSection("danger-zone")}
            className="problem-edit-page__section problem-edit-page__section--danger"
          >
            <DangerZoneSection
              problemTitle={problemTitle}
              visibility={visibility}
              onVisibilityChange={onVisibilityChange}
              onDelete={onDelete}
            />
          </section>
        </div>
      )}
    </ScrollSpyLayout>
  );
};

export default ProblemEditSections;
