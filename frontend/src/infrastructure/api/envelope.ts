/**
 * Standard API envelope types and fetch helper.
 *
 * Shape contract
 * --------------
 *
 * Success: `{"data": <payload>, "meta": {...}}`
 *
 * Error: `{"errors": [{"code", "message", "field", "details"}], "meta": {...}}`
 *
 * Only used by endpoints that opt into the new envelope (see
 * `backend/apps/core/api/envelope.py`). Legacy endpoints keep their existing
 * bare shape and `{success, error}` error format — use `requestJson` for those.
 */

export interface BaseMeta {
  count?: number;
  projection?: string;
  request_id?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface ApiEnvelope<TData, TMeta extends BaseMeta = BaseMeta> {
  data: TData;
  meta: TMeta;
}

export interface ApiErrorItem {
  code: string;
  message: string;
  field?: string | null;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  errors: ApiErrorItem[];
  meta: BaseMeta;
}

export class EnvelopeError extends Error {
  status: number;
  errors: ApiErrorItem[];
  meta: BaseMeta;

  constructor(status: number, errors: ApiErrorItem[], meta: BaseMeta = {}) {
    super(errors[0]?.message ?? "Request failed");
    this.name = "EnvelopeError";
    this.status = status;
    this.errors = errors;
    this.meta = meta;
  }

  /** Convenience for callers that only care about the first error's code. */
  get code(): string | undefined {
    return this.errors[0]?.code;
  }
}

const readJsonBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const malformed = (status: number, message: string) => new EnvelopeError(status, [
  { code: "envelope_malformed", message, field: null, details: {} },
]);

/**
 * Fetch a response wrapped in the standard envelope.
 *
 * On success: unwraps `.data` and `.meta` so callers don't see the envelope.
 * On failure: throws `EnvelopeError` carrying the parsed error list.
 */
export const fetchEnvelope = async <TData, TMeta extends BaseMeta = BaseMeta>(
  request: Promise<Response>,
  fallbackMessage = "Request failed",
): Promise<{ data: TData; meta: TMeta }> => {
  const response = await request;
  const body = await readJsonBody(response);

  if (!isObject(body) || !isObject(body.meta)) {
    throw malformed(response.status, fallbackMessage);
  }
  if (!response.ok) {
    if (Object.keys(body).some((key) => key !== "errors" && key !== "meta") || !Array.isArray(body.errors) || body.errors.length === 0 ||
        !body.errors.every((item: unknown) => isObject(item) &&
          typeof item.code === "string" && typeof item.message === "string" &&
          (item.field === null || typeof item.field === "string") && isObject(item.details))) {
      throw malformed(response.status, fallbackMessage);
    }
    throw new EnvelopeError(response.status, body.errors as ApiErrorItem[], body.meta);
  }
  if (!("data" in body) || Object.keys(body).some((key) => key !== "data" && key !== "meta")) {
    throw malformed(response.status, fallbackMessage);
  }
  return { data: body.data as TData, meta: body.meta as TMeta };
};
