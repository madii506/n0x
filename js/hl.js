/* n0x × Hyperliquid, by hand. Fresh secp256k1 keys are born in this browser; orders are L1 actions signed here
   (msgpack → keccak → phantom agent → EIP-712), withdrawals are user-signed actions. Only signatures leave the page. */
import { secp256k1, keccak_256, msgpack } from '/vendor/crypto.js';

const enc = new TextEncoder();
export const hex = b => '0x' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export const unhex = h => { h = String(h).replace(/^0x/, ''); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
const k256 = b => keccak_256(b);
const ZERO = '0x0000000000000000000000000000000000000000';

export function checksum(a) {
  const s = a.replace(/^0x/, '').toLowerCase(), h = hex(k256(enc.encode(s))).slice(2); let o = '0x';
  for (let i = 0; i < 40; i++) o += parseInt(h[i], 16) >= 8 ? s[i].toUpperCase() : s[i];
  return o;
}
export function addressOf(priv) { return checksum(hex(k256(secp256k1.getPublicKey(priv, false).slice(1)).slice(12))); }
export function newKey() { return hex(secp256k1.utils.randomPrivateKey()); }
export const isEvm = s => /^0x[0-9a-fA-F]{40}$/.test(s || '');

/* ---- EIP-712 */
const u256 = n => { const b = new Uint8Array(32); let x = BigInt(n); for (let i = 31; i >= 0; i--) { b[i] = Number(x & 255n); x >>= 8n; } return b; };
const th = s => k256(enc.encode(s));
const str = s => k256(enc.encode(s));
function domain(name, version, chainId) {
  return k256(cat(th('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'), str(name), str(version), u256(chainId), cat(new Uint8Array(12), unhex(ZERO))));
}
function sign712(priv, dom, structHash) {
  const digest = k256(cat(new Uint8Array([0x19, 0x01]), dom, structHash));
  const sig = secp256k1.sign(digest, unhex(priv), { lowS: true });
  return { r: '0x' + sig.r.toString(16).padStart(64, '0'), s: '0x' + sig.s.toString(16).padStart(64, '0'), v: 27 + sig.recovery };
}
const be64 = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; };

/* ---- L1 actions (orders, leverage): the action hash rides in a phantom agent */
export function actionHash(action, nonce) { return k256(cat(msgpack(action), be64(nonce), new Uint8Array([0]))); }
export function signL1(priv, action, nonce, mainnet = true) {
  const agent = k256(cat(th('Agent(string source,bytes32 connectionId)'), str(mainnet ? 'a' : 'b'), actionHash(action, nonce)));
  return sign712(priv, domain('Exchange', '1', 1337), agent);
}
/* ---- user-signed actions (withdraw to Arbitrum) */
export function signWithdraw(priv, action) {
  const t = th('HyperliquidTransaction:Withdraw(string hyperliquidChain,string destination,string amount,uint64 time)');
  const st = k256(cat(t, str(action.hyperliquidChain), str(action.destination), str(action.amount), u256(action.time)));
  return sign712(priv, domain('HyperliquidSignTransaction', '1', parseInt(action.signatureChainId, 16)), st);
}

/* ---- numbers the way Hyperliquid wants them */
export function wire(x) {
  let s = Number(x).toFixed(8); if (Math.abs(parseFloat(s) - x) >= 1e-12 && Math.abs(x) > 1e-12) throw new Error('rounding');
  s = s.replace(/\.?0+$/, ''); return s === '-0' ? '0' : s;
}
export function pxRound(px, szDecimals) {      // ≤ 5 significant figures, ≤ 6 - szDecimals decimals
  const sig = parseFloat(Number(px).toPrecision(5)); const d = Math.max(0, 6 - szDecimals);
  return Math.round(sig * 10 ** d) / 10 ** d;
}
export const szRound = (sz, szDecimals) => Math.floor(sz * 10 ** szDecimals + 1e-9) / 10 ** szDecimals;

/* ---- network: everything goes through /api/hl */
async function hl(kind, body) {
  const r = await fetch('/api/hl', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, body }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && j && j.error) throw new Error(j.error);
  return j;
}
export const info = body => hl('info', body);
let META = null;
export async function meta() {
  if (META) return META;
  const [m, ctx] = await info({ type: 'metaAndAssetCtxs' });
  META = m.universe.map((u, i) => ({ ...u, asset: i, ctx: ctx[i] })).filter(u => !u.isDelisted);
  return META;
}
export async function state(user) { return info({ type: 'clearinghouseState', user }); }
export async function mids() { return info({ type: 'allMids' }); }

async function post(action, sig, nonce) {
  const j = await hl('exchange', { action, nonce, signature: sig, vaultAddress: null });
  if (j.status !== 'ok') throw new Error(typeof j.response === 'string' ? j.response : (j.error || 'Hyperliquid refused the action'));
  return j.response;
}
export async function setLeverage(priv, asset, leverage, isCross = true) {
  const nonce = Date.now(); const action = { type: 'updateLeverage', asset, isCross, leverage: Math.round(leverage) };
  return post(action, signL1(priv, action, nonce), nonce);
}
// an aggressive IOC limit is a market order on Hyperliquid; reduceOnly closes
export async function marketOrder(priv, m, isBuy, size, reduceOnly = false, slippage = 0.04) {
  const mid = parseFloat((await mids())[m.name]); if (!(mid > 0)) throw new Error('no price for ' + m.name);
  const px = pxRound(mid * (isBuy ? 1 + slippage : 1 - slippage), m.szDecimals);
  const sz = szRound(size, m.szDecimals); if (!(sz > 0)) throw new Error('size is below the smallest step for ' + m.name);
  const order = { a: m.asset, b: isBuy, p: wire(px), s: wire(sz), r: reduceOnly, t: { limit: { tif: 'Ioc' } } };
  const nonce = Date.now(); const action = { type: 'order', orders: [order], grouping: 'na' };
  const res = await post(action, signL1(priv, action, nonce), nonce);
  const st = res && res.data && res.data.statuses && res.data.statuses[0];
  if (st && st.error) throw new Error(st.error);
  return st;
}
export async function limitOrder(priv, m, isBuy, size, px, reduceOnly = false) {
  const order = { a: m.asset, b: isBuy, p: wire(pxRound(px, m.szDecimals)), s: wire(szRound(size, m.szDecimals)), r: reduceOnly, t: { limit: { tif: 'Gtc' } } };
  const nonce = Date.now(); const action = { type: 'order', orders: [order], grouping: 'na' };
  const res = await post(action, signL1(priv, action, nonce), nonce);
  const st = res && res.data && res.data.statuses && res.data.statuses[0];
  if (st && st.error) throw new Error(st.error);
  return st;
}
export async function withdraw(priv, destination, amount) {
  const time = Date.now();
  const action = { type: 'withdraw3', hyperliquidChain: 'Mainnet', signatureChainId: '0x66eee', destination: destination.toLowerCase(), amount: wire(amount), time };
  return post(action, signWithdraw(priv, action), time);
}
