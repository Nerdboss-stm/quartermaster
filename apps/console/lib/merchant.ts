/** Agent B's merchant identity: used verbatim in envelope setup sessions
 *  and matched (normalized) by the router against Prava's merchantName. */
export const MERCHANT = {
  name: "Agent B Compute",
  url: process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev",
  countryCodeIso2: "US",
};

/** Prava Visa-sanitizes merchant names; compare case/spacing-insensitively. */
export function merchantMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(a) === norm(b) && norm(a).length > 0;
}
