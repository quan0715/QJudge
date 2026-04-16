import type { FC } from "react";
import ClaudeColor from "@lobehub/icons/es/Claude/components/Color";
import OpenAIMono from "@lobehub/icons/es/OpenAI/components/Mono";
import CursorMono from "@lobehub/icons/es/Cursor/components/Mono";
import PerplexityColor from "@lobehub/icons/es/Perplexity/components/Color";
import GeminiColor from "@lobehub/icons/es/Gemini/components/Color";
import NotionMono from "@lobehub/icons/es/Notion/components/Mono";
import SectionHeading from "@/features/landing/components/SectionHeading";
import type { MCPCollaborationContent } from "@/features/landing/content/landingContent";
import "./MCPCollaborationSection.scss";

interface MCPCollaborationSectionProps {
  content: MCPCollaborationContent;
}

const TOOLS = [
  { Icon: ClaudeColor, name: "Claude" },
  { Icon: OpenAIMono, name: "ChatGPT", mono: true },
  { Icon: CursorMono, name: "Cursor", mono: true },
  { Icon: PerplexityColor, name: "Perplexity" },
  { Icon: GeminiColor, name: "Gemini" },
  { Icon: NotionMono, name: "Notion", mono: true },
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

        {/* Tools Logo Marquee */}
        <div className="landing-mcp-section__tools-wrapper">
          <div className="landing-mcp-section__tools">
            {[...TOOLS, ...TOOLS].map(({ Icon, name, mono }, idx) => (
              <div key={`${name}-${idx}`} className={`landing-mcp-section__tool-item${mono ? " landing-mcp-section__tool-item--mono" : ""}`}>
                <Icon size={64} />
              </div>
            ))}
          </div>
        </div>

        {/* Alternating Features Layout */}
        <div className="landing-mcp-showcase">
          {content.examples.map((example, index) => {
            const isReversed = index % 2 !== 0;
            return (
              <div
                key={example.title}
                className={`landing-mcp-feature-row ${
                  isReversed ? "landing-mcp-feature-row--reversed" : ""
                }`}
              >
                {/* Media Side */}
                <div className="landing-mcp-feature-row__media">
                  {example.videoSrc && (
                    <video
                      src={example.videoSrc}
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  )}
                </div>

                {/* Content Side */}
                <div className="landing-mcp-feature-row__content">
                  <span className="landing-mcp-feature-row__eyebrow">
                    {example.eyebrow || String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="landing-mcp-feature-row__title">
                    {example.title}
                  </h3>
                  <p className="landing-mcp-feature-row__description">
                    {example.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default MCPCollaborationSection;
