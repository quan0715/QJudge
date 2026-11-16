import { DocsApplication } from "@popcornt/mimi/react-router";
import "@popcornt/mimi/layout.css";
import { useTranslation } from "react-i18next";
import data from "virtual:mimi/docs";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import { useTheme } from "@/shared/ui/theme/ThemeContext";

export default function DocumentationScreen() {
  const { i18n } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <DocsApplication
      data={data}
      locale={i18n.resolvedLanguage}
      themePreference={preference}
      onThemeChange={setPreference}
      onLocaleChange={(language) => { void i18n.changeLanguage(language); }}
      headerBrand={<BrandLockup label="QJudge Docs" size={20} />}
    />
  );
}
