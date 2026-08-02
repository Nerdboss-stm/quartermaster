export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { currentUser } from "@/lib/auth";

/**
 * Prava redirects here after the passkey approval.
 *
 * It carries no mandate id, so the envelope is discovered by asking Prava
 * what this customer now has. Land the owner on the page that does exactly
 * that, rather than on the landing page: whichever tab or device finished
 * the passkey, the next thing they see imports what they just approved.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  console.log(`prava callback: ${url.search || "(no params)"}`);

  const user = await currentUser();
  const destination = user ? "/app/portfolio?approved=1" : "/";
  return Response.redirect(new URL(destination, url.origin).toString(), 303);
}
