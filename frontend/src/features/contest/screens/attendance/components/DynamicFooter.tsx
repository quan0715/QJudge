import type { ElementType } from "react";
import { Button, InlineLoading } from "@carbon/react";

import { MobileButtonSet } from "@/shared/ui/MobileButtonSet";
import type { CtaSpec, SecondaryCtaSpec } from "../lib/attendanceCta";

type Props = {
  primary: CtaSpec;
  secondary?: SecondaryCtaSpec;
  primaryRenderIcon?: ElementType;
  onPrimary: () => void;
  onSecondary?: () => void;
};

export function DynamicFooter({
  primary,
  secondary,
  primaryRenderIcon,
  onPrimary,
  onSecondary,
}: Props) {
  const primaryButton = (
    <Button
      kind="primary"
      size="2xl"
      disabled={primary.disabled}
      renderIcon={primaryRenderIcon}
      onClick={onPrimary}
    >
      {primary.loading ? (
        <InlineLoading description={primary.label} status="active" />
      ) : (
        primary.label
      )}
    </Button>
  );

  if (!secondary) {
    return <MobileButtonSet>{primaryButton}</MobileButtonSet>;
  }

  return (
    <MobileButtonSet>
      <Button kind="secondary" size="2xl" onClick={onSecondary}>
        {secondary.label}
      </Button>
      {primaryButton}
    </MobileButtonSet>
  );
}
