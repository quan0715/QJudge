import { useState, useCallback } from 'react';

export const useCopyText = (timeout = 2000) => {
  const [isCopied, setIsCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), timeout);
    } catch (err) {
      console.error('Failed to copy text:', err);
      setIsCopied(false);
    }
  }, [timeout]);

  return { isCopied, copy };
};
