import { PravaClient } from "@quartermaster/prava-client";

let client: PravaClient | null = null;

export function prava(): PravaClient {
  if (!client) {
    const baseUrl = process.env.PRAVA_BASE_URL;
    const secretKey = process.env.PRAVA_SECRET_KEY;
    if (!baseUrl || !secretKey) {
      throw new Error("PRAVA_BASE_URL / PRAVA_SECRET_KEY not set: failing closed");
    }
    client = new PravaClient({ baseUrl, secretKey });
  }
  return client;
}

export function pravaCustomerId(): string {
  return process.env.PRAVA_CUSTOMER_ID ?? "user_saran";
}

export function pravaUserEmail(): string {
  return process.env.PRAVA_USER_EMAIL ?? "stmallela.us@gmail.com";
}

export function settlementMode(): "sandbox" | "production" {
  return process.env.SETTLEMENT_MODE === "production" ? "production" : "sandbox";
}
