export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prava redirects here after the passkey approval. Discovery of the new
 *  mandate happens via List Mandates polling, not from this callback. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  console.log(`prava callback: ${url.search || "(no params)"}`);
  // Send the owner back to the console on THIS origin. Landing on a dead
  // text page invites navigating back by hand, which is how the operator
  // token used to get lost. Discovery of the new mandate is a server-side
  // poll, so nothing depends on this redirect completing.
  return Response.redirect(new URL("/", url.origin).toString(), 303);
}
