import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ClickableTile, Tag } from "@carbon/react";
import {
  BareMetalServer,
  Settings,
  UserMultiple,
  Document,
  ArrowRight,
} from "@carbon/icons-react";

interface QuickLink {
  id: string;
  icon: React.ElementType;
  tagType: "blue" | "green" | "purple" | "cyan" | "magenta";
  links: string[];
}

const quickLinks: QuickLink[] = [
  {
    id: "deployment",
    icon: BareMetalServer,
    tagType: "blue",
    links: ["deployment", "deployment-storage"],
  },
  {
    id: "administration",
    icon: Settings,
    tagType: "purple",
    links: ["admin-account", "teacher-qualification"],
  },
  {
    id: "classroom",
    icon: UserMultiple,
    tagType: "green",
    links: ["classroom-setup", "classroom-roster"],
  },
  {
    id: "exam",
    icon: Document,
    tagType: "magenta",
    links: ["exam-preparation", "exam-review"],
  },
];

const QuickLinkCards: React.FC = () => {
  const { t } = useTranslation("docs");
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "1rem",
        marginBottom: "2rem",
      }}
    >
      {quickLinks.map((link) => {
        const Icon = link.icon;
        const firstLink = link.links[0];

        return (
          <ClickableTile
            key={link.id}
            onClick={() => navigate(`/docs/${firstLink}`)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              padding: "1.25rem",
              minHeight: "140px",
            }}
          >
            {/* Icon and Tag Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Icon size={24} />
              <Tag type={link.tagType} size="sm">
                {t(`quickLinks.${link.id}.tag`, link.id)}
              </Tag>
            </div>

            {/* Title */}
            <h4
              className="cds--type-productive-heading-02"
              style={{ margin: 0 }}
            >
              {t(`quickLinks.${link.id}.title`, link.id)}
            </h4>

            {/* Description */}
            <p
              className="cds--type-body-compact-01"
              style={{
                margin: 0,
                color: "var(--cds-text-secondary)",
                flex: 1,
              }}
            >
              {t(`quickLinks.${link.id}.description`, "")}
            </p>

            {/* Links */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginTop: "auto",
              }}
            >
              {link.links.map((docLink) => (
                <span
                  key={docLink}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.875rem",
                    color: "var(--cds-link-primary)",
                  }}
                >
                  <ArrowRight size={14} />
                  {t(`nav.items.${docLink}`, docLink)}
                </span>
              ))}
            </div>
          </ClickableTile>
        );
      })}
    </div>
  );
};

export default QuickLinkCards;
