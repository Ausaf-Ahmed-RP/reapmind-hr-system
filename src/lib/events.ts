type SSEClient = {
  id: string;
  userId: string;
  role: string;
  send: (data: string) => void;
};

// Global singleton for managing active SSE client streams
const globalClients = globalThis as unknown as {
  sseClients: Map<string, SSEClient> | undefined;
};

if (!globalClients.sseClients) {
  globalClients.sseClients = new Map<string, SSEClient>();
}

export const sseClients = globalClients.sseClients;

export function addSSEClient(client: SSEClient) {
  sseClients.set(client.id, client);
}

export function removeSSEClient(clientId: string) {
  sseClients.delete(clientId);
}

export function broadcastEvent(event: {
  type: string;
  payload: any;
  targetRoles?: string[];
  targetUserId?: string;
}) {
  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;

  sseClients.forEach((client) => {
    // If targeted to a specific user
    if (event.targetUserId && client.userId !== event.targetUserId) {
      return;
    }
    // If targeted to specific roles
    if (event.targetRoles && !event.targetRoles.includes(client.role)) {
      return;
    }
    try {
      client.send(message);
    } catch {
      // client disconnected
    }
  });
}
