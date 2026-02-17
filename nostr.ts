import * as secp256k1 from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 as noble256 } from '@noble/hashes/sha2.js';

// Configure secp256k1 HMAC for signing
(secp256k1.utils as any).hmacSha256 = (key: Uint8Array, ...msgs: Uint8Array[]): Uint8Array =>
  hmac(noble256, key, msgs.length === 1 ? msgs[0] : msgs.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }));
(secp256k1.utils as any).sha256 = (m: Uint8Array): Uint8Array => noble256(m);

// ---- Hex/Bytes ----
export const hexToBytes = (h: string): Uint8Array => {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) b[i / 2] = parseInt(h.substr(i, 2), 16);
  return b;
};
export const bytesToHex = (b: Uint8Array): string => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

// ---- Bech32 ----
const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(v: number[]): number {
  let c = 1;
  for (const val of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ val; for (let j = 0; j < 5; j++) if ((b >> j) & 1) c ^= GEN[j]; }
  return c;
}
function hrpExpand(h: string): number[] {
  const r: number[] = [];
  for (let i = 0; i < h.length; i++) r.push(h.charCodeAt(i) >> 5);
  r.push(0);
  for (let i = 0; i < h.length; i++) r.push(h.charCodeAt(i) & 31);
  return r;
}
function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0, bits = 0; const r: number[] = [], mx = (1 << to) - 1;
  for (const v of data) { if (v < 0 || v >> from) return null; acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; r.push((acc >> bits) & mx); } }
  if (pad) { if (bits > 0) r.push((acc << (to - bits)) & mx); } else if (bits >= from || ((acc << (to - bits)) & mx)) return null;
  return r;
}
function bech32Encode(hrp: string, data: Uint8Array): string {
  const w = convertBits(Array.from(data), 8, 5, true)!;
  const cs = hrpExpand(hrp).concat(w).concat([0, 0, 0, 0, 0, 0]);
  const pm = polymod(cs) ^ 1;
  const ck: number[] = [];
  for (let i = 0; i < 6; i++) ck.push((pm >> (5 * (5 - i))) & 31);
  return hrp + '1' + w.concat(ck).map(v => B32[v]).join('');
}
function bech32Decode(s: string): { hrp: string; data: Uint8Array } {
  const p = s.lastIndexOf('1');
  const hrp = s.substring(0, p).toLowerCase();
  const d: number[] = [];
  for (let i = p + 1; i < s.length; i++) { const v = B32.indexOf(s[i]); if (v === -1) throw new Error('bad char'); d.push(v); }
  const bytes = convertBits(d.slice(0, -6), 5, 8, false);
  if (!bytes) throw new Error('bad data');
  return { hrp, data: new Uint8Array(bytes) };
}

// ---- Key conversion ----
export const nsecToHex = (nsec: string): string => { const { hrp, data } = bech32Decode(nsec); if (hrp !== 'nsec') throw new Error('not nsec'); return bytesToHex(data); };
export const hexToNpub = (hex: string): string => bech32Encode('npub', hexToBytes(hex));
export const isValidNsec = (s: string): boolean => s.startsWith('nsec1') && s.length >= 62 && s.length <= 65;

export async function nsecToNpub(nsec: string): Promise<string> {
  const privHex = nsecToHex(nsec);
  const pubBytes = secp256k1.getPublicKey(privHex, false);
  const pubHex = bytesToHex(pubBytes instanceof Uint8Array ? pubBytes : new Uint8Array(pubBytes));
  return hexToNpub(pubHex.substring(2, 66));
}

export function formatNpub(npub: string): string {
  if (!npub.startsWith('npub1') || npub.length <= 13) return npub;
  const w = npub.substring(5);
  return `npub1${w.substring(0, 4)}...${w.substring(w.length - 4)}`;
}

// ---- SHA-256 ----
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// ---- Nostr Event ----
export interface NostrEvent {
  id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string;
}

export async function signEvent(privHex: string, kind: number, content: string, tags: string[][]): Promise<NostrEvent> {
  const pubBytes = secp256k1.getPublicKey(privHex, false);
  const pubHex = bytesToHex(pubBytes instanceof Uint8Array ? pubBytes : new Uint8Array(pubBytes)).substring(2, 66);
  const created_at = Math.floor(Date.now() / 1000);
  const id = await sha256(JSON.stringify([0, pubHex, created_at, kind, tags, content]));
  const sigObj = await secp256k1.signAsync(hexToBytes(id), privHex);
  const sig = bytesToHex(sigObj.toCompactRawBytes());
  return { id, pubkey: pubHex, created_at, kind, tags, content, sig };
}

// ---- Relay Pool ----
const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band'];

export class RelayPool {
  private sockets: Map<string, WebSocket> = new Map();
  private pending: Map<string, { resolve: (events: NostrEvent[]) => void; events: NostrEvent[]; timer: ReturnType<typeof setTimeout> }> = new Map();
  public connected = false;

  async connect(urls: string[] = DEFAULT_RELAYS): Promise<void> {
    const promises = urls.map(url => new Promise<void>((res) => {
      try {
        const ws = new WebSocket(url);
        ws.onopen = () => { this.sockets.set(url, ws); res(); };
        ws.onerror = () => res();
        ws.onclose = () => { this.sockets.delete(url); };
        ws.onmessage = (e) => this.handleMessage(e.data);
        setTimeout(() => res(), 4000); // timeout
      } catch { res(); }
    }));
    await Promise.all(promises);
    this.connected = this.sockets.size > 0;
  }

  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg[0] === 'EVENT' && msg[1] && msg[2]) {
        const subId = msg[1] as string;
        const event = msg[2] as NostrEvent;
        const p = this.pending.get(subId);
        if (p) p.events.push(event);
      } else if (msg[0] === 'EOSE' && msg[1]) {
        const subId = msg[1] as string;
        const p = this.pending.get(subId);
        if (p) { clearTimeout(p.timer); this.pending.delete(subId); this.closeSubscription(subId); p.resolve(p.events); }
      }
    } catch { /* ignore */ }
  }

  private closeSubscription(subId: string) {
    const msg = JSON.stringify(['CLOSE', subId]);
    this.sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
  }

  async publish(event: NostrEvent): Promise<void> {
    const msg = JSON.stringify(['EVENT', event]);
    this.sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
    await new Promise(r => setTimeout(r, 500)); // small wait for relay acceptance
  }

  async query(filters: Record<string, any>, timeoutMs = 6000): Promise<NostrEvent[]> {
    const subId = 'q' + Math.random().toString(36).substring(2, 10);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending.delete(subId); this.closeSubscription(subId); resolve([]); }, timeoutMs);
      this.pending.set(subId, { resolve, events: [], timer });
      const msg = JSON.stringify(['REQ', subId, filters]);
      this.sockets.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
    });
  }

  disconnect() {
    this.sockets.forEach(ws => ws.close());
    this.sockets.clear();
    this.connected = false;
  }
}

// ---- Nostr Event Kinds for Delivery ----
export const KIND_DELIVERY = 35000;
export const KIND_BID = 35001;
export const KIND_STATUS = 35002;
export const KIND_PROFILE = 35009;
export const KIND_SETTINGS = 35010;

// ---- Settings encryption (AES-GCM, keyed by private key) ----
export async function encryptForSelf(privHex: string, plaintext: string): Promise<string> {
  const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(privHex)));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptForSelf(privHex: string, ciphertext: string): Promise<string> {
  const keyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(privHex)));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

// ---- Unique ID generation ----
export function genId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
}
