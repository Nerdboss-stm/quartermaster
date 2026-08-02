import type { NextRequest } from "next/server";
import { traceEventsSince } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 300;
const HEARTBEAT_MS = 15000;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const runId = params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let lastId = 0;
      let closed = false;

      const push = () => {
        if (closed) return;
        try {
          for (const row of traceEventsSince(runId, lastId)) {
            controller.enqueue(
              encoder.encode(
                `id: ${row.id}\ndata: ${JSON.stringify({
                  id: row.id,
                  at: row.at,
                  body: JSON.parse(row.body),
                })}\n\n`
              )
            );
            lastId = row.id;
          }
        } catch {
          close();
        }
      };

      const poll = setInterval(push, POLL_MS);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": hb\n\n"));
      }, HEARTBEAT_MS);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the runtime
        }
      };

      req.signal.addEventListener("abort", close);
      push();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
