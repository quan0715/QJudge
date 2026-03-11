import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("classroom");
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
        {t("inviteCode.label")}
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
          {t("inviteCode.disabled")}
        </Tag>
      )}
      <Stack orientation="horizontal" gap={3}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Copy}
          onClick={handleCopy}
        >
          {copied ? t("inviteCode.copied") : t("inviteCode.copy")}
        </Button>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          onClick={onRegenerate}
        >
          {t("inviteCode.regenerate")}
        </Button>
      </Stack>
    </div>
  );
};
