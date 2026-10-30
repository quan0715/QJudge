import { useTranslation } from "react-i18next";
import type { FC } from "react";
import { Button } from "@carbon/react";
import { TextModeSwitcher, type TextModeOption } from "@/shared/ui/navigation/TextModeSwitcher";
import { IconModeSwitcher, type IconModeOption } from "@/shared/ui/navigation/IconModeSwitcher";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import type { SupportedLanguage } from "@/i18n";
import "./LandingHeader.scss";

interface LandingHeaderProps {
  items: Array<{ id: string; label: string; href?: string }>;
  onLogin: () => void;
  languageValue: SupportedLanguage;
  languageOptions: TextModeOption<SupportedLanguage>[];
  onLanguageChange: (value: SupportedLanguage) => void;
  themeValue: "light" | "dark";
  themeOptions: IconModeOption<"light" | "dark">[];
  onThemeChange: (value: "light" | "dark") => void;
}

const LandingHeader: FC<LandingHeaderProps> = ({
  items,
  onLogin,
  languageValue,
  languageOptions,
  onLanguageChange,
  themeValue,
  themeOptions,
  onThemeChange,
}) => {
  const { t } = useTranslation("landing");
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <a className="landing-header__brand" href="#top" aria-label={t("ui.home")}>
          <BrandLockup size={36} />
        </a>

        <nav className="landing-header__nav" aria-label={t("ui.navigation")}>
          {items.map((item) => (
            <a key={item.id} href={item.href ?? `#${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-header__actions">
          <div className="landing-header__switchers">
            <TextModeSwitcher
              value={languageValue}
              options={languageOptions}
              onChange={onLanguageChange}
              ariaLabel={t("ui.language")}
            />
            <IconModeSwitcher
              value={themeValue}
              options={themeOptions}
              onChange={onThemeChange}
              ariaLabel={t("ui.theme")}
              tooltipPosition="bottom"
            />
          </div>
          <Button kind="ghost" onClick={onLogin}>
            {t("ui.signIn")}
          </Button>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;
