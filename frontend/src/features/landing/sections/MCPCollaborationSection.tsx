import type { FC } from "react";
import { Claude, OpenAI, Cursor, Perplexity, Gemini, Notion } from "@lobehub/icons";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { MCPCollaborationContent } from "@/features/landing/content/landingContent";
import "./MCPCollaborationSection.scss";

interface MCPCollaborationSectionProps {
  content: MCPCollaborationContent;
}

const TOOLS = [
  { Icon: Claude.Color, name: "Claude" },
  { Icon: OpenAI, name: "ChatGPT", mono: true },
  { Icon: Cursor, name: "Cursor", mono: true },
  { Icon: Perplexity.Color, name: "Perplexity" },
  { Icon: Gemini.Color, name: "Gemini" },
  { Icon: Notion, name: "Notion", mono: true },
];

const MCPCollaborationSection: FC<MCPCollaborationSectionProps> = ({ content }) => {
  return (
    <section id="landing-mcp" className="landing-mcp-section landing-section" data-testid="landing-section-mcp">
      <div className="landing-section__inner">
        <SectionHeading
          eyebrow={content.eyebrow}
          title={content.title}
          description={content.description}
          align="center"
        />

        {/* Tools Logo Grid */}
        <div className="landing-mcp-section__tools">
          {TOOLS.map(({ Icon, name, mono }) => (
            <div key={name} className={`landing-mcp-section__tool-item${mono ? " landing-mcp-section__tool-item--mono" : ""}`}>
              <Icon size={64} />
            </div>
          ))}
        </div>

        {/* Examples Grid */}
        <div className="landing-mcp-section__examples">
          {content.examples.map((example, index) => (
            <div
              key={example.title}
              className="landing-mcp-section__example-card"
            >
              <div className="landing-mcp-section__example-header">
                <span className="landing-mcp-section__example-number">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="landing-mcp-section__example-title">{example.title}</h3>
                <p className="landing-mcp-section__example-description">{example.description}</p>
              </div>

              {example.image && (
                <div className="landing-mcp-section__example-image">
                  <img
                    src={example.image}
                    alt={example.title}
                    className="landing-mcp-section__image-content"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default MCPCollaborationSection;
