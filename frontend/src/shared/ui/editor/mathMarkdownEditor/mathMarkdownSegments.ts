export type MathTemplateId =
  | "fraction"
  | "sqrt"
  | "power"
  | "subscript"
  | "pi"
  | "theta"
  | "aligned";

export type MathSegmentTemplate = MathTemplateId | "raw";

export type MathFieldKey =
  | "numerator"
  | "denominator"
  | "radicand"
  | "base"
  | "exponent"
  | "subscript"
  | "lines";

export interface TextSegment {
  type: "text";
  text: string;
}

export interface MathSegment {
  type: "math";
  template: MathSegmentTemplate;
  fields: Partial<Record<MathFieldKey, string>>;
  rawLatex?: string;
  displayMode?: "inline" | "block";
}

export type MathMarkdownSegment = TextSegment | MathSegment;

const sanitizeMathField = (value: string) => value.replace(/[${}]/g, "");

export const cleanMathFieldValue = sanitizeMathField;

export const createTextSegment = (text = ""): TextSegment => ({
  type: "text",
  text,
});

export const createMathSegment = (template: MathTemplateId): MathSegment => {
  switch (template) {
    case "fraction":
      return {
        type: "math",
        template,
        fields: { numerator: "", denominator: "" },
      };
    case "sqrt":
      return { type: "math", template, fields: { radicand: "" } };
    case "power":
      return { type: "math", template, fields: { base: "x", exponent: "" } };
    case "subscript":
      return { type: "math", template, fields: { base: "x", subscript: "" } };
    case "aligned":
      return {
        type: "math",
        template,
        fields: { lines: "" },
        displayMode: "block",
      };
    case "pi":
    case "theta":
      return { type: "math", template, fields: {} };
  }
};

const normalizeCommandSlashes = (latex: string) =>
  latex.trim().replace(/^\\\\(?=[A-Za-z])/, "\\");

const parseKnownMathSegment = (
  latex: string,
  displayMode: MathSegment["displayMode"],
): MathSegment => {
  const normalized = normalizeCommandSlashes(latex);
  const fractionMatch = normalized.match(/^\\frac\{([^{}]*)\}\{([^{}]*)\}$/);
  if (fractionMatch) {
    return {
      type: "math",
      template: "fraction",
      fields: {
        numerator: fractionMatch[1],
        denominator: fractionMatch[2],
      },
      displayMode,
    };
  }

  const sqrtMatch = normalized.match(/^\\sqrt\{([^{}]*)\}$/);
  if (sqrtMatch) {
    return {
      type: "math",
      template: "sqrt",
      fields: { radicand: sqrtMatch[1] },
      displayMode,
    };
  }

  const powerMatch = normalized.match(/^(.+)\^\{([^{}]*)\}$/);
  if (powerMatch) {
    return {
      type: "math",
      template: "power",
      fields: {
        base: powerMatch[1],
        exponent: powerMatch[2],
      },
      displayMode,
    };
  }

  const subscriptMatch = normalized.match(/^(.+)_\{([^{}]*)\}$/);
  if (subscriptMatch) {
    return {
      type: "math",
      template: "subscript",
      fields: {
        base: subscriptMatch[1],
        subscript: subscriptMatch[2],
      },
      displayMode,
    };
  }

  if (normalized === "\\pi") {
    return { type: "math", template: "pi", fields: {}, displayMode };
  }

  if (normalized === "\\theta") {
    return { type: "math", template: "theta", fields: {}, displayMode };
  }

  const alignedMatch = normalized.match(
    /^\\begin\{aligned\}([\s\S]*)\\end\{aligned\}$/,
  );
  if (alignedMatch) {
    const lines = alignedMatch[1]
      .replace(/\\\\/g, "\n")
      .replace(/&=/g, "=")
      .trim();
    return {
      type: "math",
      template: "aligned",
      fields: { lines },
      displayMode: "block",
    };
  }

  return {
    type: "math",
    template: "raw",
    fields: {},
    rawLatex: normalized,
    displayMode,
  };
};

const appendText = (segments: MathMarkdownSegment[], text: string) => {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last?.type === "text") {
    last.text += text;
    return;
  }
  segments.push(createTextSegment(text));
};

export const parseMarkdownMath = (value: string): MathMarkdownSegment[] => {
  const segments: MathMarkdownSegment[] = [];
  let index = 0;

  while (index < value.length) {
    if (value.startsWith("$$", index)) {
      const end = value.indexOf("$$", index + 2);
      if (end === -1) {
        appendText(segments, value.slice(index));
        break;
      }
      const latex = value.slice(index + 2, end);
      segments.push(parseKnownMathSegment(latex, "block"));
      index = end + 2;
      continue;
    }

    if (value[index] === "$") {
      const end = value.indexOf("$", index + 1);
      if (end === -1) {
        appendText(segments, value.slice(index));
        break;
      }
      const latex = value.slice(index + 1, end);
      segments.push(parseKnownMathSegment(latex, "inline"));
      index = end + 1;
      continue;
    }

    const nextInline = value.indexOf("$", index);
    const textEnd = nextInline === -1 ? value.length : nextInline;
    appendText(segments, value.slice(index, textEnd));
    index = textEnd;
  }

  return segments.length ? segments : [createTextSegment()];
};

export const serializeMathSegment = (segment: MathSegment): string => {
  const fields = segment.fields;
  switch (segment.template) {
    case "fraction":
      return `\\frac{${sanitizeMathField(fields.numerator ?? "")}}{${sanitizeMathField(
        fields.denominator ?? "",
      )}}`;
    case "sqrt":
      return `\\sqrt{${sanitizeMathField(fields.radicand ?? "")}}`;
    case "power":
      return `${sanitizeMathField(fields.base ?? "x")}^{${sanitizeMathField(
        fields.exponent ?? "",
      )}}`;
    case "subscript":
      return `${sanitizeMathField(fields.base ?? "x")}_{${sanitizeMathField(
        fields.subscript ?? "",
      )}}`;
    case "pi":
      return "\\pi";
    case "theta":
      return "\\theta";
    case "aligned": {
      const lines = (fields.lines ?? "")
        .split(/\r?\n/)
        .map((line) => sanitizeMathField(line).trim())
        .filter(Boolean);
      const body = lines.length ? lines.join(" \\\\\n") : "";
      return `\\begin{aligned}\n${body}\n\\end{aligned}`;
    }
    case "raw":
      return segment.rawLatex ?? "";
  }
};

const serializeSegment = (segment: MathMarkdownSegment): string => {
  if (segment.type === "text") return segment.text;
  const latex = serializeMathSegment(segment);
  if (segment.displayMode === "block") return `$$\n${latex}\n$$`;
  return `$${latex}$`;
};

export const serializeSegments = (segments: MathMarkdownSegment[]): string => {
  const parts: string[] = [];

  segments.forEach((segment) => {
    const part = serializeSegment(segment);
    if (!part) return;
    const previousPart = parts[parts.length - 1];
    if (previousPart?.endsWith("$") && part.startsWith("$")) {
      parts.push(previousPart.endsWith("$$") || part.startsWith("$$") ? "\n" : " ");
    }
    parts.push(part);
  });

  return parts.join("");
};
