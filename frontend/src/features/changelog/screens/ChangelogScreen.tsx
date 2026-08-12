import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button, SkeletonText, IconButton, Tag } from "@carbon/react";
import { ArrowLeft, Launch } from "@carbon/icons-react";
import MarkdownRenderer from "@/shared/ui/markdown/MarkdownRenderer";
import DocTableOfContents from "@/features/docs/components/DocTableOfContents";
import { useTheme } from "@/shared/ui/theme/ThemeContext";
import { ThemeSwitch } from "@/shared/ui/config";
import type { ThemeValue } from "@/shared/ui/config";
import { BrandLockup } from "@/shared/brand/BrandLockup";
import styles from "./ChangelogScreen.module.scss";

interface VersionMeta {
  version: string;
  date: string;
}

interface ChangelogMeta {
  versions: VersionMeta[];
  latest: string;
}

const ChangelogScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation("changelog");
  const { preference, setPreference } = useTheme();

  const [meta, setMeta] = useState<ChangelogMeta | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadChangelog = async () => {
      setLoading(true);
      setError(null);

      const basePath = import.meta.env.BASE_URL || "/";

      try {
        const [metaRes, contentRes] = await Promise.all([
          fetch(`${basePath}changelog/changelog-meta.json`),
          fetch(`${basePath}changelog/zh-TW/changelog.md`),
        ]);

        if (!metaRes.ok || !contentRes.ok) {
          throw new Error("Failed to load changelog");
        }

        const metaData: ChangelogMeta = await metaRes.json();
        const text = await contentRes.text();

        setMeta(metaData);
        setContent(text);
      } catch (err) {
        console.error("Failed to load changelog:", err);
        setError(t("noContent"));
      } finally {
        setLoading(false);
      }
    };

    loadChangelog();
  }, [t]);

  useEffect(() => {
    if (!loading && window.location.hash) {
      const id = window.location.hash.slice(1);
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    }
  }, [loading]);

  const handleThemeChange = (value: ThemeValue) => {
    setPreference(value);
  };

  const scrollToVersion = (version: string) => {
    const id = `v${version}`;
    const headings = document.querySelectorAll("h2");
    for (const heading of headings) {
      if (heading.id?.includes(id) || heading.textContent?.includes(id)) {
        heading.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${heading.id}`);
        break;
      }
    }
  };

  return (
    <div className={styles.container}>
      {/* Left Sidebar - Version List */}
      <aside className={styles.leftSidebar}>
        <div className={styles.sidebarHeader}>
          <p className={styles.eyebrow}>
            QJudge
          </p>
          <h2 className={styles.sidebarTitle}>
            <BrandLockup label={t("title")} size={22} />
          </h2>
        </div>

        <div className={styles.sidebarContent}>
          {meta ? (
            <nav>
              {meta.versions.map((v) => (
                <Button
                  type="button"
                  kind="ghost"
                  key={v.version}
                  className={styles.versionItem}
                  onClick={() => scrollToVersion(v.version)}
                >
                  <div className={styles.versionLabel}>
                    <span>v{v.version}</span>
                    {v.version === meta.latest && (
                      <Tag size="sm" type="green">
                        {t("latestBadge")}
                      </Tag>
                    )}
                  </div>
                  <span className={styles.versionDate}>{v.date}</span>
                </Button>
              ))}
            </nav>
          ) : (
            <div style={{ padding: "1rem" }}>
              <SkeletonText paragraph lineCount={4} />
            </div>
          )}
        </div>

        {/* Settings */}
        <div className={styles.sidebarSettings}>
          <div className={styles.settingsDivider} />
          <div className={styles.settingsSection}>
            <ThemeSwitch value={preference} onChange={handleThemeChange} />
          </div>
          <div className={styles.settingsDivider} />
          <a
            href={import.meta.env.VITE_MAIN_APP_URL || "/"}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.dashboardLink}
          >
            <Launch size={16} />
            <span>QJudge</span>
          </a>
        </div>
      </aside>

      {/* Main Area */}
      <div className={styles.mainArea}>
        <header className={styles.pageHeader}>
          <IconButton
            kind="ghost"
            size="sm"
            label={t("title")}
            onClick={() => navigate(-1)}
            style={{ marginBottom: "1rem", marginLeft: "-0.5rem" }}
          >
            <ArrowLeft />
          </IconButton>

          {!loading && !error && (
            <div>
              <h1 className={styles.pageTitle}>
                {t("title")}
              </h1>
              <p className={styles.pageDescription}>
                {t("description")}
              </p>
            </div>
          )}

          {loading && (
            <div>
              <SkeletonText heading width="40%" />
            </div>
          )}
        </header>

        <div className={styles.contentArea}>
          <main className={styles.mainContent}>
            {loading ? (
              <SkeletonText paragraph lineCount={10} />
            ) : error ? (
              <div className={styles.errorContainer}>
                <p className={styles.errorText}>
                  {error}
                </p>
              </div>
            ) : (
              <MarkdownRenderer enableHighlight enableCopy>
                {content}
              </MarkdownRenderer>
            )}
          </main>

          <aside className={styles.rightSidebar}>
            {!loading && !error && content && (
              <DocTableOfContents content={content} />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ChangelogScreen;
