/**
 * Strip markdown characters from a string to provide a plain text preview.
 * @param md The markdown string to strip
 * @param maxLen The maximum length of the output string (default 120)
 * @returns Plain text string
 */
export const stripMarkdown = (md: string, maxLen = 120): string => {
  const plain = md
    .replace(/[#*_~`>\-![\]()]/g, "")
    .replace(/\n+/g, " ")
    .replace(/ +/g, " ")
    .trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
};
