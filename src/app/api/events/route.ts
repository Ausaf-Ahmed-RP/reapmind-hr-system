import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { addSSEClient, removeSSEClient } from '@/lib/events';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection ping
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`));

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          removeSSEClient(clientId);
        }
      };

      addSSEClient({
        id: clientId,
        userId: user.id,
        role: user.role,
        send,
      });

      // Keepalive heartbeat every 25 seconds
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(interval);
          removeSSEClient(clientId);
        }
      }, 25000);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        removeSSEClient(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
