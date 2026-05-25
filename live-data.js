// Markora — Live Data Engine
// All APIs used here are 100% free, no keys required
// CoinGecko (crypto), NSE India (equities), AMFI (MFs), RSS (news)

const CORS = 'https://corsproxy.io/?';

const API = {
  crypto:   url => `${CORS}${encodeURIComponent(url)}`,
  nse:      url => `${CORS}${encodeURIComponent(url)}`,
  rss:      url => `${CORS}${encodeURIComponent(url)}`,
};

// ── STATE ─────────────────────────────────────────────────────────
const State = {
  activeTab: 'equities',
  feedFilter: 'all',
  watchlist: JSON.parse(localStorage.getItem('markora_watchlist') || '[]'),
  savedArticles: JSON.parse(localStorage.getItem('markora_saved') || '[]'),
  articles: [],
  lastFetch: {},
};

// ── CRYPTO (CoinGecko — free, no key) ────────────────────────────
async function fetchCrypto() {
  try {
    const res = await fetch(
      API.crypto('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h')
    );
    const coins = await res.json();
    return coins.map(c => ({
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price: c.current_price,
      change: c.price_change_percentage_24h,
      mcap: c.market_cap,
      volume: c.total_volume,
      image: c.image,
    }));
  } catch(e) {
    return null;
  }
}

async function fetchCryptoGlobal() {
  try {
    const res = await fetch(API.crypto('https://api.coingecko.com/api/v3/global'));
    const data = (await res.json()).data;
    return {
      totalMcap: data.total_market_cap?.usd,
      mcapChange: data.market_cap_change_percentage_24h_usd,
      btcDominance: data.market_cap_percentage?.btc,
    };
  } catch(e) { return null; }
}

// ── FOREX (exchangerate.host — free, no key) ─────────────────────
async function fetchForex() {
  try {
    const res = await fetch(
      API.crypto('https://api.exchangerate-api.com/v4/latest/USD')
    );
    const data = await res.json();
    const rates = data.rates;
    return [
      { pair: 'USD/INR', from: 'USD', to: 'INR', rate: rates.INR },
      { pair: 'EUR/INR', from: 'EUR', to: 'INR', rate: (rates.INR / rates.EUR) },
      { pair: 'GBP/INR', from: 'GBP', to: 'INR', rate: (rates.INR / rates.GBP) },
      { pair: 'EUR/USD', from: 'EUR', to: 'USD', rate: (1 / rates.EUR) },
      { pair: 'GBP/USD', from: 'GBP', to: 'USD', rate: (1 / rates.GBP) },
      { pair: 'USD/JPY', from: 'USD', to: 'JPY', rate: rates.JPY },
      { pair: 'USD/SGD', from: 'USD', to: 'SGD', rate: rates.SGD },
      { pair: 'AUD/USD', from: 'AUD', to: 'USD', rate: (1 / rates.AUD) },
    ];
  } catch(e) { return null; }
}

// ── NEWS (RSS feeds — free) ───────────────────────────────────────
const RSS_FEEDS = [
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', source: 'Economic Times', cat: 'markets' },
  { url: 'https://www.moneycontrol.com/rss/MCtopnews.xml', source: 'Moneycontrol', cat: 'markets' },
  { url: 'https://feeds.reuters.com/reuters/businessNews', source: 'Reuters', cat: 'global' },
  { url: 'https://cointelegraph.com/rss', source: 'CoinTelegraph', cat: 'crypto' },
  { url: 'https://www.livemint.com/rss/money', source: 'Mint', cat: 'finance' },
];

async function fetchNews() {
  const all = [];
  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(API.rss(feed.url));
      const text = await res.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      const items = xml.querySelectorAll('item');
      items.forEach((item, i) => {
        if (i >= 5) return;
        const title = item.querySelector('title')?.textContent || '';
        const desc = item.querySelector('description')?.textContent?.replace(/<[^>]*>/g, '') || '';
        const link = item.querySelector('link')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const isBreaking = /breaking|just in|alert|rate|rbi|sebi|fed|gdp|crash/i.test(title);
        all.push({
          id: btoa(title).substring(0, 16),
          title,
          description: desc.substring(0, 200),
          url: link,
          source: feed.source,
          category: feed.cat,
          publishedAt: pubDate ? new Date(pubDate) : new Date(),
          isBreaking,
        });
      });
    } catch(e) {}
  }
  // Sort by date, newest first
  all.sort((a, b) => b.publishedAt - a.publishedAt);
  return all;
}

// ── RENDER HELPERS ────────────────────────────────────────────────
function fmt(val, decimals = 2) {
  if (val === null || val === undefined || val === 0) return '—';
  if (typeof val === 'number') {
    if (val > 1e9) return '$' + (val / 1e9).toFixed(1) + 'B';
    if (val > 1e6) return '$' + (val / 1e6).toFixed(1) + 'M';
    return val.toLocaleString('en-IN', { maximumFractionDigits: decimals });
  }
  return val;
}

function chg(pct, showArrow = true) {
  if (pct === null || pct === undefined) return '<span class="flat">—</span>';
  const p = parseFloat(pct);
  const cls = p > 0 ? 'up' : p < 0 ? 'down' : 'flat';
  const arrow = showArrow ? (p > 0 ? '▲' : p < 0 ? '▼' : '—') : '';
  return `<span class="${cls}">${arrow}${Math.abs(p).toFixed(2)}%</span>`;
}

function timeAgo(date) {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function tagClass(cat) {
  const m = { markets: 'tag-green', crypto: 'tag-amber', policy: 'tag-blue',
    global: 'tag-blue', finance: 'tag-green', learn: 'tag-purple' };
  return m[cat] || 'tag-gray';
}

// ── RENDER PANELS ─────────────────────────────────────────────────

async function renderCrypto() {
  const panel = document.getElementById('panel-crypto');
  if (!panel) return;

  panel.querySelector('.ticker-bar').innerHTML =
    `<div class="ticker-item"><div class="ticker-name">LOADING</div><div class="ticker-val">...</div></div>`;

  const [coins, global] = await Promise.all([fetchCrypto(), fetchCryptoGlobal()]);
  if (!coins) return;

  // Ticker bar
  panel.querySelector('.ticker-bar').innerHTML = coins.slice(0, 5).map(c =>
    `<div class="ticker-item">
      <div class="ticker-name">${c.symbol}</div>
      <div class="ticker-val">${c.price > 1 ? '$' + c.price.toLocaleString() : '$' + c.price.toFixed(4)}</div>
      <div class="ticker-chg">${chg(c.change)}</div>
    </div>`
  ).join('');

  // Grid
  const grid = panel.querySelector('.mkt-grid');
  if (grid) {
    grid.innerHTML = coins.map(c =>
      `<div class="mkt-card">
        <div class="mkt-name">${c.name}</div>
        <div class="mkt-val">${c.price > 1 ? '$' + c.price.toLocaleString() : '$' + c.price.toFixed(4)}</div>
        <div class="mkt-chg">${chg(c.change)}</div>
      </div>`
    ).join('');
  }

  // Global stats
  if (global) {
    const ai = panel.querySelector('.ai-txt');
    if (ai) {
      const dom = global.btcDominance ? global.btcDominance.toFixed(1) : '—';
      const mc = global.totalMcap ? '$' + (global.totalMcap / 1e12).toFixed(2) + 'T' : '—';
      ai.textContent = `Total crypto market cap: ${mc}. BTC dominance: ${dom}%. Market cap 24h change: ${global.mcapChange ? global.mcapChange.toFixed(2) + '%' : '—'}. Data live from CoinGecko.`;
    }
  }

  panel.querySelector('.update-time') && (panel.querySelector('.update-time').textContent = 'updated ' + new Date().toLocaleTimeString('en-IN'));
}

async function renderForex() {
  const panel = document.getElementById('panel-forex');
  if (!panel) return;

  const pairs = await fetchForex();
  if (!pairs) return;

  const inrPairs = pairs.filter(p => p.to === 'INR');
  const majorPairs = pairs.filter(p => p.to !== 'INR');

  const rowList = panel.querySelectorAll('.row-list')[0];
  if (rowList) {
    rowList.innerHTML = inrPairs.map(p =>
      `<div class="row-item">
        <div class="row-left"><div class="row-name">${p.pair}</div></div>
        <div class="row-right"><div class="row-val">${p.rate.toFixed(2)}</div></div>
      </div>`
    ).join('');
  }

  const rowList2 = panel.querySelectorAll('.row-list')[1];
  if (rowList2) {
    rowList2.innerHTML = majorPairs.map(p =>
      `<div class="row-item">
        <div class="row-left"><div class="row-name">${p.pair}</div></div>
        <div class="row-right"><div class="row-val">${p.rate.toFixed(4)}</div></div>
      </div>`
    ).join('');
  }

  const ticker = panel.querySelector('.ticker-bar');
  if (ticker) {
    ticker.innerHTML = inrPairs.slice(0, 4).map(p =>
      `<div class="ticker-item">
        <div class="ticker-name">${p.pair}</div>
        <div class="ticker-val">${p.rate.toFixed(2)}</div>
      </div>`
    ).join('');
  }
}

async function renderNewsFeed() {
  const articles = await fetchNews();
  if (!articles.length) return;

  State.articles = articles;

  const feed = document.querySelector('.feed-cards');
  if (!feed) return;

  const filtered = State.feedFilter === 'all'
    ? articles
    : articles.filter(a => a.category === State.feedFilter);

  feed.innerHTML = filtered.slice(0, 20).map(a => {
    const saved = State.savedArticles.includes(a.id);
    return `
    <div class="card ${a.isBreaking ? 'breaking-card' : ''}">
      ${a.isBreaking ? `<div class="breaking-lbl"><i class="ti ti-bolt" style="font-size:12px"></i>breaking · ${timeAgo(a.publishedAt)}</div>` : ''}
      <div class="card-meta">
        <span class="tag ${tagClass(a.category)}">${a.category}</span>
        <span class="card-time">${a.source} · ${timeAgo(a.publishedAt)}</span>
      </div>
      <div class="card-title">${a.title}</div>
      ${a.description ? `<div class="card-body">${a.description}...</div>` : ''}
      <div class="card-footer">
        <div class="card-actions">
          <button class="action-btn" onclick="toggleSave('${a.id}',this)">
            <i class="ti ti-bookmark${saved ? '-filled' : ''}"></i> ${saved ? 'saved' : 'save'}
          </button>
          <button class="action-btn" onclick="window.open('${a.url}','_blank')">
            <i class="ti ti-external-link"></i> source
          </button>
        </div>
        <span class="read-more" onclick="window.open('${a.url}','_blank')">read →</span>
      </div>
    </div>`;
  }).join('');
}

// ── WATCHLIST ─────────────────────────────────────────────────────
function toggleSave(id, btn) {
  const idx = State.savedArticles.indexOf(id);
  if (idx === -1) {
    State.savedArticles.push(id);
    btn.innerHTML = '<i class="ti ti-bookmark"></i> saved';
  } else {
    State.savedArticles.splice(idx, 1);
    btn.innerHTML = '<i class="ti ti-bookmark"></i> save';
  }
  localStorage.setItem('markora_saved', JSON.stringify(State.savedArticles));
}

// ── SEARCH ────────────────────────────────────────────────────────
function initSearch() {
  const input = document.querySelector('.search-box input');
  if (!input) return;
  let t;
  input.addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = e.target.value.toLowerCase();
      if (!q || q.length < 2) { renderNewsFeed(); return; }
      const results = State.articles.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.source.toLowerCase().includes(q)
      );
      const feed = document.querySelector('.feed-cards');
      if (feed) {
        feed.innerHTML = results.length
          ? results.slice(0, 10).map(a => `
            <div class="card">
              <div class="card-meta">
                <span class="tag ${tagClass(a.category)}">${a.category}</span>
                <span class="card-time">${a.source}</span>
              </div>
              <div class="card-title">${a.title}</div>
              <div class="card-footer">
                <div class="card-actions"></div>
                <span class="read-more" onclick="window.open('${a.url}','_blank')">read →</span>
              </div>
            </div>`).join('')
          : '<div style="padding:2rem 1rem;color:var(--text3);font-size:13px;">No results for "' + q + '"</div>';
      }
    }, 350);
  });
}

// ── FILTER BUTTONS ────────────────────────────────────────────────
function initFilterBtns() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.feedFilter = btn.textContent.toLowerCase().trim();
      if (State.feedFilter === 'all') State.feedFilter = 'all';
      renderNewsFeed();
    });
  });
}

// ── TAB SWITCHING WITH DATA LOAD ──────────────────────────────────
function initTabs() {
  document.querySelectorAll('.mtab').forEach(tab => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab;
      document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('panel-' + name);
      if (panel) panel.classList.add('active');
      State.activeTab = name;
      loadTabData(name);
    });
  });
}

function loadTabData(tab) {
  const now = Date.now();
  const last = State.lastFetch[tab] || 0;
  if (now - last < 60000) return; // Don't refetch within 60s
  State.lastFetch[tab] = now;

  if (tab === 'crypto') renderCrypto();
  if (tab === 'forex') renderForex();
}

// ── INIT ─────────────────────────────────────────────────────────
async function initMarkora() {
  console.log('🚀 Markora initialising...');

  initTabs();
  initFilterBtns();
  initSearch();

  // Add feed-cards class to the feed container
  const feed = document.querySelector('.main > div:last-child');
  if (feed) feed.classList.add('feed-cards-wrapper');

  // Wrap existing cards in feed-cards div
  const feedHeader = document.querySelector('.feed-header');
  if (feedHeader) {
    let cardsDiv = document.querySelector('.feed-cards');
    if (!cardsDiv) {
      cardsDiv = document.createElement('div');
      cardsDiv.className = 'feed-cards';
      // Move all cards after feed-header into this div
      const parent = feedHeader.parentNode;
      const cards = [...parent.querySelectorAll('.card')];
      cards.forEach(c => cardsDiv.appendChild(c));
      parent.appendChild(cardsDiv);
    }
  }

  // Load live crypto data immediately (active tab is equities but preload crypto)
  renderCrypto();
  renderForex();

  // Load news feed
  await renderNewsFeed();

  // Refresh every 60 seconds
  setInterval(async () => {
    await renderNewsFeed();
    if (State.activeTab === 'crypto') renderCrypto();
    if (State.activeTab === 'forex') renderForex();
  }, 60000);

  console.log('✅ Markora live');
}

document.addEventListener('DOMContentLoaded', initMarkora);
