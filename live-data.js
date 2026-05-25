// Markora — Live Data Engine v4
// All tabs live. Real-time crypto via Binance WS. Forex every 10s.

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

const fmt = (val, d = 2, pre = '') => {
  if (val === null || val === undefined || val === 0) return '—';
  if (typeof val === 'number') {
    if (val >= 1e12) return pre + (val/1e12).toFixed(2) + 'T';
    if (val >= 1e9)  return pre + (val/1e9).toFixed(2) + 'B';
    if (val >= 1e6)  return pre + (val/1e6).toFixed(2) + 'M';
    return pre + val.toLocaleString('en-IN', { maximumFractionDigits: d });
  }
  return String(val);
};

const chg = (pct) => {
  if (pct === null || pct === undefined) return '<span class="flat">—</span>';
  const p = parseFloat(pct);
  const cls = p > 0.01 ? 'up' : p < -0.01 ? 'down' : 'flat';
  const arrow = p > 0.01 ? '▲' : p < -0.01 ? '▼' : '—';
  return `<span class="${cls}">${arrow}${Math.abs(p).toFixed(2)}%</span>`;
};

const px = (val, sym = '') => {
  if (!val) return '—';
  if (val >= 1000) return sym + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (val >= 1)    return sym + val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return sym + val.toFixed(4);
};

const ago = (iso) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  return Math.floor(h / 24) + 'd ago';
};

const tagCls = (cat) => ({ markets:'tag-green', crypto:'tag-amber', policy:'tag-blue', global:'tag-blue', finance:'tag-green', learn:'tag-purple' }[cat] || 'tag-gray');
const setLoading = (id, msg = 'Loading live data...') => { const t = document.querySelector(`#${id} .ticker-bar`); if (t) t.innerHTML = `<div class="ticker-item"><div class="ticker-name" style="color:var(--accent)">${msg}</div></div>`; };

async function renderCrypto() {
  setLoading('panel-crypto', 'Loading live crypto...');
  const [coins, global, fg] = await Promise.all([api('/crypto', 30), api('/crypto/global', 60), api('/fear-greed', 300)]);
  if (!coins || !Array.isArray(coins)) return;
  const panel = document.getElementById('panel-crypto');
  panel.querySelector('.ticker-bar').innerHTML = coins.slice(0,5).map(c => `<div class="ticker-item"><div class="ticker-name">${c.symbol}</div><div class="ticker-val">${px(c.price,'$')}</div><div class="ticker-chg">${chg(c.change24h)}</div></div>`).join('');
  const grid = panel.querySelector('.mkt-grid');
  if (grid) grid.innerHTML = coins.map(c => `<div class="mkt-card" data-symbol="${c.symbol}"><div class="mkt-name">${c.name}</div><div class="mkt-val">${px(c.price,'$')}</div><div class="mkt-chg">${chg(c.change24h)}</div></div>`).join('');
  const ai = panel.querySelector('.ai-txt');
  if (ai && global) ai.textContent = `Total crypto: ${fmt(global.totalMarketCap,2,'$')}. 24h: ${global.marketCapChange24h?.toFixed(2)||'—'}%. BTC dom: ${global.btcDominance?.toFixed(1)||'—'}%.${fg?.value ? ` Fear & Greed: ${fg.value} (${fg.value_classification}).` : ''}`;
  panel.querySelector('.update-time') && (panel.querySelector('.update-time').textContent = 'updated ' + new Date().toLocaleTimeString('en-IN'));
}

async function renderEquities() {
  setLoading('panel-equities', 'Loading NSE data...');
  const data = await api('/equities', 60);
  if (!data?.indices) return;
  const panel = document.getElementById('panel-equities');
  const idx = data.indices;
  const key = ['NIFTY 50','NIFTY BANK','NIFTY IT','NIFTY MIDCAP 100','NIFTY SMALLCAP 100','India VIX'];
  panel.querySelector('.ticker-bar').innerHTML = idx.filter(i => key.includes(i.name)).map(i => `<div class="ticker-item"><div class="ticker-name">${i.name.replace('NIFTY ','')}</div><div class="ticker-val">${i.last?.toLocaleString('en-IN')||'—'}</div><div class="ticker-chg">${chg(i.changePct)}</div></div>`).join('');
  const sectoral = idx.filter(i => !['NIFTY 50','NIFTY BANK','NIFTY MIDCAP 100','NIFTY SMALLCAP 100','India VIX'].includes(i.name));
  const heatmap = panel.querySelector('.heatmap');
  if (heatmap && sectoral.length) heatmap.innerHTML = sectoral.map(i => { const p = i.changePct||0; const c = p>1.5?'h-up3':p>0.5?'h-up2':p>0?'h-up1':p<-1.5?'h-dn3':p<-0.5?'h-dn2':p<0?'h-dn1':'h-flat'; return `<div class="heat-cell ${c}"><div class="heat-name">${i.name.replace('NIFTY ','').replace(' 100','')}</div><div class="heat-val">${p>0?'+':''}${p.toFixed(2)}%</div></div>`; }).join('');
  const rowLists = panel.querySelectorAll('.row-list');
  if (rowLists[0]) rowLists[0].innerHTML = [...idx].sort((a,b) => Math.abs(b.changePct||0)-Math.abs(a.changePct||0)).slice(0,5).map(i => `<div class="row-item"><div class="row-left"><div class="row-name">${i.name}</div><div class="row-sub">H: ${i.high?.toLocaleString('en-IN')||'—'} · L: ${i.low?.toLocaleString('en-IN')||'—'}</div></div><div class="row-right"><div class="row-val">${i.last?.toLocaleString('en-IN')||'—'}</div><div class="row-chg">${chg(i.changePct)}</div></div></div>`).join('');
  const nifty = idx.find(i => i.name==='NIFTY 50'), vix = idx.find(i => i.name==='India VIX');
  const ai = panel.querySelector('.ai-txt');
  if (ai && nifty) ai.textContent = `Nifty ${nifty.changePct>0?'up':'down'} ${Math.abs(nifty.changePct||0).toFixed(2)}% at ${nifty.last?.toLocaleString('en-IN')}.${vix?` VIX ${vix.last?.toFixed(2)} — ${vix.last<15?'calm':vix.last<20?'moderate':'elevated volatility'}.`:''} Live NSE.`;
  panel.querySelector('.update-time') && (panel.querySelector('.update-time').textContent = 'updated ' + new Date().toLocaleTimeString('en-IN'));
}

async function renderGlobal() {
  setLoading('panel-global', 'Loading global indices...');
  const data = await api('/global', 60);
  if (!data?.indices?.length) return;
  const panel = document.getElementById('panel-global');
  panel.querySelector('.ticker-bar').innerHTML = data.indices.slice(0,6).map(i => `<div class="ticker-item"><div class="ticker-name">${i.name.toUpperCase()}</div><div class="ticker-val">${i.price?.toLocaleString('en-US',{maximumFractionDigits:0})||'—'}</div><div class="ticker-chg">${chg(i.changePct)}</div></div>`).join('');
  const grid = panel.querySelector('.mkt-grid');
  if (grid) grid.innerHTML = data.indices.map(i => `<div class="mkt-card"><div class="mkt-name">${i.name}</div><div class="mkt-val">${i.price?.toLocaleString('en-US',{maximumFractionDigits:0})||'—'}</div><div class="mkt-chg">${chg(i.changePct)}</div></div>`).join('');
  const ai = panel.querySelector('.ai-txt');
  if (ai) { const sp=data.indices.find(i=>i.name==='S&P 500'),ftse=data.indices.find(i=>i.name==='FTSE 100'),nk=data.indices.find(i=>i.name==='Nikkei 225'); const parts=[]; if(sp)parts.push(`S&P 500 ${sp.changePct>0?'up':'down'} ${Math.abs(sp.changePct).toFixed(2)}%`); if(ftse)parts.push(`FTSE ${ftse.changePct>0?'up':'down'} ${Math.abs(ftse.changePct).toFixed(2)}%`); if(nk)parts.push(`Nikkei ${nk.changePct>0?'up':'down'} ${Math.abs(nk.changePct).toFixed(2)}%`); ai.textContent=parts.join('. ')+'. Live via Yahoo Finance.'; }
}

async function renderForex() {
  const data = await api('/forex', 300);
  if (!data?.pairs) return;
  const panel = document.getElementById('panel-forex');
  const inr = data.pairs.filter(p => p.group==='inr'), major = data.pairs.filter(p => p.group==='major');
  panel.querySelector('.ticker-bar').innerHTML = inr.slice(0,4).map(p => `<div class="ticker-item"><div class="ticker-name">${p.pair}</div><div class="ticker-val">${p.rate.toFixed(2)}</div></div>`).join('');
  const lists = panel.querySelectorAll('.row-list');
  if (lists[0]) lists[0].innerHTML = inr.map(p => `<div class="row-item"><div class="row-left"><div class="row-name">${p.pair}</div></div><div class="row-right"><div class="row-val">${p.rate.toFixed(2)}</div></div></div>`).join('');
  if (lists[1]) lists[1].innerHTML = major.map(p => `<div class="row-item"><div class="row-left"><div class="row-name">${p.pair}</div></div><div class="row-right"><div class="row-val">${p.rate.toFixed(4)}</div></div></div>`).join('');
  const ai = panel.querySelector('.ai-txt'), usdInr = inr.find(p => p.pair==='USD/INR');
  if (ai && usdInr) ai.textContent = `USD/INR at ${usdInr.rate.toFixed(2)}. Live via ExchangeRate API.`;
}

async function renderCommodities() {
  const data = await api('/commodities', 300);
  if (!data || !Array.isArray(data)) return;
  const panel = document.getElementById('panel-commodities');
  panel.querySelector('.ticker-bar').innerHTML = data.slice(0,5).map(c => `<div class="ticker-item"><div class="ticker-name">${c.symbol}</div><div class="ticker-val">$${c.usd.toLocaleString()}</div><div class="ticker-chg">${chg(c.change24h)}</div></div>`).join('');
  const grid = panel.querySelector('.mkt-grid');
  if (grid) grid.innerHTML = data.map(c => `<div class="mkt-card"><div class="mkt-name">${c.name}</div><div class="mkt-val">$${c.usd.toLocaleString()}</div><div class="mkt-chg">${chg(c.change24h)}</div></div>`).join('') + data.filter(c => ['GOLD','SILVER'].includes(c.symbol)).map(c => `<div class="mkt-card"><div class="mkt-name">MCX ${c.symbol} ₹</div><div class="mkt-val">₹${Math.round(c.inr).toLocaleString('en-IN')}</div><div class="mkt-chg">${chg(c.change24h)}</div></div>`).join('');
  const gold=data.find(c=>c.symbol==='GOLD'),oil=data.find(c=>c.symbol==='BRENT');
  const ai=panel.querySelector('.ai-txt');
  if(ai&&gold)ai.textContent=`Gold $${gold.usd.toLocaleString()} (₹${Math.round(gold.inr).toLocaleString('en-IN')}/oz). Brent $${oil?.usd||'—'}/bbl. Live via Yahoo Finance.`;
}

async function renderFixedIncome() {
  setLoading('panel-fixed', 'Loading yields...');
  const data = await api('/fixed-income', 300);
  if (!data) return;
  const panel = document.getElementById('panel-fixed');
  if (!panel) return;
  panel.querySelector('.ticker-bar').innerHTML = [{ name:'RBI REPO', value:'6.50%' }, ...(data.us||[]).slice(0,3).map(r=>({name:r.tenor,value:r.value+'%'}))].map(r=>`<div class="ticker-item"><div class="ticker-name">${r.name}</div><div class="ticker-val">${r.value}</div></div>`).join('');
  const lists = panel.querySelectorAll('.row-list');
  if (lists[0]) lists[0].innerHTML = (data.india||[]).map(r=>`<div class="row-item"><div class="row-left"><div class="row-name">${r.name}</div><div class="row-sub">${r.note||''}</div></div><div class="row-right"><div class="row-val">${r.value}%</div></div></div>`).join('');
  if (lists[1]) lists[1].innerHTML = (data.global||[]).map(r=>`<div class="row-item"><div class="row-left"><div class="row-name">${r.name}</div><div class="row-sub">${r.centralBank}</div></div><div class="row-right"><div class="row-val">${r.value}%</div></div></div>`).join('');
  const ai=panel.querySelector('.ai-txt'),us10y=data.us?.find(r=>r.tenor==='10Y');
  if(ai)ai.textContent=`RBI repo at 6.50%. India 10Y G-Sec at 7.08%.${us10y?` US 10Y Treasury at ${us10y.value}%.`:''} Live US yields via Yahoo Finance.`;
}

async function renderDerivatives() {
  setLoading('panel-derivatives', 'Loading NSE F&O data...');
  const data = await api('/derivatives', 60);
  if (!data) return;
  const panel = document.getElementById('panel-derivatives');
  if (!panel) return;
  panel.querySelector('.ticker-bar').innerHTML = [{name:'INDIA VIX',value:data.vix?.value?.toFixed(2)||'—',chgPct:data.vix?.changePct},{name:'NIFTY PCR',value:data.pcr||'—',chgPct:null},{name:'MAX PAIN',value:data.maxPain?.toLocaleString('en-IN')||'—',chgPct:null}].map(r=>`<div class="ticker-item"><div class="ticker-name">${r.name}</div><div class="ticker-val">${r.value}</div>${r.chgPct!=null?`<div class="ticker-chg">${chg(r.chgPct)}</div>`:''}</div>`).join('');
  const rowList = panel.querySelector('.row-list');
  if (rowList && data.topStrikes?.length) rowList.innerHTML = data.topStrikes.slice(0,6).map(s=>`<div class="row-item"><div class="row-left"><div class="row-name">${s.strike?.toLocaleString('en-IN')} Strike</div><div class="row-sub">CE OI: ${(s.ceOI/100000).toFixed(1)}L · PE OI: ${(s.peOI/100000).toFixed(1)}L</div></div><div class="row-right"><div class="row-val">CE ₹${s.cePrice?.toFixed(0)||'—'}</div><div class="row-chg flat">PE ₹${s.pePrice?.toFixed(0)||'—'}</div></div></div>`).join('');
  const ai=panel.querySelector('.ai-txt');
  if(ai){const v=data.vix?.value;ai.textContent=`VIX at ${v?.toFixed(2)||'—'} — market ${v?(v<13?'very calm':v<16?'calm':v<20?'moderate':'elevated'):''}.  PCR at ${data.pcr||'—'} — ${data.pcr>1.2?'mildly bullish':data.pcr<0.8?'mildly bearish':'neutral'}. Live NSE F&O.`;}
  panel.querySelector('.update-time')&&(panel.querySelector('.update-time').textContent='updated '+new Date().toLocaleTimeString('en-IN'));
}

async function renderEtfs() {
  setLoading('panel-etfs', 'Loading AMFI data...');
  const data = await api('/etfs', 300);
  if (!data) return;
  const panel = document.getElementById('panel-etfs');
  if (!panel) return;
  panel.querySelector('.ticker-bar').innerHTML = (data.etfs||[]).map(e=>`<div class="ticker-item"><div class="ticker-name">${e.name.replace(' ETF','').replace('(GOLDBEES)','').trim()}</div><div class="ticker-val">₹${e.price?.toLocaleString('en-IN')||'—'}</div><div class="ticker-chg">${chg(e.changePct)}</div></div>`).join('');
  const lists = panel.querySelectorAll('.row-list');
  const popular=(data.navs||[]).filter(n=>['quant','parag parikh','nippon','hdfc','mirae','axis','icici'].some(k=>n.name.toLowerCase().includes(k))).slice(0,8);
  if(lists[0])lists[0].innerHTML=popular.map(n=>`<div class="row-item"><div class="row-left"><div class="row-name">${n.name.substring(0,40)}</div><div class="row-sub">${n.date}</div></div><div class="row-right"><div class="row-val">₹${n.nav?.toFixed(2)||'—'}</div></div></div>`).join('');
  if(lists[1])lists[1].innerHTML=(data.etfs||[]).map(e=>`<div class="row-item"><div class="row-left"><div class="row-name">${e.name}</div><div class="row-sub">NSE ETF</div></div><div class="row-right"><div class="row-val">₹${e.price?.toLocaleString('en-IN')||'—'}</div><div class="row-chg">${chg(e.changePct)}</div></div></div>`).join('');
  const ai=panel.querySelector('.ai-txt');
  if(ai)ai.textContent=`${data.totalFunds?.toLocaleString()||'—'} MF NAVs from AMFI India. ETF prices live from NSE via Yahoo Finance.`;
}

async function renderRealEstate() {
  const data = await api('/real-estate', 300);
  if (!data) return;
  const panel = document.getElementById('panel-realestate');
  if (!panel) return;
  panel.querySelector('.ticker-bar').innerHTML = (data.residential||[]).slice(0,3).map(r=>`<div class="ticker-item"><div class="ticker-name">${r.city.toUpperCase()}</div><div class="ticker-val">₹${r.pricePerSqft?.toLocaleString('en-IN')||'—'}/sqft</div><div class="ticker-chg up">▲${r.yoyChange}% YoY</div></div>`).join('');
  const lists = panel.querySelectorAll('.row-list');
  if(lists[0])lists[0].innerHTML=(data.residential||[]).map(r=>`<div class="row-item"><div class="row-left"><div class="row-name">${r.city}</div><div class="row-sub">${r.area}</div></div><div class="row-right"><div class="row-val">₹${r.pricePerSqft?.toLocaleString('en-IN')||'—'}/sqft</div><div class="row-chg up">▲${r.yoyChange}% YoY</div></div></div>`).join('');
  if(lists[1])lists[1].innerHTML=(data.reits||[]).map(r=>`<div class="row-item"><div class="row-left"><div class="row-name">${r.name}</div><div class="row-sub">${r.type} REIT</div></div><div class="row-right"><div class="row-val">₹${r.price?.toLocaleString('en-IN')||'—'}</div><div class="row-chg">${chg(r.changePct)}</div></div></div>`).join('');
  const ai=panel.querySelector('.ai-txt');
  if(ai)ai.textContent=`Bengaluru and Hyderabad leading residential growth. REIT prices live from NSE. Residential data from NHB RESIDEX (quarterly).`;
}

async function renderPrivate() {
  const data = await api('/private', 3600);
  if (!data) return;
  const panel = document.getElementById('panel-private');
  if (!panel) return;
  const s=data.summary||{};
  const ticker=panel.querySelector('.ticker-bar');
  if(ticker)ticker.innerHTML=[{name:'INDIA VC (MAY)',value:fmt(s.indiaVcMay,0,'$')},{name:'PE DEALS',value:fmt(s.indiaPeMay,0,'$')},{name:'UNICORNS YTD',value:s.unicornsYtd||'—'}].map(r=>`<div class="ticker-item"><div class="ticker-name">${r.name}</div><div class="ticker-val">${r.value}</div></div>`).join('');
  const rowList=panel.querySelector('.row-list');
  if(rowList&&data.recentRounds)rowList.innerHTML=data.recentRounds.map(r=>`<div class="row-item"><div class="row-left"><div class="row-name">${r.company}</div><div class="row-sub">${r.round} · ${r.sector}</div></div><div class="row-right"><div class="row-val">${fmt(r.amount,0,'$')}</div></div></div>`).join('');
  const ai=panel.querySelector('.ai-txt');
  if(ai)ai.textContent=`India VC at ${fmt(s.indiaVcMay,0,'$')} in May. ${s.unicornsYtd} unicorns YTD. Curated deals — live data requires Tracxn/Crunchbase.`;
}

async function renderSyndication() {
  const data = await api('/syndication', 3600);
  if (!data) return;
  const panel = document.getElementById('panel-syndication');
  if (!panel) return;
  const ticker=panel.querySelector('.ticker-bar');
  if(ticker)ticker.innerHTML=(data.spreads||[]).slice(0,3).map(s=>`<div class="ticker-item"><div class="ticker-name">${s.rating.toUpperCase().split(' ')[0]}</div><div class="ticker-val">+${s.spreadBps}bps</div><div class="ticker-chg flat">${s.vs}</div></div>`).join('');
  panel.querySelectorAll('.deal-card').forEach(d=>d.remove());
  const secLbl=panel.querySelector('.sec-lbl');
  if(secLbl&&data.recentDeals)data.recentDeals.forEach(deal=>{const card=document.createElement('div');card.className='deal-card';card.innerHTML=`<div class="deal-top"><div><div class="deal-name">${deal.borrower}</div><div class="deal-sub">${deal.type} · ${deal.tenor} · ${deal.currency}</div></div><div class="deal-amt">${deal.amount}</div></div><div class="deal-meta"><span class="tag ${deal.status==='Closed'||deal.status==='Signed'?'tag-green':'tag-red'}">${deal.status}</span><span class="tag tag-blue">${deal.lenders?.join(' · ')||''}</span><span class="tag tag-amber">${deal.spread}</span></div>`;secLbl.parentNode.insertBefore(card,secLbl.nextSibling);});
  const ai=panel.querySelector('.ai-txt');
  if(ai)ai.textContent=`AAA spreads +${data.spreads?.[0]?.spreadBps||42}bps over G-Sec. ${data.recentDeals?.length||0} deals tracked. Live data requires Bloomberg LPC.`;
}

async function renderNews(cat) {
  const path = cat && cat !== 'all' ? `/news?cat=${cat}` : '/news';
  const data = await api(path, 300);
  if (!data?.articles) return;
  State.articles = data.articles;
  let feed = document.querySelector('.feed-cards');
  if (!feed) { feed=document.createElement('div'); feed.className='feed-cards'; const fh=document.querySelector('.feed-header'); if(fh){const p=fh.parentNode;[...p.querySelectorAll('.card')].forEach(c=>feed.appendChild(c));p.appendChild(feed);} }
  if (!data.articles.length) { feed.innerHTML='<div style="padding:2rem 1rem;color:var(--text3);font-size:13px;">Loading articles...</div>'; return; }
  feed.innerHTML = data.articles.map(a => { const saved=State.savedArticles.includes(a.id); return `<div class="card ${a.isBreaking?'breaking-card':''}"> ${a.isBreaking?`<div class="breaking-lbl"><i class="ti ti-bolt" style="font-size:12px"></i>breaking · ${ago(a.publishedAt)}</div>`:''} <div class="card-meta"><span class="tag ${tagCls(a.category)}">${a.category}</span><span class="card-time">${a.source} · ${ago(a.publishedAt)}</span></div> <div class="card-title">${a.title}</div> ${a.description?`<div class="card-body">${a.description}...</div>`:''} <div class="card-footer"><div class="card-actions"><button class="action-btn" onclick="toggleSave('${a.id}',this)"><i class="ti ti-bookmark"></i> ${saved?'saved':'save'}</button><button class="action-btn" onclick="window.open('${a.url}','_blank')"><i class="ti ti-external-link"></i> source</button></div><span class="read-more" onclick="window.open('${a.url}','_blank')">read →</span></div></div>`; }).join('');
}

function toggleSave(id, btn) {
  const idx=State.savedArticles.indexOf(id);
  if(idx===-1){State.savedArticles.push(id);btn.innerHTML='<i class="ti ti-bookmark"></i> saved';}
  else{State.savedArticles.splice(idx,1);btn.innerHTML='<i class="ti ti-bookmark"></i> save';}
  localStorage.setItem('markora_saved',JSON.stringify(State.savedArticles));
}

function initSearch() {
  const input=document.querySelector('.search-box input');
  if(!input)return;
  let t;
  input.addEventListener('input',e=>{clearTimeout(t);t=setTimeout(()=>{const q=e.target.value.toLowerCase().trim();if(!q||q.length<2){renderNews();return;}const results=State.articles.filter(a=>a.title.toLowerCase().includes(q)||(a.description||'').toLowerCase().includes(q));const feed=document.querySelector('.feed-cards');if(!feed)return;feed.innerHTML=results.length?results.map(a=>`<div class="card"><div class="card-meta"><span class="tag ${tagCls(a.category)}">${a.category}</span><span class="card-time">${a.source}</span></div><div class="card-title">${a.title}</div><div class="card-footer"><div class="card-actions"></div><span class="read-more" onclick="window.open('${a.url}','_blank')">read →</span></div></div>`).join(''):`<div style="padding:2rem 1rem;color:var(--text3);font-size:13px;">No results for "${q}"</div>`;},350);});
}

function initTabs() {
  document.querySelectorAll('.mtab').forEach(tab=>{tab.addEventListener('click',()=>{document.querySelectorAll('.mtab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.panel-content').forEach(p=>p.classList.remove('active'));tab.classList.add('active');const name=tab.dataset.tab;const panel=document.getElementById('panel-'+name);if(panel)panel.classList.add('active');State.activeTab=name;loadTab(name);});});
}

function loadTab(name) {
  if(name==='crypto')renderCrypto();
  if(name==='equities')renderEquities();
  if(name==='global')renderGlobal();
  if(name==='forex')renderForex();
  if(name==='commodities')renderCommodities();
  if(name==='fixed')renderFixedIncome();
  if(name==='derivatives')renderDerivatives();
  if(name==='etfs')renderEtfs();
  if(name==='realestate')renderRealEstate();
  if(name==='private')renderPrivate();
  if(name==='syndication')renderSyndication();
}

function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const cat=btn.textContent.toLowerCase().trim();State.feedFilter=cat;renderNews(cat==='all'?null:cat);});});
}

async function updateWatchlistPrices() {
  const [crypto,forex]=await Promise.all([api('/crypto',30),api('/forex',300)]);
  if(!crypto||!Array.isArray(crypto))return;
  const map={};crypto.forEach(c=>{map[c.symbol]=c;});
  document.querySelectorAll('.watch-item').forEach(item=>{const nameEl=item.querySelector('.watch-name');if(!nameEl)return;const sym=nameEl.textContent.trim().split('/')[0];const coin=map[sym];if(coin){const valEl=item.querySelector('.watch-val'),chgEl=item.querySelector('.watch-chg');if(valEl)valEl.textContent=px(coin.price,'$');if(chgEl)chgEl.innerHTML=chg(coin.change24h);}});
  if(forex){const usdInr=forex.pairs?.find(p=>p.pair==='USD/INR');if(usdInr)document.querySelectorAll('.watch-item').forEach(item=>{if(item.querySelector('.watch-name')?.textContent.includes('USD/INR')){const valEl=item.querySelector('.watch-val');if(valEl)valEl.textContent=usdInr.rate.toFixed(2);}});}
}

function initBinanceWS() {
  const streams=['btcusdt','ethusdt','solusdt','bnbusdt','xrpusdt','avaxusdt','dogeusdt','suiusdt','renderusdt','tonusdt'].map(s=>s+'@ticker').join('/');
  const ws=new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  ws.onmessage=(e)=>{try{const d=JSON.parse(e.data).data;if(!d)return;const sym=d.s.replace('USDT',''),p=parseFloat(d.c),ch=parseFloat(d.P);const fp=(v)=>v>=1000?'$'+v.toLocaleString('en-US',{maximumFractionDigits:0}):v>=1?'$'+v.toLocaleString('en-US',{maximumFractionDigits:2}):'$'+v.toFixed(4);const fc=(pct)=>{const a=pct>0?'▲':pct<0?'▼':'—',c=pct>0?'up':pct<0?'down':'flat';return `<span class="${c}">${a}${Math.abs(pct).toFixed(2)}%</span>`;};const card=document.querySelector(`.mkt-card[data-symbol="${sym}"]`);if(card){const v=card.querySelector('.mkt-val'),c=card.querySelector('.mkt-chg');if(v){v.textContent=fp(p);v.style.transition='color 0.3s';v.style.color=ch>=0?'var(--accent)':'var(--red)';setTimeout(()=>v.style.color='',600);}if(c)c.innerHTML=fc(ch);}document.querySelectorAll('#panel-crypto .ticker-item').forEach(item=>{if(item.querySelector('.ticker-name')?.textContent.trim()===sym){const v=item.querySelector('.ticker-val'),c=item.querySelector('.ticker-chg');if(v)v.textContent=fp(p);if(c)c.innerHTML=fc(ch);}});document.querySelectorAll('.watch-item').forEach(item=>{if(item.querySelector('.watch-name')?.textContent.trim().split('/')[0]===sym){const v=item.querySelector('.watch-val'),c=item.querySelector('.watch-chg');if(v)v.textContent=fp(p);if(c)c.innerHTML=fc(ch);}});const dot=document.querySelector('.live-dot');if(dot){dot.style.transform='scale(1.5)';setTimeout(()=>dot.style.transform='',150);}}catch(e){}};
  ws.onclose=()=>setTimeout(initBinanceWS,3000);ws.onerror=()=>ws.close();
}

function initForexWS() {
  const poll=async()=>{try{const res=await fetch('https://api.exchangerate-api.com/v4/latest/USD');const r=(await res.json()).rates;const updates=[{pair:'USD/INR',rate:r.INR,d:2},{pair:'EUR/INR',rate:r.INR/r.EUR,d:2},{pair:'GBP/INR',rate:r.INR/r.GBP,d:2},{pair:'JPY/INR',rate:r.INR/r.JPY,d:2},{pair:'AED/INR',rate:r.INR/r.AED,d:2},{pair:'EUR/USD',rate:1/r.EUR,d:4},{pair:'GBP/USD',rate:1/r.GBP,d:4},{pair:'USD/JPY',rate:r.JPY,d:2},{pair:'AUD/USD',rate:1/r.AUD,d:4},{pair:'USD/CNY',rate:r.CNY,d:4}];const panel=document.getElementById('panel-forex');if(!panel)return;panel.querySelectorAll('.row-item').forEach(row=>{const nameEl=row.querySelector('.row-name');if(!nameEl)return;const u=updates.find(x=>x.pair===nameEl.textContent.trim());if(!u)return;const valEl=row.querySelector('.row-val');if(valEl){const nr=u.rate.toFixed(u.d);if(valEl.textContent!==nr){valEl.textContent=nr;valEl.style.transition='color 0.3s';valEl.style.color='var(--accent)';setTimeout(()=>valEl.style.color='',600);}}});panel.querySelectorAll('.ticker-item').forEach(item=>{const nameEl=item.querySelector('.ticker-name');if(!nameEl)return;const u=updates.find(x=>x.pair===nameEl.textContent.trim());if(u){const v=item.querySelector('.ticker-val');if(v)v.textContent=u.rate.toFixed(u.d);}});document.querySelectorAll('.watch-item').forEach(item=>{if(item.querySelector('.watch-name')?.textContent.includes('USD/INR')){const v=item.querySelector('.watch-val');if(v)v.textContent=r.INR.toFixed(2);}});}catch(e){}};
  poll();setInterval(poll,10000);
}

async function initMarkora() {
  initTabs();initFilters();initSearch();
  await Promise.all([renderEquities(),renderCrypto(),renderGlobal(),renderForex(),renderCommodities(),renderFixedIncome(),renderDerivatives(),renderEtfs(),renderRealEstate(),renderPrivate(),renderSyndication(),renderNews()]);
  await updateWatchlistPrices();
  setInterval(renderCrypto,30000);setInterval(renderEquities,60000);setInterval(renderGlobal,60000);setInterval(renderDerivatives,60000);setInterval(renderForex,300000);setInterval(renderNews,300000);setInterval(renderEtfs,300000);setInterval(updateWatchlistPrices,30000);
  initBinanceWS();initForexWS();
}

document.addEventListener('DOMContentLoaded', initMarkora);
