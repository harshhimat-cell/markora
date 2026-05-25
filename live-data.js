// Markora — Live Data Engine v2
const WORKER = 'https://markora-api.harshhimat.workers.dev';

const State = {
  activeTab: 'equities', feedFilter: 'all', articles: [], cache: {},
  savedArticles: JSON.parse(localStorage.getItem('markora_saved') || '[]'),
};

async function api(path, ttl = 60) {
  const now = Date.now();
  if (State.cache[path] && now - State.cache[path].ts < ttl * 1000) return State.cache[path].data;
  try {
    const res = await fetch(WORKER + path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    State.cache[path] = { data, ts: now };
    return data;
  } catch(e) { console.warn('API error:', path, e.message); return null; }
}

function fmt(val, decimals = 2, prefix = '') {
  if (val === null || val === undefined || val === 0) return '—';
  if (typeof val === 'number') {
    if (val >= 1e12) return prefix + (val / 1e12).toFixed(2) + 'T';
    if (val >= 1e9)  return prefix + (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6)  return prefix + (val / 1e6).toFixed(2) + 'M';
    return prefix + val.toLocaleString('en-IN', { maximumFractionDigits: decimals });
  }
  return String(val);
}

function chg(pct) {
  if (pct === null || pct === undefined) return '<span class="flat">—</span>';
  const p = parseFloat(pct);
  const cls = p > 0.01 ? 'up' : p < -0.01 ? 'down' : 'flat';
  const arrow = p > 0.01 ? '▲' : p < -0.01 ? '▼' : '—';
  return `<span class="${cls}">${arrow}${Math.abs(p).toFixed(2)}%</span>`;
}

function price(val, symbol = '') {
  if (!val) return '—';
  if (val >= 1000) return symbol + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (val >= 1)    return symbol + val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return symbol + val.toFixed(4);
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  return Math.floor(h / 24) + 'd ago';
}

function tagCls(cat) {
  return { markets:'tag-green', crypto:'tag-amber', policy:'tag-blue', global:'tag-blue', finance:'tag-green', learn:'tag-purple' }[cat] || 'tag-gray';
}

function setLoading(panelId, msg = 'Fetching live data...') {
  const ticker = document.querySelector(`#${panelId} .ticker-bar`);
  if (ticker) ticker.innerHTML = `<div class="ticker-item"><div class="ticker-name" style="color:var(--accent)">${msg}</div></div>`;
}

async function renderCrypto() {
  setLoading('panel-crypto', 'Loading live crypto...');
  const [coins, global, fg] = await Promise.all([api('/crypto', 30), api('/crypto/global', 60), api('/fear-greed', 300)]);
  if (!coins || !Array.isArray(coins)) return;
  const panel = document.getElementById('panel-crypto');
  panel.querySelector('.ticker-bar').innerHTML = coins.slice(0, 5).map(c =>
    `<div class="ticker-item"><div class="ticker-name">${c.symbol}</div><div class="ticker-val">${price(c.price, '$')}</div><div class="ticker-chg">${chg(c.change24h)}</div></div>`
  ).join('');
  const grid = panel.querySelector('.mkt-grid');
  if (grid) grid.innerHTML = coins.map(c =>
    `<div class="mkt-card"><div class="mkt-name">${c.name}</div><div class="mkt-val">${price(c.price, '$')}</div><div class="mkt-chg">${chg(c.change24h)}</div></div>`
  ).join('');
  const ai = panel.querySelector('.ai-txt');
  if (ai && global) {
    const fgVal = fg?.value ? ` Fear & Greed: ${fg.value} (${fg.value_classification}).` : '';
    ai.textContent = `Total crypto market: ${fmt(global.totalMarketCap, 2, '$')}. 24h change: ${global.marketCapChange24h?.toFixed(2) || '—'}%. BTC dominance: ${global.btcDominance?.toFixed(1) || '—'}%.${fgVal}`;
  }
  panel.querySelector('.update-time') && (panel.querySelector('.update-time').textContent = 'updated ' + new Date().toLocaleTimeString('en-IN'));
}

async function renderEquities() {
  setLoading('panel-equities', 'Loading NSE data...');
  const data = await api('/equities', 60);
  if (!data || !data.indices) return;
  const panel = document.getElementById('panel-equities');
  const indices = data.indices;
  const key = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY MIDCAP 100', 'NIFTY SMALLCAP 100', 'India VIX'];
  panel.querySelector('.ticker-bar').innerHTML = indices.filter(i => key.includes(i.name)).map(i =>
    `<div class="ticker-item"><div class="ticker-name">${i.name.replace('NIFTY ', '')}</div><div class="ticker-val">${i.last?.toLocaleString('en-IN') || '—'}</div><div class="ticker-chg">${chg(i.changePct)}</div></div>`
  ).join('');
  const sectoral = indices.filter(i => !['NIFTY 50','NIFTY BANK','NIFTY MIDCAP 100','NIFTY SMALLCAP 100','India VIX'].includes(i.name));
  const heatmap = panel.querySelector('.heatmap');
  if (heatmap && sectoral.length) {
    heatmap.innerHTML = sectoral.map(i => {
      const p = i.changePct || 0;
      const cls = p > 1.5 ? 'h-up3' : p > 0.5 ? 'h-up2' : p > 0 ? 'h-up1' : p < -1.5 ? 'h-dn3' : p < -0.5 ? 'h-dn2' : p < 0 ? 'h-dn1' : 'h-flat';
      return `<div class="heat-cell ${cls}"><div class="heat-name">${i.name.replace('NIFTY ','').replace(' 100','')}</div><div class="heat-val">${p > 0 ? '+' : ''}${p.toFixed(2)}%</div></div>`;
    }).join('');
  }
  const sorted = [...indices].sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0));
  const rowLists = panel.querySelectorAll('.row-list');
  if (rowLists[0]) rowLists[0].innerHTML = sorted.slice(0, 5).map(i =>
    `<div class="row-item"><div class="row-left"><div class="row-name">${i.name}</div><div class="row-sub">H: ${i.high?.toLocaleString('en-IN') || '—'} · L: ${i.low?.toLocaleString('en-IN') || '—'}</div></div><div class="row-right"><div class="row-val">${i.last?.toLocaleString('en-IN') || '—'}</div><div class="row-chg">${chg(i.changePct)}</div></div></div>`
  ).join('');
  const nifty = indices.find(i => i.name === 'NIFTY 50');
  const vix = indices.find(i => i.name === 'India VIX');
  const ai = panel.querySelector('.ai-txt');
  if (ai && nifty) {
    const vixNote = vix ? ` VIX at ${vix.last?.toFixed(2)} — market ${vix.last < 15 ? 'calm' : vix.last < 20 ? 'moderate volatility' : 'elevated volatility'}.` : '';
    ai.textContent = `Nifty ${nifty.changePct > 0 ? 'up' : 'down'} ${Math.abs(nifty.changePct || 0).toFixed(2)}% at ${nifty.last?.toLocaleString('en-IN')}. Sentiment ${nifty.changePct > 0 ? 'positive' : 'cautious'}.${vixNote} Live NSE data.`;
  }
  panel.querySelector('.update-time') && (panel.querySelector('.update-time').textContent = 'updated ' + new Date().toLocaleTimeString('en-IN'));
}

async function renderForex() {
  const data = await api('/forex', 300);
  if (!data || !data.pairs) return;
  const panel = document.getElementById('panel-forex');
  const inr = data.pairs.filter(p => p.group === 'inr');
  const major = data.pairs.filter(p => p.group === 'major');
  panel.querySelector('.ticker-bar').innerHTML = inr.slice(0, 4).map(p =>
    `<div class="ticker-item"><div class="ticker-name">${p.pair}</div><div class="ticker-val">${p.rate.toFixed(2)}</div></div>`
  ).join('');
  const lists = panel.querySelectorAll('.row-list');
  if (lists[0]) lists[0].innerHTML = inr.map(p => `<div class="row-item"><div class="row-left"><div class="row-name">${p.pair}</div></div><div class="row-right"><div class="row-val">${p.rate.toFixed(2)}</div></div></div>`).join('');
  if (lists[1]) lists[1].innerHTML = major.map(p => `<div class="row-item"><div class="row-left"><div class="row-name">${p.pair}</div></div><div class="row-right"><div class="row-val">${p.rate.toFixed(4)}</div></div></div>`).join('');
  const usdInr = inr.find(p => p.pair === 'USD/INR');
  const ai = panel.querySelector('.ai-txt');
  if (ai && usdInr) ai.textContent = `USD/INR at ${usdInr.rate.toFixed(2)}. Live rates via ExchangeRate API.`;
}

async function renderCommodities() {
  const data = await api('/commodities', 300);
  if (!data || !Array.isArray(data)) return;
  const panel = document.getElementById('panel-commodities');
  panel.querySelector('.ticker-bar').innerHTML = data.slice(0, 5).map(c =>
    `<div class="ticker-item"><div class="ticker-name">${c.symbol}</div><div class="ticker-val">$${c.usd.toLocaleString()}</div><div class="ticker-chg">${chg(c.change24h)}</div></div>`
  ).join('');
  const grid = panel.querySelector('.mkt-grid');
  if (grid) grid.innerHTML = data.map(c =>
    `<div class="mkt-card"><div class="mkt-name">${c.name}</div><div class="mkt-val">$${c.usd.toLocaleString()}</div><div class="mkt-chg">${chg(c.change24h)}</div></div>`
  ).join('') + data.filter(c => ['GOLD','SILVER'].includes(c.symbol)).map(c =>
    `<div class="mkt-card"><div class="mkt-name">MCX ${c.symbol} ₹</div><div class="mkt-val">₹${Math.round(c.inr).toLocaleString('en-IN')}</div><div class="mkt-chg">${chg(c.change24h)}</div></div>`
  ).join('');
  const gold = data.find(c => c.symbol === 'GOLD');
  const oil = data.find(c => c.symbol === 'BRENT');
  const ai = panel.querySelector('.ai-txt');
  if (ai && gold) ai.textContent = `Gold at $${gold.usd.toLocaleString()} (₹${Math.round(gold.inr).toLocaleString('en-IN')}/oz). Brent crude at $${oil?.usd || '—'}/bbl. INR conversion live.`;
}

async function renderNews(cat) {
  const path = cat && cat !== 'all' ? `/news?cat=${cat}` : '/news';
  const data = await api(path, 300);
  if (!data || !data.articles) return;
  State.articles = data.articles;
  let feed = document.querySelector('.feed-cards');
  if (!feed) {
    feed = document.createElement('div');
    feed.className = 'feed-cards';
    const fh = document.querySelector('.feed-header');
    if (fh) { const parent = fh.parentNode; [...parent.querySelectorAll('.card')].forEach(c => feed.appendChild(c)); parent.appendChild(feed); }
  }
  if (!data.articles.length) { feed.innerHTML = '<div style="padding:2rem 1rem;color:var(--text3);font-size:13px;">Loading articles...</div>'; return; }
  feed.innerHTML = data.articles.map(a => {
    const saved = State.savedArticles.includes(a.id);
    return `<div class="card ${a.isBreaking ? 'breaking-card' : ''}">
      ${a.isBreaking ? `<div class="breaking-lbl"><i class="ti ti-bolt" style="font-size:12px"></i>breaking · ${timeAgo(a.publishedAt)}</div>` : ''}
      <div class="card-meta"><span class="tag ${tagCls(a.category)}">${a.category}</span><span class="card-time">${a.source} · ${timeAgo(a.publishedAt)}</span></div>
      <div class="card-title">${a.title}</div>
      ${a.description ? `<div class="card-body">${a.description}...</div>` : ''}
      <div class="card-footer">
        <div class="card-actions">
          <button class="action-btn" onclick="toggleSave('${a.id}',this)"><i class="ti ti-bookmark"></i> ${saved ? 'saved' : 'save'}</button>
          <button class="action-btn" onclick="window.open('${a.url}','_blank')"><i class="ti ti-external-link"></i> source</button>
        </div>
        <span class="read-more" onclick="window.open('${a.url}','_blank')">read →</span>
      </div>
    </div>`;
  }).join('');
}

function toggleSave(id, btn) {
  const idx = State.savedArticles.indexOf(id);
  if (idx === -1) { State.savedArticles.push(id); btn.innerHTML = '<i class="ti ti-bookmark"></i> saved'; }
  else { State.savedArticles.splice(idx, 1); btn.innerHTML = '<i class="ti ti-bookmark"></i> save'; }
  localStorage.setItem('markora_saved', JSON.stringify(State.savedArticles));
}

function initSearch() {
  const input = document.querySelector('.search-box input');
  if (!input) return;
  let t;
  input.addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = e.target.value.toLowerCase().trim();
      if (!q || q.length < 2) { renderNews(); return; }
      const results = State.articles.filter(a => a.title.toLowerCase().includes(q) || (a.description||'').toLowerCase().includes(q));
      const feed = document.querySelector('.feed-cards');
      if (!feed) return;
      feed.innerHTML = results.length
        ? results.map(a => `<div class="card"><div class="card-meta"><span class="tag ${tagCls(a.category)}">${a.category}</span><span class="card-time">${a.source}</span></div><div class="card-title">${a.title}</div><div class="card-footer"><div class="card-actions"></div><span class="read-more" onclick="window.open('${a.url}','_blank')">read →</span></div></div>`).join('')
        : `<div style="padding:2rem 1rem;color:var(--text3);font-size:13px;">No results for "${q}"</div>`;
    }, 350);
  });
}

function initTabs() {
  document.querySelectorAll('.mtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.dataset.tab;
      const panel = document.getElementById('panel-' + name);
      if (panel) panel.classList.add('active');
      State.activeTab = name;
      loadTab(name);
    });
  });
}

function loadTab(name) {
  if (name === 'crypto') renderCrypto();
  if (name === 'equities') renderEquities();
  if (name === 'forex') renderForex();
  if (name === 'commodities') renderCommodities();
}

function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.textContent.toLowerCase().trim();
      State.feedFilter = cat;
      renderNews(cat === 'all' ? null : cat);
    });
  });
}

async function updateWatchlistPrices() {
  const [crypto, forex] = await Promise.all([api('/crypto', 30), api('/forex', 300)]);
  if (!crypto || !Array.isArray(crypto)) return;
  const map = {};
  crypto.forEach(c => { map[c.symbol] = c; });
  document.querySelectorAll('.watch-item').forEach(item => {
    const nameEl = item.querySelector('.watch-name');
    if (!nameEl) return;
    const sym = nameEl.textContent.trim().split('/')[0];
    const coin = map[sym];
    if (coin) {
      const valEl = item.querySelector('.watch-val');
      const chgEl = item.querySelector('.watch-chg');
      if (valEl) valEl.textContent = price(coin.price, '$');
      if (chgEl) chgEl.innerHTML = chg(coin.change24h);
    }
  });
  if (forex) {
    const usdInr = forex.pairs?.find(p => p.pair === 'USD/INR');
    if (usdInr) document.querySelectorAll('.watch-item').forEach(item => {
      if (item.querySelector('.watch-name')?.textContent.includes('USD/INR')) {
        const valEl = item.querySelector('.watch-val');
        if (valEl) valEl.textContent = usdInr.rate.toFixed(2);
      }
    });
  }
}

async function initMarkora() {
  initTabs(); initFilters(); initSearch();
  await Promise.all([renderEquities(), renderCrypto(), renderForex(), renderCommodities(), renderNews()]);
  await updateWatchlistPrices();
  setInterval(renderCrypto, 30000);
  setInterval(renderEquities, 60000);
  setInterval(renderForex, 300000);
  setInterval(renderNews, 300000);
  setInterval(updateWatchlistPrices, 30000);
}

document.addEventListener('DOMContentLoaded', initMarkora);
