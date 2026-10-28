import { SOCKET_PATH, type ClientMessage, type ServerMessage } from './protocol';

export interface TableSocket {
  send(msg: ClientMessage): void;
}

/**
 * A connection to the table server that comes back by itself after Wi-Fi drops, the phone
 * sleeps or the server restarts. `hello` is sent on every (re)connect.
 */
export function openSocket(hello: () => ClientMessage, onMessage: (msg: ServerMessage) => void, onStatus: (connected: boolean) => void): TableSocket {
  let ws: WebSocket | null = null;
  let retry = 500;
  let timer = 0;

  const connect = () => {
    window.clearTimeout(timer);
    const url = new URL(SOCKET_PATH, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    ws = socket;
    socket.onopen = () => {
      retry = 500;
      socket.send(JSON.stringify(hello()));
      onStatus(true);
    };
    socket.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        // Ignore anything that isn't a message.
      }
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      onStatus(false);
      timer = window.setTimeout(connect, retry);
      retry = Math.min(retry * 2, 5000);
    };
  };

  // A phone waking up shouldn't wait out the back-off.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !ws) connect();
  });
  connect();

  return {
    send(msg) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
}

/** True when this page was served by the table server, so Board + phones games are possible. */
export async function tableAvailable(): Promise<boolean> {
  try {
    const res = await fetch('./api/table', { cache: 'no-store' });
    return res.ok && (res.headers.get('content-type') ?? '').includes('json');
  } catch {
    return false;
  }
}

/** The QR code image for an address on the table server. */
export function qrSrc(text: string): string {
  return `./qr.svg?text=${encodeURIComponent(text)}`;
}
