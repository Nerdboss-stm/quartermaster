import { buildBundle } from "@/lib/bundle";

import { canReadRun } from "@/lib/run-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await canReadRun(req, params.id))) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  try {
    const bundle = await buildBundle(params.id);
    if (!bundle) {
      return Response.json({ error: `unknown run ${params.id}` }, { status: 404 });
    }
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="quartermaster-audit-${params.id}.json"`,
      },
    });
  } catch (err) {
    console.error(`bundle export failed for ${params.id}: ${String(err)}`);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
