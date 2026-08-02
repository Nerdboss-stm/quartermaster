export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Prava redirects here after the passkey approval. Discovery of the new
 *  mandate happens via List Mandates polling, not from this callback. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  console.log(`prava callback: ${url.search || "(no params)"}`);
  return new Response(
    "Envelope approval received. You can close this tab and return to the console.",
    { headers: { "content-type": "text/plain" } }
  );
}
