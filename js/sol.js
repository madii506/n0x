/* anon: the Solana bits by hand. Keys are born in this browser (tweetnacl), transactions are built and signed here,
   and only signed bytes ever leave the page. */
const nacl = window.nacl;
const AL = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58e(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = AL[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
export function b58d(str) {
  let n = 0n; for (const c of str) { const i = AL.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of str) { if (c === '1') out.unshift(0); else break; }
  return Uint8Array.from(out);
}
export const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
export const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '');

export async function rpc(method, params = []) {
  const r = await fetch('/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, params }) });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(j.error.message || j.error);
  if (!('result' in j)) throw new Error('Solana did not answer');
  return j.result;
}
export async function balance(addr) { const r = await rpc('getBalance', [addr, { commitment: 'confirmed' }]); return (r.value || 0) / 1e9; }

/* ---- anon wallets: fresh keypairs that never touch your main wallet */
const KEY = 'anon:wallets';
export function loadWallets() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
export function saveWallets(ws) { try { localStorage.setItem(KEY, JSON.stringify(ws)); } catch (e) { } }
export function newWallet(label) {
  const kp = nacl.sign.keyPair();
  return { address: b58e(kp.publicKey), secret: b58e(kp.secretKey), label: label || 'anon ' + Math.random().toString(36).slice(2, 6), created: Date.now() };
}
export function importWallet(secret) {
  const sk = secret.trim().startsWith('[') ? Uint8Array.from(JSON.parse(secret)) : b58d(secret.trim());
  if (sk.length !== 64) throw new Error('that is not a 64-byte secret key');
  const kp = nacl.sign.keyPair.fromSecretKey(sk);
  return { address: b58e(kp.publicKey), secret: b58e(kp.secretKey), label: 'imported', created: Date.now() };
}

/* ---- wire format */
function cu16(n) { const o = []; for (;;) { let b = n & 0x7f; n >>= 7; if (n) { o.push(b | 0x80); } else { o.push(b); return o; } } }
function readCu16(u, i) { let n = 0, s = 0, b; do { b = u[i++]; n |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return [n, i]; }
function u64le(v) { const o = new Uint8Array(8); let x = BigInt(v); for (let i = 0; i < 8; i++) { o[i] = Number(x & 255n); x >>= 8n; } return o; }

// a legacy transaction with one System transfer: from pays to, from is the fee payer
export function transferMessage(from, to, lamports, blockhash) {
  const SYS = new Uint8Array(32);
  const keys = [b58d(from), b58d(to), SYS];
  const data = new Uint8Array([2, 0, 0, 0, ...u64le(lamports)]);
  const m = [1, 0, 1, ...cu16(3)];
  for (const k of keys) m.push(...k);
  m.push(...b58d(blockhash));
  m.push(...cu16(1), 2, ...cu16(2), 0, 1, ...cu16(data.length), ...data);
  return Uint8Array.from(m);
}
export function wireUnsigned(message, nsig = 1) { return Uint8Array.from([...cu16(nsig), ...new Uint8Array(64 * nsig), ...message]); }
export function signWire(wire, wallet) {
  const [n, i0] = readCu16(wire, 0); const msg = wire.subarray(i0 + 64 * n);
  // find our key's slot among the signers
  let i = 0; const v0 = (msg[0] & 0x80) !== 0; if (v0) i = 1;
  const nreq = msg[i]; let j = i + 3; let nkeys; [nkeys, j] = readCu16(msg, j);
  const me = b58d(wallet.address); let slot = -1;
  for (let k = 0; k < Math.min(nkeys, nreq); k++) { const key = msg.subarray(j + 32 * k, j + 32 * k + 32); if (key.every((b, x) => b === me[x])) { slot = k; break; } }
  if (slot < 0) throw new Error('this transaction does not ask the anon wallet to sign');
  const sig = nacl.sign.detached(msg, b58d(wallet.secret));
  const outw = Uint8Array.from(wire); outw.set(sig, i0 + 64 * slot); return { wire: outw, sig: b58e(sig) };
}
export async function send(wire) { return rpc('sendTransaction', [toB64(wire), { encoding: 'base64', skipPreflight: false, maxRetries: 3 }]); }
export async function confirm(sig, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]).catch(() => null);
    const s = r && r.value && r.value[0];
    if (s && s.err) throw new Error('the transaction failed on chain');
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('not confirmed yet; check it on Solscan');
}
export async function latest() { const r = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]); return r.value.blockhash; }
