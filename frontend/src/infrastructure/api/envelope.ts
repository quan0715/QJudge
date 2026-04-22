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
  meta?: TMeta;
}

export interface ApiErrorItem {
  code: string;
  message: string;
  field?: string | null;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  errors: ApiErrorItem[];
  meta?: BaseMeta;
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

const coerceErrors = (body: unknown, fallbackMessage: string): ApiErrorItem[] => {
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as ApiErrorEnvelope).errors;
    if (Array.isArray(errors) && errors.length > 0) return errors;
  }
  // Fall back to the legacy `{success, error}` shape so migration-period
  // failures surface a useful message instead of "Request failed".
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    if (err?.message) {
      return [{ code: err.code ?? "error", message: err.message, field: null }];
    }
  }
  return [{ code: "error", message: fallbackMessage, field: null }];
};

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

  if (!response.ok) {
    const meta: BaseMeta =
      (body && typeof body === "object" && "meta" in body
        ? ((body as ApiErrorEnvelope).meta ?? {})
        : {});
    throw new EnvelopeError(response.status, coerceErrors(body, fallbackMessage), meta);
  }

  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new EnvelopeError(response.status, [
      { code: "envelope_malformed", message: fallbackMessage, field: null },
    ]);
  }

  const envelope = body as ApiEnvelope<TData, TMeta>;
  return {
    data: envelope.data,
    meta: (envelope.meta ?? ({} as TMeta)) as TMeta,
  };
};
