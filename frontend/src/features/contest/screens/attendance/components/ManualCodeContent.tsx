import { useEffect, useRef } from "react";
import { InlineNotification } from "@carbon/react";
import { useTranslation } from "react-i18next";

import styles from "./StepContent.module.scss";

const OTP_LENGTH = 6;

type Props = {
  purposeLabel: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
};

function sanitizeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, OTP_LENGTH);
}

export function ManualCodeContent({ purposeLabel, value, onChange, error }: Props) {
  const { t } = useTranslation("contest");
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const digits = sanitizeDigits(value).padEnd(OTP_LENGTH, " ").split("");

  useEffect(() => {
    const focusIndex = Math.min(sanitizeDigits(value).length, OTP_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "");
    if (!digit) {
      return;
    }
    const current = sanitizeDigits(value);
    const next =
      current.slice(0, index) + digit[0] + current.slice(index + 1);
    const trimmed = sanitizeDigits(next);
    onChange(trimmed);
    const focusNext = Math.min(index + 1, OTP_LENGTH - 1);
    inputsRef.current[focusNext]?.focus();
    inputsRef.current[focusNext]?.select?.();
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Backspace") {
      const current = sanitizeDigits(value);
      if (current[index]) {
        const next = current.slice(0, index) + current.slice(index + 1);
        onChange(next);
        return;
      }
      if (index > 0) {
        const next = current.slice(0, index - 1) + current.slice(index);
        onChange(next);
        inputsRef.current[index - 1]?.focus();
      }
      event.preventDefault();
    } else if (event.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
      event.preventDefault();
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
      event.preventDefault();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = sanitizeDigits(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  };

  return (
    <div className={styles.content}>
      <div className={styles.heading}>
        <h1>
          {t("attendance.manual.title", "輸入{{purpose}}代碼", {
            purpose: purposeLabel,
          })}
        </h1>
        <p>
          {t(
            "attendance.manual.description",
            "請輸入教師投影畫面上 QR Code 下方的 6 碼數字代碼。",
          )}
        </p>
        {error ? (
          <InlineNotification
            kind="error"
            title={t("attendance.manual.cannotContinue", "無法繼續")}
            subtitle={error}
            lowContrast
            hideCloseButton
            className={styles.notification}
          />
        ) : null}
      </div>
      <div className={styles.manualForm}>
        <div
          className={styles.otpRow}
          role="group"
          aria-label={t("attendance.manual.codeAriaLabel", "{{purpose}}代碼", {
            purpose: purposeLabel,
          })}
        >
          {digits.map((char, index) => (
            <input
              key={index}
              ref={(node) => {
                inputsRef.current[index] = node;
              }}
              className={styles.otpBox}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={1}
              value={char.trim()}
              aria-label={t("attendance.manual.digitAriaLabel", "第 {{index}} 碼", {
                index: index + 1,
              })}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={handlePaste}
              onFocus={(event) => event.target.select()}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
