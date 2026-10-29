// The table server for Board + phones games. Serves the built app to the board and the phones
// over the home Wi-Fi, runs the game, and saves it to a file after every change.
// Start with `npm run table`, or double-click HexBoard.exe (`npm run exe` builds it). No internet needed.

import { exec } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { SOCKET_PATH, TABLE_PORT, type ClientMessage } from '../src/net/protocol';
import { isSavedTable, Lobby, type Conn, type SavedTable } from './lobby';

const port = Number(process.env.PORT) || TABLE_PORT;
/** Running as HexBoard.exe: the app's files are inside the exe, and the game is saved in the user's folder. */
const packaged = isSea();
const dist = resolve(process.env.HEX_BOARD_DIST ?? 'dist');
const saveDir = resolve(process.env.HEX_BOARD_SAVE ?? (packaged ? join(process.env.APPDATA ?? homedir(), 'Hex Board') : '.table'));
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

  const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const body = appFile(name);
  if (!body) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(name)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(body);
});

/** A file of the built app, from `dist/` or from inside the exe; null if there's no such file. */
function appFile(name: string): Buffer | null {
  if (packaged) {
    try {
      // The exe's files are keyed by their path under dist, with forward slashes.
      return Buffer.from(getAsset(`dist${normalize(name).replaceAll('\\', '/')}`));
    } catch {
      return null;
    }
  }
  const path = normalize(join(dist, name));
  if (!path.startsWith(dist + sep) || !existsSync(path) || !statSync(path).isFile()) return null;
  return readFileSync(path);
}

/** Opens the board in the PC's browser: double-clicking the exe should be all it takes. */
function openBoard() {
  if (process.platform === 'win32' && packaged && !process.argv.includes('--no-open')) exec(`start "" "http://localhost:${port}/"`);
}

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

if (!appFile('/index.html')) {
  console.error(`No built app in ${dist}. Run "npm run build" first, or use "npm run table".`);
  process.exit(1);
}

server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    // Most likely the table is already running, say from an earlier double-click.
    console.error(`Port ${port} is already in use. Hex Board may already be running: opening the board.`);
    openBoard();
  } else {
    console.error('The table server stopped:', e.message);
  }
  // Keep the window up long enough to read, when started by a double-click.
  setTimeout(() => process.exit(1), packaged ? 15000 : 0);
});

server.listen(port, '0.0.0.0', () => {
  console.log('Hex Board table is running.');
  console.log(`  Board, on this PC:   http://localhost:${port}/`);
  console.log(`  Phones join at:      ${joinUrl}`);
  if (packaged) console.log(`  Games are saved in:  ${saveDir}`);
  console.log('Phones must be on the same Wi-Fi as this PC. Close this window or press Ctrl+C to stop.');
  openBoard();
});
