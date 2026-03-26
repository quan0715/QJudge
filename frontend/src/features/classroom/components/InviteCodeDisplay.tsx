import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Tag } from "@carbon/react";
import { Copy, Renew } from "@carbon/icons-react";
import { useToast } from "@/shared/contexts/ToastContext";
import "./InviteCodeDisplay.scss";

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
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("inviteCode.copyFailed", "複製邀請碼失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="classroom-invite-code">
      <span className="classroom-invite-code__label">
        {t("inviteCode.label")}
      </span>
      <code className="classroom-invite-code__value">
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
