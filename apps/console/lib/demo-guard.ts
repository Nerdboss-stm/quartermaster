/**
 * The demo controller drives the REAL pipeline: it creates Prava envelope
 * sessions and settles real sandbox charges against a team card with a
 * daily transaction limit. That is fine on a laptop and unacceptable on a
 * public URL, where any visitor pressing Space would spend the owner's
 * money.
 *
 * Rule: when QM_DEMO_TOKEN is set, every money-moving control needs it.
 * On a hosted deployment the token is REQUIRED — a missing token there
 * locks the controls rather than leaving them open, so a misconfigured
 * deploy fails closed.
 */

export type GuardResult = { ok: true } | { ok: false; status: number; message: string };

function isHosted(): boolean {
  return !!process.env.VERCEL || process.env.NODE_ENV === "production";
}

export function demoControlsConfigured(): boolean {
  return !!process.env.QM_DEMO_TOKEN || !isHosted();
}

export function authorizeDemoControl(req: Request): GuardResult {
  const expected = process.env.QM_DEMO_TOKEN;

  if (!expected) {
    if (isHosted()) {
      return {
        ok: false,
        status: 503,
        message:
          "demo controls are disabled: set QM_DEMO_TOKEN on this deployment to enable them",
      };
    }
    return { ok: true }; // local development
  }

  const url = new URL(req.url);
  const supplied =
    req.headers.get("x-qm-demo-token") ?? url.searchParams.get("token");
  if (supplied !== expected) {
    return {
      ok: false,
      status: 401,
      message: "demo control token missing or incorrect",
    };
  }
  return { ok: true };
}
