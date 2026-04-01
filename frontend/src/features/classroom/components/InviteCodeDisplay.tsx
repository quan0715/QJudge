import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Tag, Tooltip } from "@carbon/react";
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

  const inviteLink = `${window.location.origin}/classrooms/join/${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      showToast({
        kind: "error",
        title: t("inviteLink.copyFailed", "複製邀請連結失敗"),
        subtitle: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="classroom-invite-link">
      <div className="classroom-invite-link__row">
        <code className="classroom-invite-link__url">{inviteLink}</code>
        <Tooltip
          label={copied ? t("inviteLink.copied", "已複製") : t("inviteLink.copy", "複製連結")}
          align="top"
        >
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Copy}
            iconDescription={t("inviteLink.copy", "複製連結")}
            onClick={handleCopy}
          />
        </Tooltip>
        {!enabled && (
          <Tag type="red" size="sm">
            {t("inviteLink.disabled", "已停用")}
          </Tag>
        )}
      </div>
      <Button
        kind="ghost"
        size="sm"
        renderIcon={Renew}
        onClick={onRegenerate}
      >
        {t("inviteLink.regenerate", "重新產生連結")}
      </Button>
    </div>
  );
};
