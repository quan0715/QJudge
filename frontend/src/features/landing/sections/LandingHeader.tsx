import { useTranslation } from "react-i18next";
import { useRef, type ComponentRef, type FC } from "react";
import { OverflowMenu, OverflowMenuItem } from "@carbon/react";
import { Asleep, Checkmark, Language, Light, Menu } from "@carbon/icons-react";
import type { TextModeOption } from "@/shared/ui/navigation/TextModeSwitcher";
import type { IconModeOption } from "@/shared/ui/navigation/IconModeSwitcher";
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
  const languageTrigger = useRef<ComponentRef<typeof OverflowMenu>>(null);
  const themeTrigger = useRef<ComponentRef<typeof OverflowMenu>>(null);
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <a className="landing-header__brand" href="#top" aria-label={t("ui.home")}>
          <BrandLockup size={36} />
        </a>

        <nav className="landing-header__nav" aria-label={t("ui.navigation")}>
          <OverflowMenu
            aria-label={t("ui.actions")}
            iconDescription={t("ui.actions")}
            renderIcon={Menu}
            size="lg"
            align="bottom"
            flipped
          >
            {items.map((item) => (
              <OverflowMenuItem key={item.id} itemText={item.label} href={item.href ?? `#${item.id}`} />
            ))}
            <OverflowMenuItem itemText={t("ui.signIn")} hasDivider onClick={onLogin} />
          </OverflowMenu>
          <OverflowMenu
            ref={languageTrigger}
            aria-label={t("ui.language")}
            iconDescription={t("ui.language")}
            renderIcon={Language}
            size="lg"
            align="bottom"
            flipped
          >
            {languageOptions.map((option) => (
              <OverflowMenuItem
                key={option.value}
                role="menuitemradio"
                aria-checked={option.value === languageValue}
                itemText={
                  <span className="landing-header__option">
                    {option.label}
                    {option.value === languageValue && <Checkmark aria-hidden="true" />}
                  </span>
                }
                onClick={() => {
                  onLanguageChange(option.value);
                  languageTrigger.current?.focus();
                }}
              />
            ))}
          </OverflowMenu>
          <OverflowMenu
            ref={themeTrigger}
            aria-label={t("ui.theme")}
            iconDescription={t("ui.theme")}
            renderIcon={themeValue === "dark" ? Asleep : Light}
            size="lg"
            align="bottom-end"
            flipped
          >
            {themeOptions.map((option) => (
              <OverflowMenuItem
                key={option.value}
                role="menuitemradio"
                aria-checked={option.value === themeValue}
                itemText={
                  <span className="landing-header__option">
                    {option.label}
                    {option.value === themeValue && <Checkmark aria-hidden="true" />}
                  </span>
                }
                onClick={() => {
                  onThemeChange(option.value);
                  themeTrigger.current?.focus();
                }}
              />
            ))}
          </OverflowMenu>
        </nav>
      </div>
    </header>
  );
};

export default LandingHeader;
