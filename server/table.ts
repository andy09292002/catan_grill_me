// The table server for Board + phones games. Serves the built app to the board and the phones
// over the home Wi-Fi, runs the game, and saves it to a file after every change.
// Start with `npm run table`. No internet needed.

import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { SOCKET_PATH, TABLE_PORT, type ClientMessage } from '../src/net/protocol';
import { isSavedTable, Lobby, type Conn, type SavedTable } from './lobby';

const port = Number(process.env.PORT) || TABLE_PORT;
const dist = resolve(process.env.HEX_BOARD_DIST ?? 'dist');
const saveDir = resolve(process.env.HEX_BOARD_SAVE ?? '.table');
const saveFile = join(saveDir, 'game.json');

/** The PC's address on the home network, preferring the usual private ranges. */
function lanAddress(): string {
  const candidates = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return candidates.sort((a, b) => rank(a) - rank(b))[0] ?? 'localhost';
}

const origin = `http://${lanAddress()}:${port}`;
const joinUrl = `${origin}/phone.html`;

function load(): SavedTable | null {
  try {
    const t = JSON.parse(readFileSync(saveFile, 'utf8'));
    return isSavedTable(t) ? t : null;
  } catch {
    return null;
  }
}

function save(table: SavedTable | null) {
  try {
    mkdirSync(saveDir, { recursive: true });
    // Write then rename, so a crash mid-write never leaves half a file.
    writeFileSync(`${saveFile}.tmp`, JSON.stringify(table));
    renameSync(`${saveFile}.tmp`, saveFile);
  } catch (e) {
    console.error('Could not save the game:', e);
  }
}

const lobby = new Lobby({ joinUrl, save }, load());

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', origin);
  if (url.pathname === '/api/table') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ joinUrl }));
    return;
  }
  if (url.pathname === '/qr.svg') {
    // Only codes for this table's own pages.
    const text = url.searchParams.get('text') ?? '';
    if (!text.startsWith(`${origin}/`)) {
      res.writeHead(400).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' });
    res.end(await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }));
    return;
  }

  const path = normalize(join(dist, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!path.startsWith(dist + sep) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(path).pipe(res);
});

const sockets = new WebSocketServer({ server, path: SOCKET_PATH });
sockets.on('connection', (ws) => {
  const conn: Conn = { role: null, seat: null, send: (msg) => ws.send(JSON.stringify(msg)) };
  lobby.connect(conn);
  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (typeof msg === 'object' && msg !== null && typeof msg.type === 'string') lobby.receive(conn, msg);
  });
  ws.on('close', () => lobby.disconnect(conn));
});

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No built app in ${dist}. Run "npm run build" first, or use "npm run table".`);
  process.exit(1);
}

server.listen(port, '0.0.0.0', () => {
  console.log('Hex Board table is running.');
  console.log(`  Board, on this PC:   http://localhost:${port}/`);
  console.log(`  Phones join at:      ${joinUrl}`);
  console.log('Phones must be on the same Wi-Fi as this PC. Press Ctrl+C to stop.');
});
