import type { FC } from "react";
import { Button } from "@carbon/react";
import { TaskComplete } from "@carbon/icons-react";
import { TextModeSwitcher, type TextModeOption } from "@/shared/ui/navigation/TextModeSwitcher";
import { IconModeSwitcher, type IconModeOption } from "@/shared/ui/navigation/IconModeSwitcher";
import type { SupportedLanguage } from "@/i18n";
import "./LandingHeader.scss";

interface LandingHeaderProps {
  items: Array<{ id: string; label: string }>;
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
  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <a className="landing-header__brand" href="#top" aria-label="QJudge home">
          <TaskComplete size={20} />
          <span>QJudge</span>
        </a>

        <nav className="landing-header__nav" aria-label="Landing sections">
          {items.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
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
              ariaLabel="內容語言"
            />
            <IconModeSwitcher
              value={themeValue}
              options={themeOptions}
              onChange={onThemeChange}
              ariaLabel="主題模式"
              tooltipPosition="bottom"
            />
          </div>
          <Button kind="ghost" size="md" onClick={onLogin}>
            登入
          </Button>
        </div>
      </div>
    </header>
  );
};

export default LandingHeader;
