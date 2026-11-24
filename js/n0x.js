/* n0x: intro, scroll, and the terminal. Fresh Hyperliquid keys live in this browser; the private route is a NEAR Intents
   1Click swap (SOL in, USDC out into the fresh account's Hyperliquid balance); orders are signed here (see hl.js). */
import * as H from './hl.js';
import * as S from './sol.js';
const $ = (q, r = document) => r.querySelector(q), $$ = (q, r = document) => [...r.querySelectorAll(q)];
const mobile = matchMedia('(max-width: 720px)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(m, ms = 3200) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
async function api(path, body, method) {
  const r = await fetch('/api/' + path, body ? { method: method || 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || j.message || ('request failed (' + r.status + ')'));
  return j;
}
const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = n => '$' + fmt(n, 2);
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
function status(id, m, cls = '') { const s = $(id); s.className = 'status ' + cls; s.innerHTML = m; }

/* ---------- intro ---------- */
let scene = null, introDone = false;
const LINE = 'the privacy layer for perps';
function endIntro() {
  if (introDone) return; introDone = true;
  $('#intro').classList.add('out'); document.body.classList.remove('lock'); document.documentElement.classList.add('ready');
  if (scene) scene.intro();
}
function boot() {
  document.body.classList.add('lock');
  import('./scene.js?v=4').then(m => m.createScene($('#scene'), { mobile })).then(s => { scene = s; window.__n0x = s; if (introDone) s.intro(); }).catch(() => { });
  if (reduce || location.hash) { endIntro(); return; }
  const t0 = performance.now(), DUR = 2700, el = $('#inType');
  (function tick() {
    if (introDone) return;
    const k = Math.min(1, (performance.now() - t0) / DUR);
    el.textContent = LINE.slice(0, Math.floor(Math.max(0, Math.min(1, (k - 0.32) / 0.5)) * LINE.length));
    if (k < 1) requestAnimationFrame(tick); else setTimeout(endIntro, 250);
  })();
  setTimeout(endIntro, 4800);           // backstop
  $('#inSkip').onclick = endIntro;
}
boot();

/* ---------- scroll: nav, reveals, active link, scene walk ---------- */
const nav = $('#nav'), links = $$('#nav .links a'), secs = links.map(a => $(a.getAttribute('href')));
function onScroll() {
  const y = scrollY, vh = innerHeight;
  nav.classList.toggle('solid', y > 40);
  if (scene) scene.setScroll(y / Math.max(1, document.documentElement.scrollHeight - vh));
  let on = -1; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < vh * 0.4) on = i; });
  links.forEach((a, i) => a.classList.toggle('on', i === on));
}
addEventListener('scroll', onScroll, { passive: true }); onScroll();
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { threshold: 0.18 });
$$('.rv, .graph').forEach(el => io.observe(el));

/* ---------- config: CA + X once they're set ---------- */
api('config').then(c => {
  if (c.ca) for (const [b, t, k] of [['#caBox', '#caTxt', '#caCopy'], ['#caBox2', '#caTxt2', '#caCopy2']]) {
    $(t).textContent = c.ca; $(b).hidden = false; $(k).onclick = () => { navigator.clipboard.writeText(c.ca); toast('Contract address copied'); };
  }
  if (c.ca) $('#tokLine').textContent = '$N0X';
  if (c.x) { $('#xLink').href = c.x; $('#xLink').hidden = false; }
}).catch(() => { });

/* ---------- fresh accounts (keys never leave this browser) ---------- */
const AK = 'n0x:accounts', CK = 'n0x:current';
let accts = []; try { accts = JSON.parse(localStorage.getItem(AK) || '[]'); } catch (e) { }
let cur = 0; try { cur = +(localStorage.getItem(CK) || 0); } catch (e) { }
const save = () => { try { localStorage.setItem(AK, JSON.stringify(accts)); localStorage.setItem(CK, String(cur)); } catch (e) { } };
const acct = () => accts[cur] || null;
function renderAccts() {
  const sel = $('#acctSel'); sel.innerHTML = accts.length ? accts.map((a, i) => `<option value="${i}">${a.label} · ${short(a.address)}</option>`).join('') : '<option>No account yet</option>';
  sel.disabled = !accts.length; if (accts.length) sel.value = String(cur);
  $('#acctAddr').textContent = acct() ? acct().address : 'Make a fresh account to start';
  ['#acctCopy', '#acctBak'].forEach(q => $(q).disabled = !acct());
  refresh();
}
$('#acctSel').onchange = e => { cur = +e.target.value; save(); renderAccts(); };
$('#acctNew').onclick = () => {
  const key = H.newKey(); const address = H.addressOf(H.unhex(key));
  accts.push({ address, key, label: 'n0x ' + (accts.length + 1), created: Date.now() }); cur = accts.length - 1; save(); renderAccts();
  toast('Fresh account made. Back up the key.');
};
$('#acctCopy').onclick = () => { if (acct()) { navigator.clipboard.writeText(acct().address); toast('Address copied'); } };
$('#acctBak').onclick = () => {
  const a = acct(); if (!a) return;
  const blob = new Blob([JSON.stringify({ address: a.address, privateKey: a.key, note: 'n0x fresh account. Anyone with this key controls the funds.' }, null, 2)], { type: 'application/json' });
  const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `n0x-${a.address.slice(2, 8)}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 2000);
};
$('#acctImp').onclick = () => {
  const s = (prompt('Paste the private key (0x…) of an account to import') || '').trim(); if (!s) return;
  try {
    const key = (s.startsWith('0x') ? s : '0x' + s).toLowerCase(); if (!/^0x[0-9a-f]{64}$/.test(key)) throw new Error('that is not a 32-byte private key');
    const address = H.addressOf(H.unhex(key)); if (accts.some(a => a.address === address)) throw new Error('already here');
    accts.push({ address, key, label: 'imported', created: Date.now() }); cur = accts.length - 1; save(); renderAccts(); toast('Account imported');
  } catch (e) { toast(e.message); }
};

/* ---------- balances + positions ---------- */
let ST = null, MK = [], mid = {};
async function refresh() {
  const a = acct();
  if (!a) { $('#aVal').textContent = '—'; $('#aWd').textContent = '—'; posTable(null); return; }
  try {
    ST = await H.state(a.address);
    $('#aVal').textContent = usd(ST.marginSummary ? ST.marginSummary.accountValue : 0);
    $('#aWd').textContent = usd(ST.withdrawable || 0);
    posTable(ST);
  } catch (e) { $('#aVal').textContent = 'offline'; $('#aWd').textContent = '—'; }
}
function posTable(st) {
  const ps = st && st.assetPositions ? st.assetPositions.map(p => p.position).filter(p => Number(p.szi)) : [];
  const t = $('#posT');
  if (!ps.length) { t.innerHTML = '<div class="empty">No open positions.</div>'; return; }
  t.innerHTML = '<div class="r h"><span>Market</span><span>Side</span><span>Size</span><span>Entry</span><span>Liq.</span><span>PnL</span><span></span></div>' + ps.map(p => {
    const long = Number(p.szi) > 0, pnl = Number(p.unrealizedPnl);
    return `<div class="r"><b>${p.coin}</b><span class="${long ? 'L' : 'S'}">${long ? 'LONG' : 'SHORT'} ${p.leverage ? p.leverage.value + 'x' : ''}</span><span>${Math.abs(p.szi)}</span><span>${fmt(p.entryPx, p.entryPx < 10 ? 4 : 2)}</span><span>${p.liquidationPx ? fmt(p.liquidationPx, p.liquidationPx < 10 ? 4 : 2) : '—'}</span><span class="${pnl >= 0 ? 'up' : 'dn'}">${pnl >= 0 ? '+' : ''}${fmt(pnl)}</span><button class="b sm" data-close="${p.coin}" data-szi="${p.szi}" type="button">Close</button></div>`;
  }).join('');
  $$('[data-close]', t).forEach(b => b.onclick = async () => {
    const m = MK.find(x => x.name === b.dataset.close); const szi = Number(b.dataset.szi); if (!m || !acct()) return;
    b.disabled = true; b.textContent = '…';
    try { const st = await H.marketOrder(acct().key, m, szi < 0, Math.abs(szi), true); toast(st && st.filled ? `Closed at ${st.filled.avgPx}` : 'Close sent'); }
    catch (e) { toast(e.message, 5000); }
    refresh();
  });
}
setInterval(() => { const r = $('#terminal').getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && !document.hidden) refresh(); }, 12000);

/* ---------- markets + order ticket ---------- */
let side = 1;
async function loadMarkets() {
  try {
    MK = await H.meta();
    MK.sort((a, b) => Number(b.ctx && b.ctx.dayNtlVlm || 0) - Number(a.ctx && a.ctx.dayNtlVlm || 0));
    $('#tMkt').innerHTML = MK.map(m => `<option value="${m.name}">${m.name}-PERP · ${m.maxLeverage}x</option>`).join('');
    $('#tMkt').value = MK.some(m => m.name === 'BTC') ? 'BTC' : MK[0].name; onMkt();
  } catch (e) { $('#tMkt').innerHTML = '<option>Markets offline</option>'; status('#tStatus', 'Hyperliquid did not answer. Try again in a moment.', 'err'); }
}
const mkt = () => MK.find(m => m.name === $('#tMkt').value);
function onMkt() {
  const m = mkt(); if (!m) return;
  const px = Number(mid[m.name] || (m.ctx && m.ctx.markPx) || 0); $('#tMark').textContent = px ? fmt(px, px < 10 ? 4 : 2) : '—';
  const r = $('#tLev'); r.max = m.maxLeverage; if (+r.value > m.maxLeverage) r.value = m.maxLeverage; onLev();
}
function onLev() { $('#tLevV').textContent = $('#tLev').value + 'x'; const s = parseFloat($('#tSize').value); $('#tMargin').textContent = s > 0 ? usd(s / +$('#tLev').value) : '—'; }
$('#tMkt').onchange = onMkt; $('#tLev').oninput = onLev; $('#tSize').oninput = onLev;
function setSide(s) { side = s; $('#tLong').classList.toggle('on', s > 0); $('#tShort').classList.toggle('on', s < 0); $('#tGo').textContent = s > 0 ? 'Open long' : 'Open short'; }
$('#tLong').onclick = () => setSide(1); $('#tShort').onclick = () => setSide(-1);
setInterval(async () => { const r = $('#terminal').getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && MK.length && !document.hidden) { try { mid = await H.mids(); onMkt(); } catch (e) { } } }, 8000);
$('#tGo').onclick = async () => {
  const a = acct(), m = mkt(), size = parseFloat($('#tSize').value), lev = +$('#tLev').value;
  if (!a) return status('#tStatus', 'Make a fresh account first.', 'err');
  if (!m) return status('#tStatus', 'Markets are still loading.', 'err');
  if (!(size >= 10)) return status('#tStatus', 'Hyperliquid’s smallest order is $10.', 'err');
  const b = $('#tGo'); b.disabled = true;
  try {
    status('#tStatus', 'Setting leverage…'); await H.setLeverage(a.key, m.asset, lev, !m.onlyIsolated);
    status('#tStatus', 'Signing the order in your browser…');
    const px = Number((await H.mids())[m.name]); const st = await H.marketOrder(a.key, m, side > 0, size / px);
    if (st && st.filled) status('#tStatus', `Filled ${st.filled.totalSz} ${m.name} at ${st.filled.avgPx}.`, 'ok');
    else if (st && st.resting) status('#tStatus', `Order resting (#${st.resting.oid}).`, 'ok');
    else status('#tStatus', 'Order sent.', 'ok');
    refresh();
  } catch (e) { status('#tStatus', e.message || 'Order failed', 'err'); }
  b.disabled = false;
};

/* ---------- the private route ---------- */
const WS = { list: [], w: null, acct: null };
function addWallet(w) { try { if (!w || !w.name || !w.features || !w.features['standard:connect']) return; if (!(w.chains || []).some(c => String(c).startsWith('solana:'))) return; if (!w.features['solana:signAndSendTransaction'] && !w.features['solana:signTransaction']) return; if (WS.list.some(x => x.name === w.name)) return; WS.list.push(w); if (!$('#wModal').hidden) pick(); } catch (e) { } }
addEventListener('wallet-standard:register-wallet', e => { try { e.detail({ register: addWallet }); } catch (x) { } });
try { dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register: addWallet } })); } catch (e) { }
function pick() {
  const p = $('#wPick');
  p.innerHTML = WS.list.length ? WS.list.map((w, i) => `<button type="button" data-i="${i}">${w.icon ? `<img src="${w.icon}" alt="">` : ''}${w.name}</button>`).join('') : '<p class="note">No Solana wallet found in this browser. Install Phantom, Solflare or Backpack, or copy the deposit address and pay it from anywhere.</p>';
  $$('button', p).forEach(b => b.onclick = async () => {
    const w = WS.list[+b.dataset.i];
    try { const r = await w.features['standard:connect'].connect(); const a = (r && r.accounts && r.accounts[0]) || w.accounts[0]; if (!a) throw new Error('no account'); WS.w = w; WS.acct = a; $('#wModal').hidden = true; $('#fWallet').textContent = short(a.address); $('#fConnect').textContent = 'Connected · ' + w.name; }
    catch (e) { toast(e.message || 'connect failed'); }
  });
}
$('#fConnect').onclick = () => { pick(); $('#wModal').hidden = false; };
$('#wClose').onclick = () => { $('#wModal').hidden = true; };
$('#wModal').onclick = e => { if (e.target.id === 'wModal') $('#wModal').hidden = true; };
let Q = null, poll = null;
$('#fQuote').onclick = async () => {
  const a = acct(), amt = parseFloat($('#fAmt').value);
  if (!a) return status('#fStatus', 'Make a fresh account first. The USDC lands there.', 'err');
  if (!WS.acct) return status('#fStatus', 'Connect the Solana wallet that pays. Refunds go back to it.', 'err');
  if (!(amt >= 0.01)) return status('#fStatus', 'The smallest route is 0.01 SOL.', 'err');
  const b = $('#fQuote'); b.disabled = true; status('#fStatus', 'Asking NEAR Intents for a quote…');
  try {
    const j = await api('route', { lamports: Math.floor(amt * 1e9), recipient: a.address, refundTo: WS.acct.address });
    const q = j.quote || {}; if (!q.depositAddress) throw new Error('no deposit address in the quote');
    Q = { dep: q.depositAddress, lamports: Math.floor(amt * 1e9) };
    $('#fOut').textContent = (q.amountOutFormatted ? fmt(q.amountOutFormatted, 2) : '—') + ' USDC';
    $('#fEta').textContent = q.timeEstimate ? '~' + q.timeEstimate + ' s' : '—';
    $('#fDep').textContent = q.depositAddress; $('#fQ').hidden = false;
    status('#fStatus', 'Quote ready. Send the SOL to the one-time address.', 'ok');
  } catch (e) { status('#fStatus', e.message, 'err'); }
  b.disabled = false;
};
$('#fCopyDep').onclick = () => { if (Q) { navigator.clipboard.writeText(Q.dep); toast('Deposit address copied. Send exactly the quoted SOL.'); watch(); } };
$('#fSend').onclick = async () => {
  if (!Q || !WS.w) return;
  const b = $('#fSend'); b.disabled = true;
  try {
    status('#fStatus', 'Confirm the transfer in your wallet…');
    const bh = (await S.rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value.blockhash;
    const wire = S.wireUnsigned(S.transferMessage(WS.acct.address, Q.dep, Q.lamports, bh));
    const f = WS.w.features; let sig;
    if (f['solana:signAndSendTransaction']) { const [r] = await f['solana:signAndSendTransaction'].signAndSendTransaction({ transaction: wire, account: WS.acct, chain: 'solana:mainnet' }); sig = S.b58e(r.signature); }
    else { const [r] = await f['solana:signTransaction'].signTransaction({ transaction: wire, account: WS.acct, chain: 'solana:mainnet' }); sig = await S.rpc('sendTransaction', [S.toB64(r.signedTransaction), { encoding: 'base64' }]); }
    status('#fStatus', `Sent. <a href="https://solscan.io/tx/${sig}" target="_blank" rel="noopener">View on Solscan</a>. Waiting for the route…`);
    api('route', { op: 'submit', txHash: sig, depositAddress: Q.dep }).catch(() => { });
    watch();
  } catch (e) { status('#fStatus', e.message || 'Transfer cancelled', 'err'); }
  b.disabled = false;
};
function watch() {
  clearInterval(poll); const dep = Q.dep; let n = 0;
  poll = setInterval(async () => {
    if (++n > 160) return clearInterval(poll);
    try {
      const j = await fetch('/api/route?deposit=' + encodeURIComponent(dep)).then(r => r.json());
      const s = j.status || 'PENDING_DEPOSIT';
      const map = { PENDING_DEPOSIT: 'Waiting for your SOL to land…', KNOWN_DEPOSIT_TX: 'Deposit seen. Routing…', PROCESSING: 'A solver is paying out…', SUCCESS: 'Arrived in your trading balance.', REFUNDED: 'The route could not complete. Your SOL was refunded.', FAILED: 'The route failed. NEAR Intents will refund it.', INCOMPLETE_DEPOSIT: 'Less SOL arrived than quoted. It will be refunded.' };
      status('#fStatus', map[s] || s, s === 'SUCCESS' ? 'ok' : (['REFUNDED', 'FAILED', 'INCOMPLETE_DEPOSIT'].includes(s) ? 'err' : ''));
      if (['SUCCESS', 'REFUNDED', 'FAILED'].includes(s)) { clearInterval(poll); refresh(); if (s === 'SUCCESS') toast('USDC arrived. You can trade.'); }
    } catch (e) { }
  }, 5000);
}

/* ---------- withdraw ---------- */
$('#wGo').onclick = async () => {
  const a = acct(), dest = $('#wDest').value.trim(), amt = parseFloat($('#wAmt').value);
  if (!a) return status('#wStatus', 'No account selected.', 'err');
  if (!H.isEvm(dest)) return status('#wStatus', 'Enter an Arbitrum address (0x…).', 'err');
  if (!(amt > 1)) return status('#wStatus', 'Withdraw more than $1 so the fee leaves something.', 'err');
  const b = $('#wGo'); b.disabled = true; status('#wStatus', 'Signing the withdrawal in your browser…');
  try { await H.withdraw(a.key, dest, amt); status('#wStatus', 'Withdrawal accepted. It reaches Arbitrum in a few minutes.', 'ok'); refresh(); }
  catch (e) { status('#wStatus', e.message, 'err'); }
  b.disabled = false;
};

renderAccts(); loadMarkets(); setSide(1);

/* ===== v2: motion ===== */
// words rise out of a mask
$$('h2, .hero-h').forEach(el => { const ws = el.textContent.trim().split(/\s+/); el.innerHTML = ws.map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(' '); });
// text that decodes into place
const GLY = '01x░▒/\\<>_-=+*#';
function scramble(el, text, ms = 800) {
  const t0 = performance.now();
  (function step() {
    const k = Math.min(1, (performance.now() - t0) / ms), n = Math.floor(k * text.length);
    el.textContent = text.slice(0, n) + [...text.slice(n)].map(c => c === ' ' ? ' ' : GLY[Math.random() * GLY.length | 0]).join('');
    if (k < 1) requestAnimationFrame(step);
  })();
}
const io2 = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; io2.unobserve(e.target); const t = e.target;
  if (t.classList.contains('eb')) scramble(t, t.dataset.t || t.textContent, 700);
  if (t.id === 'graph2') setTimeout(() => scramble($('#ownerTxt'), 'owner: unknown', 900), 1300);
  if (t.classList.contains('vs')) { t.classList.add('vis'); $$('.vr b.w', t).forEach((b, i) => setTimeout(() => scramble(b, b.dataset.t || b.textContent, 700), 500 + i * 160)); }
}), { threshold: 0.35 });
$$('.eb, .vs b.w').forEach(e => e.dataset.t = e.textContent);
$$('.eb').forEach(e => io2.observe(e));
// scroll progress + the pinned steps
const how = $('#how'), lis = $$('#slist li'), imgs = $$('#stage img');
let stepNow = -1;
function setStep(n) {
  if (n === stepNow) return; stepNow = n;
  lis.forEach((l, i) => l.classList.toggle('on', i === n));
  imgs.forEach((im, i) => { im.classList.toggle('on', i === n); im.classList.toggle('past', i < n); });
}
const wide = () => innerWidth > 980;
function onScroll2() {
  const max = document.documentElement.scrollHeight - innerHeight; $('#prog').style.width = (max > 0 ? scrollY / max * 100 : 0) + '%';
  if (wide() && how) {
    const k = Math.max(0, Math.min(1, (scrollY - how.offsetTop) / (how.offsetHeight - innerHeight)));
    setStep(Math.min(3, Math.floor(k * 4.0001))); $('#sbarI').style.width = (k * 100) + '%';
  }
}
addEventListener('scroll', onScroll2, { passive: true }); addEventListener('resize', onScroll2); onScroll2(); setStep(0);
setInterval(() => { if (!wide()) setStep((stepNow + 1) % 4); }, 3200);
// cursor spotlight + magnetic buttons
addEventListener('pointermove', e => {
  const t = e.target.closest && e.target.closest('.panel, .fn, .facts li, .checks li, .faq details, .vs'); if (!t) return;
  const r = t.getBoundingClientRect(); t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });
if (matchMedia('(hover: hover)').matches && !reduce) $$('.btn').forEach(b => {
  b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.2}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`; });
  b.addEventListener('pointerleave', () => { b.style.transform = ''; });
});
// film grain, drawn once
try {
  const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'); const d = x.createImageData(160, 160);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); $('#grain').style.backgroundImage = `url(${c.toDataURL()})`;
} catch (e) { }
// live Hyperliquid prices, honest: if the feed is down the band stays hidden
async function ticker() {
  try {
    const [m, ctx] = await H.info({ type: 'metaAndAssetCtxs' });
    const rows = m.universe.map((u, i) => ({ n: u.name, c: ctx[i], d: u.isDelisted })).filter(r => !r.d && r.c && Number(r.c.markPx) > 0)
      .sort((a, b) => Number(b.c.dayNtlVlm) - Number(a.c.dayNtlVlm)).slice(0, 18);
    if (!rows.length) return;
    const one = rows.map(r => { const px = Number(r.c.markPx), prev = Number(r.c.prevDayPx), ch = prev ? (px / prev - 1) * 100 : 0;
      return `<span class="tk"><b>${r.n}</b><span>${fmt(px, px < 1 ? 5 : px < 100 ? 3 : 1)}</span><em class="${ch >= 0 ? 'up' : 'dn'}">${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%</em></span>`; }).join('');
    $('#tkTrack').innerHTML = one + one; $('#ticker').hidden = false;
  } catch (e) { }
}
ticker(); setInterval(() => { if (!document.hidden) ticker(); }, 20000);

/* ===== v3: the journey ===== */
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const maxY = () => document.documentElement.scrollHeight - innerHeight;
// weighted scrolling on wheels (touch stays native)
const SM = { y: scrollY, t: scrollY, on: false };
function sstep() {
  const d = SM.t - SM.y;
  if (Math.abs(d) < 0.4) { SM.y = SM.t; scrollTo(0, SM.t); SM.on = false; return; }
  SM.y += d * 0.085; scrollTo(0, SM.y); requestAnimationFrame(sstep);
}
function glide(to) { SM.t = clamp(to, 0, maxY()); if (!SM.on) { SM.y = scrollY; SM.on = true; requestAnimationFrame(sstep); } }
if (fine) addEventListener('wheel', e => {
  if (e.ctrlKey || document.body.classList.contains('lock') || !$('#wModal').hidden) return;
  if (e.target.closest && e.target.closest('select, textarea, .ptable')) return;
  e.preventDefault(); glide((SM.on ? SM.t : scrollY) + e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1));
}, { passive: false });
addEventListener('keydown', () => { SM.on = false; });
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href'); const el = id.length > 1 && $(id); if (!el) return;
  e.preventDefault(); glide(el.getBoundingClientRect().top + scrollY - (id === '#terminal' ? 20 : 0)); history.replaceState(null, '', id);
}));
// paragraphs light up word by word as you read
$$('.lead, .big').forEach(el => { el.innerHTML = el.textContent.trim().split(/\s+/).map(w => `<span class="lw">${w}</span>`).join(' '); });
const scrubText = $$('.lead, .big').map(el => ({ el, ws: $$('.lw', el), n: -1 }));
// the kinetic rows
const K1 = 'They can’t hunt what they can’t see.', K2 = 'No name · No link · No trace ·';
$('#kin1').innerHTML = Array(6).fill(`<span>${K1}</span>`).join(''); $('#kin2').innerHTML = Array(8).fill(`<span>${K2}</span>`).join('');
let kx1 = 0, kx2 = 0, kdir = 1;
// graphs
const g1 = $('#graph1'), g2 = $('#graph2'); g1.classList.add('scrub'); g2.classList.add('scrub');
const g1e = $$('.edges .e', g1), g1n = $$('.nodes > *', g1);
g1e.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p._L = L; });
const g2e = $$(':scope > path.e:not(.dash)', g2.querySelector('svg')); g2e.forEach(p => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p._L = L; });
let ownerDone = false;
const rows = $$('#see .vr'); rows.forEach(r => r._done = false);
// cursor
const curEl = $('#cur'); let ccx = -100, ccy = -100, ctx2 = -100, cty2 = -100;
if (fine) {
  addEventListener('pointermove', e => { ctx2 = e.clientX; cty2 = e.clientY; curEl.classList.add('on'); curEl.classList.toggle('big', !!(e.target.closest && e.target.closest('a, button, summary, select, input, label'))); }, { passive: true });
  document.addEventListener('pointerleave', () => curEl.classList.remove('on'));
}
const heroIn = $('.hero-in'); setTimeout(() => heroIn.classList.add('live'), 2600);
const prog = (el, a = 0.85, span = 0.6) => { const r = el.getBoundingClientRect(); return clamp((innerHeight * a - r.top) / (r.height * span + innerHeight * 0.2)); };
let lastY = scrollY, vS = 0, skew = 0;
(function loop() {
  requestAnimationFrame(loop);
  const y = scrollY, v = y - lastY; lastY = y; vS += (v - vS) * 0.2;
  if (scene && scene.setVel) scene.setVel(vS);
  // skew with speed, settle back
  const sk = fine ? clamp(vS * 0.035, -2.2, 2.2) : 0; skew += (sk - skew) * 0.12;
  document.documentElement.style.setProperty('--skew', skew.toFixed(3) + 'deg');
  // hero drifts away as you leave it
  if (introDone && heroIn.classList.contains('live')) { const p = clamp(y / (innerHeight * 0.85)); heroIn.style.transform = `translateY(${-p * 110}px) scale(${1 - p * 0.1})`; heroIn.style.opacity = String(1 - p * 1.2); }
  // word light-up
  for (const s of scrubText) {
    const r = s.el.getBoundingClientRect(); if (r.bottom < -50 || r.top > innerHeight + 50) continue;
    const big = s.el.classList.contains('big'), p = clamp((innerHeight * (big ? 0.78 : 0.9) - r.top) / (big ? innerHeight * 0.55 : r.height + innerHeight * 0.3));
    const n = Math.round(p * s.ws.length); if (n !== s.n) { s.ws.forEach((w, i) => w.classList.toggle('on', i < n)); s.n = n; }
  }
  // problem graph draws itself, then the tracker goes live
  { const p = prog($('#problem'), 0.75, 0.5);
    g1e.forEach((e, i) => { const k = clamp((p - i * 0.07) / 0.35); e.style.strokeDashoffset = e._L * (1 - k); });
    g1n.forEach((n, i) => n.classList.toggle('hide', p < 0.12 + (i % 10) * 0.045));
    g1.classList.toggle('live', p > 0.82); }
  // break graph: the line runs, gets cut, the owner disappears
  { const p = prog($('#break'), 0.75, 0.5);
    g2e.forEach(e => { e.style.strokeDashoffset = e._L * (1 - clamp(p / 0.4)); });
    g2.classList.toggle('cut-on', p > 0.5);
    if (p > 0.62 && !ownerDone) { ownerDone = true; scramble($('#ownerTxt'), 'owner: unknown', 900); }
    if (p < 0.3 && ownerDone) { ownerDone = false; $('#ownerTxt').textContent = 'owner: you'; } }
  // the comparison flips row by row
  { const sec = $('#see'), r = sec.getBoundingClientRect();
    const p = innerWidth > 980 ? clamp(-r.top / (r.height - innerHeight)) : clamp((innerHeight * 0.7 - r.top) / (r.height));
    rows.forEach((row, i) => { const on = p > 0.1 + i * 0.15; if (on !== row.classList.contains('flip')) { row.classList.toggle('flip', on); const b = $('b.w', row); if (on) scramble(b, b.dataset.t || b.textContent, 600); } }); }
  // kinetic type runs with your scroll
  if (Math.abs(v) > 0.5) kdir = v > 0 ? 1 : -1;
  const sp = 0.7 + Math.min(14, Math.abs(vS) * 0.35);
  kx1 -= sp * kdir; kx2 += sp * kdir;
  const w1 = $('#kin1').scrollWidth / 6, w2 = $('#kin2').scrollWidth / 8;
  if (w1) $('#kin1').style.transform = `translateX(${((kx1 % w1) - w1)}px)`;
  if (w2) $('#kin2').style.transform = `translateX(${((kx2 % w2) - w2 * 2)}px)`;
  // cursor ring
  if (fine) { ccx += (ctx2 - ccx) * 0.18; ccy += (cty2 - ccy) * 0.18; curEl.style.transform = `translate(${ccx}px, ${ccy}px)`; }
})();
