import React, { useState } from "react";
import { Button, Stack, Tag } from "@carbon/react";
import { Copy, Renew } from "@carbon/icons-react";

interface InviteCodeDisplayProps {
  code: string;
  enabled: boolean;
  onRegenerate: () => void;
}

export const InviteCodeDisplay: React.FC<InviteCodeDisplayProps> = ({
  code,
  enabled,
  onRegenerate,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        padding: "1rem",
        background: "var(--cds-layer)",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
        邀請碼
      </span>
      <code
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          letterSpacing: "0.2em",
          fontFamily: "var(--cds-code-01-font-family, monospace)",
        }}
      >
        {code}
      </code>
      {!enabled && (
        <Tag type="red" size="sm">
          已停用
        </Tag>
      )}
      <Stack direction="horizontal" gap={2}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Copy}
          onClick={handleCopy}
        >
          {copied ? "已複製" : "複製"}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          onClick={onRegenerate}
        >
          重新產生
        </Button>
      </Stack>
    </div>
  );
};
