// Thin typed wrapper over the Prava REST API, strictly per docs/prava.md.
// Amounts cross this boundary as integer cents and hit the wire as 2dp
// decimal strings. Card/token values are never logged (last 4 only).

export interface PravaConfig {
  baseUrl: string;
  secretKey: string;
}

export class PravaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly responseId: string | null
  ) {
    super(message);
    this.name = "PravaError";
  }
}

export interface MandateSetupParams {
  userId: string;
  userEmail: string;
  /** Prava's per-charge NETWORK cap for the envelope, in cents. */
  totalAmountCents: number;
  merchant: { name: string; url: string; countryCodeIso2: string };
  productDescription: string;
  recurringFrequency: "weekly" | "monthly" | "yearly" | "one_time";
  maxCharges: number;
  validUntil: string;
  callbackUrl?: string;
}

export interface MandateSetupSession {
  approvalUrl: string;
  raw: Record<string, unknown>;
}

export interface PravaMandate {
  id: string;
  agentId?: string;
  customerId?: string;
  externalUserId?: string;
  state: string;
  status: string;
  recurringFrequency?: string;
  merchantScope?: string;
  merchantName: string;
  approvedAmount: string;
  remaining?: string;
  currency: string;
  validUntil?: string;
  renewsAt: string;
  lastCharge?: { status: string; at: string } | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ChargeCredentials {
  token: string;
  dynamicCvv: string;
  expiryMonth: string | number;
  expiryYear: string | number;
}

export interface ChargeResult {
  mandateId: string;
  instructionId?: string;
  transactionId: string;
  orderId?: string;
  status: "awaiting_result" | "failed";
  fetchStatus?: "SUCCESS" | "FAILURE";
  credentials?: ChargeCredentials;
  errorCode?: string;
  errorMessage?: string;
  deduplicated?: boolean;
}

export interface ReportResult {
  mandateId: string;
  transactionId: string;
  orderId?: string;
  status: "completed" | "failed";
  mandateStatus?: string;
  visaConfirmation: "SUCCESS" | "FAILURE";
}

/** The network cycle rule surfacing as a charge failure. NEVER retried:
 *  if this ever appears it is a router bug (hard law 3). */
export function isCycleDeclined(r: ChargeResult): boolean {
  return (
    r.status === "failed" &&
    /already made in the current payment cycle/i.test(r.errorMessage ?? "")
  );
}

export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error(`invalid cents amount: ${cents}`);
  }
  return (cents / 100).toFixed(2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function request<T>(
  cfg: PravaConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  let lastError: PravaError | null = null;
  for (let attempt = 0; attempt <= 3; attempt++) {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.secretKey}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const responseId = res.headers.get("x-response-id");
    console.log(`prava ${method} ${path} -> ${res.status} [X-Response-ID ${responseId ?? "none"}]`);

    if (res.ok) return (await res.json()) as T;

    const text = await res.text().catch(() => "");
    let code: string | null = null;
    try {
      const parsed = JSON.parse(text) as { errorCode?: string; code?: string };
      code = parsed.errorCode ?? parsed.code ?? null;
    } catch {
      // non-JSON error body
    }
    const err = new PravaError(
      `prava ${method} ${path} failed: ${res.status}${code ? ` ${code}` : ""}`,
      res.status,
      code,
      responseId
    );
    // Retries on 5xx only, max 3. Everything else throws immediately.
    if (res.status >= 500 && attempt < 3) {
      lastError = err;
      await sleep(500 * (attempt + 1));
      continue;
    }
    throw err;
  }
  throw lastError ?? new Error("prava request failed");
}

export class PravaClient {
  constructor(private readonly cfg: PravaConfig) {}

  async createMandateSetupSession(
    p: MandateSetupParams
  ): Promise<MandateSetupSession> {
    const body = {
      user_id: p.userId,
      user_email: p.userEmail,
      total_amount: centsToDecimal(p.totalAmountCents),
      currency: "USD",
      integration_type: "full_checkout",
      ...(p.callbackUrl ? { callback_url: p.callbackUrl } : {}),
      purchase_context: [
        {
          merchant_details: {
            name: p.merchant.name,
            url: p.merchant.url,
            country_code_iso2: p.merchant.countryCodeIso2,
          },
          product_details: [
            {
              description: p.productDescription,
              unit_price: centsToDecimal(p.totalAmountCents),
            },
          ],
        },
      ],
      mandate_setup: {
        intent: "mandate_setup",
        recurring_frequency: p.recurringFrequency,
        merchant_scope: "listed",
        valid_until: p.validUntil,
        max_charges: p.maxCharges,
      },
    };
    const raw = await request<Record<string, unknown>>(
      this.cfg,
      "POST",
      "/v1/sessions",
      body
    );
    // VERIFY: docs name the approval URL "iframe_url"; accept common
    // fallbacks defensively. The create response has no mandate id.
    const approvalUrl =
      (raw.iframe_url as string | undefined) ??
      (raw.url as string | undefined) ??
      (raw.session_url as string | undefined);
    if (!approvalUrl) {
      throw new Error("mandate setup session returned no approval url");
    }
    return { approvalUrl, raw };
  }

  async listMandates(customerId: string): Promise<PravaMandate[]> {
    const raw = await request<unknown>(
      this.cfg,
      "GET",
      `/v1/mandates?customer_id=${encodeURIComponent(customerId)}&standing_only=true`
    );
    // VERIFY: list envelope shape; accept bare array or {mandates|data}.
    if (Array.isArray(raw)) return raw as PravaMandate[];
    const obj = raw as { mandates?: PravaMandate[]; data?: PravaMandate[] };
    return obj.mandates ?? obj.data ?? [];
  }

  async chargeMandate(
    mandateId: string,
    amountCents: number,
    reference: string
  ): Promise<ChargeResult> {
    return request<ChargeResult>(
      this.cfg,
      "POST",
      `/v1/mandates/${encodeURIComponent(mandateId)}/charge`,
      { amount: centsToDecimal(amountCents), reference }
    );
  }

  async reportMandateCharge(
    mandateId: string,
    txnId: string,
    status: "APPROVED" | "DECLINED",
    amountPaidCents: number
  ): Promise<ReportResult> {
    return request<ReportResult>(
      this.cfg,
      "POST",
      `/v1/mandates/${encodeURIComponent(mandateId)}/charges/${encodeURIComponent(txnId)}/report`,
      {
        txn_status: status,
        txn_type: "PURCHASE",
        amount_paid: centsToDecimal(amountPaidCents),
      }
    );
  }
}
