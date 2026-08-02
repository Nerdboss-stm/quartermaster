import { randomUUID } from "node:crypto";

export interface OrderCredential {
  token: string;
  dynamicCvv: string;
  expiryMonth: string | number;
  expiryYear: string | number;
}

export interface OrderRequest {
  runId: string;
  quoteId: string;
  amountCents: number;
  credential: OrderCredential;
}

export interface Order {
  orderRef: string;
  status: "paid";
  environment: "SANDBOX";
  amountCents: number;
  tokenLast4: string;
  createdAt: string;
  provisioning: { at: string; line: string }[];
}

export function parseOrderRequest(body: unknown): OrderRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const cred = b.credential as Record<string, unknown> | undefined;
  if (
    typeof b.runId !== "string" ||
    typeof b.quoteId !== "string" ||
    typeof b.amountCents !== "number" ||
    !Number.isInteger(b.amountCents) ||
    b.amountCents <= 0 ||
    typeof cred !== "object" ||
    cred === null ||
    typeof cred.token !== "string" ||
    cred.token.length < 8 ||
    !/^\d{3,4}$/.test(String(cred.dynamicCvv)) ||
    Number(cred.expiryMonth) < 1 ||
    Number(cred.expiryMonth) > 12 ||
    String(cred.expiryYear).length < 2
  ) {
    return null;
  }
  return {
    runId: b.runId,
    quoteId: b.quoteId,
    amountCents: b.amountCents,
    credential: {
      token: cred.token,
      dynamicCvv: String(cred.dynamicCvv),
      expiryMonth: cred.expiryMonth as string | number,
      expiryYear: cred.expiryYear as string | number,
    },
  };
}

export function createOrder(req: OrderRequest): Order {
  const orderRef = `ord_${randomUUID().slice(0, 12)}`;
  const now = new Date();
  // Beat 10. Agent B is the merchant: it reports what it did, and the
  // console renders those lines verbatim rather than inventing them.
  const provisioning = [
    `order ${orderRef} accepted, payment captured`,
    `allocating node gpu-${randomUUID().slice(0, 4)} for ${req.quoteId}`,
    `container image pytorch-2.4-cuda12.4 pulled`,
    `endpoint live, handing off to buyer job`,
  ].map((line, i) => ({
    at: new Date(now.getTime() + i).toISOString(),
    line,
  }));

  return {
    orderRef,
    status: "paid",
    environment: "SANDBOX",
    amountCents: req.amountCents,
    tokenLast4: req.credential.token.slice(-4),
    createdAt: now.toISOString(),
    provisioning,
  };
}
