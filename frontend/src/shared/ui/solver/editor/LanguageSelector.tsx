import { useRef, useState, useEffect } from "react";
import { Layer } from "@carbon/react";
import { ChevronDown, Code } from "@carbon/icons-react";
import "./LanguageSelector.scss";

export interface LanguageOption {
  id: string;
  label: string;
}

interface LanguageSelectorProps {
  languages: LanguageOption[];
  selectedLanguage: string;
  onLanguageChange: (languageId: string) => void;
}

/**
 * LanguageSelector - Custom language selector for editor toolbar
 *
 * A compact button-based selector that shows a dropdown menu on click.
 * Designed to fit nicely in the 48px toolbar height.
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  languages,
  selectedLanguage,
  onLanguageChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Get current language label
  const currentLanguage = languages.find((lang) => lang.id === selectedLanguage);
  const displayLabel = currentLanguage?.label || selectedLanguage;

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (languageId: string) => {
    onLanguageChange(languageId);
    setIsOpen(false);
  };

  const handleKeyDownOnItem = (
    event: React.KeyboardEvent,
    languageId: string
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect(languageId);
    }
  };

  return (
    <div className="language-selector" ref={containerRef}>
      <button
        type="button"
        className="language-selector__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`選擇程式語言，目前選擇：${displayLabel}`}
      >
        <span className="language-selector__trigger-content">
          <Code size={16} className="language-selector__icon" />
          <span className="language-selector__label">{displayLabel}</span>
        </span>
        <ChevronDown
          size={16}
          className={`language-selector__chevron ${
            isOpen ? "language-selector__chevron--open" : ""
          }`}
        />
      </button>

      {isOpen && (
        <Layer level={2} className="language-selector__menu" ref={menuRef}>
          <div role="listbox" aria-label="程式語言選單">
            {languages.map((lang) => (
              <button
                key={lang.id}
                type="button"
                role="option"
                aria-selected={lang.id === selectedLanguage}
                className={`language-selector__item ${
                  lang.id === selectedLanguage
                    ? "language-selector__item--selected"
                    : ""
                }`}
                onClick={() => handleSelect(lang.id)}
                onKeyDown={(e) => handleKeyDownOnItem(e, lang.id)}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </Layer>
      )}
    </div>
  );
};

export default LanguageSelector;
