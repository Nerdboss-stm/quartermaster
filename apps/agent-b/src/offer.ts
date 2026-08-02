import { MAX_DURATION_H, skuCatalog } from "./pricing";

const SELF_URL =
  process.env.AGENT_B_URL ?? "https://quartermaster-agent-b.fly.dev";

export function buildOffer() {
  return {
    id: "offer_agent_b_gpu",
    agentId: "agent_b",
    service: "gpu_compute",
    quoteUrl: `${SELF_URL}/quote`,
    requoteUrl: `${SELF_URL}/requote`,
    maxDurationH: MAX_DURATION_H,
    skus: skuCatalog(),
    availableNow: true,
  };
}

/** Best-effort boot registration with the console registry. Never fatal. */
export async function registerOffer(): Promise<void> {
  const consoleUrl = process.env.CONSOLE_URL;
  if (!consoleUrl) {
    console.log("registry: CONSOLE_URL not set; skipping boot registration");
    return;
  }
  const url = `${consoleUrl.replace(/\/$/, "")}/api/registry/offers`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildOffer()),
      });
      if (res.ok) {
        console.log(`registry: offer registered at ${url}`);
        return;
      }
      console.log(`registry: attempt ${attempt} got ${res.status}`);
    } catch (err) {
      console.log(`registry: attempt ${attempt} failed: ${String(err)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log("registry: giving up after 3 attempts (non-fatal)");
}
