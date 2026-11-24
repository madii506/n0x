// n0x API: no keys, no custody, no database. The browser holds every key and signs everything; this only relays what the
// page can't reach under its strict CSP: Solana RPC (allowlisted), NEAR Intents 1Click (quote/status/submit) and
// Hyperliquid's public API (info reads, and already-signed exchange actions).
const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
const ALLOWED = new Set(['getLatestBlockhash', 'getBalance', 'sendTransaction', 'getSignatureStatuses']);
const ONECLICK = 'https://1click.chaindefuser.com/v0';
const SOL = 'nep141:sol.omft.near';
const HL_USDC = '1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054';      // USDC, credited to the Hyperliquid perps balance
const HL = 'https://api.hyperliquid.xyz';
const INFO = new Set(['metaAndAssetCtxs', 'meta', 'allMids', 'clearinghouseState', 'openOrders', 'userFills']);
const isSol = s => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const isEvm = s => typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);

async function rpc(method, params) {
  let last = null;
  for (const u of RPCS) {
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      if ([401, 403, 429].includes(r.status) || r.status >= 500) { last = new Error('rpc ' + r.status); continue; }
      const j = await r.json();
      if (j.error && /rate|limit|forbidden|token/i.test(j.error.message || '')) { last = new Error(j.error.message); continue; }
      return j;
    } catch (e) { last = e; }
  }
  throw last || new Error('Solana did not answer');
}
function body(req) {
  return new Promise(res => { if (req.body && typeof req.body === 'object') return res(req.body); let s = ''; req.on('data', c => s += c); req.on('end', () => { try { res(JSON.parse(s || '{}')); } catch { res({}); } }); });
}
function out(res, code, obj, cache) {
  res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = (u.searchParams.get('__p') || '').replace(/\/+$/, '');
  try {
    if (p === 'config') return out(res, 200, { ok: true, ca: process.env.N0X_CA || null, x: process.env.N0X_X || null });

    if (p === 'rpc') {
      const b = await body(req);
      if (!ALLOWED.has(b.method)) return out(res, 400, { ok: false, error: 'method not allowed' });
      return out(res, 200, await rpc(b.method, Array.isArray(b.params) ? b.params : []));
    }

    // a live, dry quote for the hero: what 1 SOL routes to right now (no deposit address is created)
    if (p === 'peek') {
      const q = { dry: true, swapType: 'EXACT_INPUT', slippageTolerance: 100, originAsset: SOL, depositType: 'ORIGIN_CHAIN', destinationAsset: HL_USDC, amount: '1000000000',
        refundTo: 'So11111111111111111111111111111111111111112', refundType: 'ORIGIN_CHAIN', recipient: '0x8f1c4b2a9d3e7f6051c2a8b9e4d7f3a6c1b5e902', recipientType: 'DESTINATION_CHAIN',
        deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(), referral: 'n0x', quoteWaitingTimeMs: 2000 };
      const r = await fetch(`${ONECLICK}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
      const j = await r.json().catch(() => ({})); const qq = j.quote || {};
      if (!r.ok || !qq.amountOutFormatted) return out(res, 502, { ok: false, error: 'no quote right now' });
      return out(res, 200, { ok: true, out: qq.amountOutFormatted, time: qq.timeEstimate || null }, 's-maxage=60, stale-while-revalidate=120');
    }

    // the private route: SOL in at a one-time address, USDC out into the fresh account's Hyperliquid balance
    if (p === 'route') {
      if (req.method === 'GET') {
        const dep = u.searchParams.get('deposit');
        if (!isSol(dep)) return out(res, 400, { ok: false, error: 'bad deposit address' });
        const r = await fetch(`${ONECLICK}/status?depositAddress=${encodeURIComponent(dep)}`); const j = await r.json().catch(() => ({}));
        return out(res, r.ok ? 200 : 502, { ok: r.ok, ...j });
      }
      const b = await body(req);
      if (b.op === 'submit') {
        const r = await fetch(`${ONECLICK}/deposit/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ txHash: String(b.txHash || ''), depositAddress: String(b.depositAddress || '') }) });
        const j = await r.json().catch(() => ({})); return out(res, r.ok ? 200 : 502, { ok: r.ok, ...j });
      }
      const lamports = String(Math.floor(Number(b.lamports) || 0));
      if (!(Number(lamports) >= 1e7)) return out(res, 400, { ok: false, error: 'the smallest route is 0.01 SOL' });
      if (!isEvm(b.recipient)) return out(res, 400, { ok: false, error: 'bad fresh account address' });
      if (!isSol(b.refundTo)) return out(res, 400, { ok: false, error: 'bad refund wallet' });
      const q = {
        dry: !!b.dry, swapType: 'EXACT_INPUT', slippageTolerance: 100,
        originAsset: SOL, depositType: 'ORIGIN_CHAIN', destinationAsset: HL_USDC, amount: lamports,
        refundTo: b.refundTo, refundType: 'ORIGIN_CHAIN', recipient: b.recipient, recipientType: 'DESTINATION_CHAIN',
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), referral: 'n0x', quoteWaitingTimeMs: 3000,
      };
      const r = await fetch(`${ONECLICK}/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return out(res, 502, { ok: false, error: j.message || j.error || ('route quote failed (' + r.status + ')') });
      return out(res, 200, { ok: true, quote: j.quote || j, raw: j });
    }

    // Hyperliquid: public reads, and actions the browser already signed (the key never comes here)
    if (p === 'hl') {
      const b = await body(req);
      if (b.kind === 'info') {
        if (!b.body || !INFO.has(b.body.type)) return out(res, 400, { ok: false, error: 'info type not allowed' });
        if (b.body.user && !isEvm(b.body.user)) return out(res, 400, { ok: false, error: 'bad address' });
        const r = await fetch(`${HL}/info`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b.body) });
        const t = await r.text(); res.statusCode = r.status; res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', b.body.type === 'metaAndAssetCtxs' ? 's-maxage=15' : 'no-store'); return res.end(t);
      }
      if (b.kind === 'exchange') {
        const x = b.body || {};
        if (!x.action || !x.signature || !Number.isFinite(x.nonce)) return out(res, 400, { ok: false, error: 'not a signed action' });
        if (!['order', 'updateLeverage', 'withdraw3', 'cancel'].includes(x.action.type)) return out(res, 400, { ok: false, error: 'action not allowed' });
        const r = await fetch(`${HL}/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(x) });
        const t = await r.text(); res.statusCode = 200; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
        try { JSON.parse(t); return res.end(t); } catch { return res.end(JSON.stringify({ status: 'err', response: t.slice(0, 300) || ('Hyperliquid said ' + r.status) })); }
      }
      return out(res, 400, { ok: false, error: 'unknown request' });
    }
    return out(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    return out(res, 500, { ok: false, error: e.message || 'server error' });
  }
};
