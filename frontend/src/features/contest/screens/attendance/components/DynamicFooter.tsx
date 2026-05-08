import { Button, ButtonSet, InlineLoading } from "@carbon/react";

import type { CtaSpec, SecondaryCtaSpec } from "../lib/attendanceCta";

type Props = {
  primary: CtaSpec;
  secondary?: SecondaryCtaSpec;
  onPrimary: () => void;
  onSecondary?: () => void;
};

export function DynamicFooter({ primary, secondary, onPrimary, onSecondary }: Props) {
  const primaryButton = (
    <Button kind="primary" size="2xl" disabled={primary.disabled} onClick={onPrimary}>
      {primary.loading ? (
        <InlineLoading description={primary.label} status="active" />
      ) : (
        primary.label
      )}
    </Button>
  );

  if (!secondary) {
    return <ButtonSet>{primaryButton}</ButtonSet>;
  }

  return (
    <ButtonSet>
      <Button kind="secondary" size="2xl" onClick={onSecondary}>
        {secondary.label}
      </Button>
      {primaryButton}
    </ButtonSet>
  );
}
