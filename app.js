/* ============================================
   ASTAMOB.COM – Crypto Live Tracker
   app.js – Data Engine & UI Controller
   ============================================ */
 
const API_BASE       = 'https://api.coingecko.com/api/v3';
const COINS_PER_PAGE = 25;
const REFRESH_MS     = 30000;
 
let allCoins        = [];
let filteredCoins   = [];
let currentPage     = 1;
let currentFilter   = 'all';
let searchQuery     = '';
let sortMode        = 'market_cap_desc';
let previousPrices  = {};
let refreshTimer    = null;
 
/* ─────────────────────────────
   BUBBLES (ambient decoration)
───────────────────────────── */
function spawnBubbles() {
  const container = document.getElementById('bubbles');
  if (!container) return;
  for (let i = 0; i < 18; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = Math.random() * 14 + 5;
    b.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      bottom:-${size}px;
      animation-duration:${Math.random() * 14 + 9}s;
      animation-delay:${Math.random() * 12}s;
      opacity:${Math.random() * 0.5 + 0.1};
    `;
    container.appendChild(b);
  }
}
 
/* ─────────────────────────────
   FORMAT HELPERS
───────────────────────────── */
function fmt(n, decimals = 2) {
  if (n == null) return '–';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(n);
}
 
function fmtPrice(p) {
  if (p == null) return '–';
  if (p >= 1000)   return '$' + fmt(p, 2);
  if (p >= 1)      return '$' + fmt(p, 4);
  if (p >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toExponential(4);
}
 
function fmtLarge(n) {
  if (n == null) return '–';
  if (n >= 1e12) return '$' + fmt(n / 1e12, 2) + 'T';
  if (n >= 1e9)  return '$' + fmt(n / 1e9, 2)  + 'B';
  if (n >= 1e6)  return '$' + fmt(n / 1e6, 2)  + 'M';
  return '$' + fmt(n, 0);
}
 
function fmtChange(n) {
  if (n == null) return { text: '–', dir: 'flat' };
  const dir  = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const icon = n > 0 ? '▲' : n < 0 ? '▼' : '–';
  return { text: `${icon} ${Math.abs(n).toFixed(2)}%`, dir };
}
 
function timeStr() {
  return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
 
/* ─────────────────────────────
   FETCH GLOBAL STATS
───────────────────────────── */
async function fetchGlobalStats() {
  try {
    const r = await fetch(`${API_BASE}/global`);
    if (!r.ok) throw new Error('Global stats failed');
    const { data } = await r.json();
 
    document.getElementById('totalCoins').textContent =
      data.active_cryptocurrencies?.toLocaleString('id-ID') ?? '–';
 
    document.getElementById('globalMarketCap').textContent =
      fmtLarge(data.total_market_cap?.usd);
 
    document.getElementById('totalVolume').textContent =
      fmtLarge(data.total_volume?.usd);
 
    const btcDom = data.market_cap_percentage?.btc;
    document.getElementById('btcDominance').textContent =
      btcDom != null ? btcDom.toFixed(1) + '%' : '–';
  } catch (_) {
    /* silently keep previous values */
  }
}
 
/* ─────────────────────────────
   FETCH COINS
───────────────────────────── */
async function fetchCoins() {
  try {
    const url = `${API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
 
    // Track price changes for flash animation
    data.forEach(c => {
      if (previousPrices[c.id] !== undefined && previousPrices[c.id] !== c.current_price) {
        const row = document.querySelector(`.crypto-row[data-id="${c.id}"]`);
        if (row) {
          const dir = c.current_price > previousPrices[c.id] ? 'flash-up' : 'flash-down';
          row.classList.remove('flash-up', 'flash-down');
          void row.offsetWidth; // reflow
          row.classList.add(dir);
          setTimeout(() => row.classList.remove(dir), 700);
        }
      }
      previousPrices[c.id] = c.current_price;
    });
 
    allCoins = data;
    applyFiltersAndSort();
    document.getElementById('lastUpdate').textContent = 'Update: ' + timeStr();
 
  } catch (err) {
    showError('Gagal memuat data – mencoba lagi dalam 30 detik.');
    console.error(err);
  }
}
 
/* ─────────────────────────────
   FILTER / SORT
───────────────────────────── */
function applyFiltersAndSort() {
  let coins = [...allCoins];
 
  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    coins = coins.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    );
  }
 
  // Filter
  if (currentFilter === 'gainers') coins = coins.filter(c => (c.price_change_percentage_24h ?? 0) > 0);
  if (currentFilter === 'losers')  coins = coins.filter(c => (c.price_change_percentage_24h ?? 0) < 0);
 
  // Sort
  switch (sortMode) {
    case 'market_cap_desc':
      coins.sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0)); break;
    case 'volume_desc':
      coins.sort((a, b) => (b.total_volume ?? 0) - (a.total_volume ?? 0)); break;
    case 'price_desc':
      coins.sort((a, b) => (b.current_price ?? 0) - (a.current_price ?? 0)); break;
    case 'change_desc':
      coins.sort((a, b) => (b.price_change_percentage_24h ?? -999) - (a.price_change_percentage_24h ?? -999)); break;
  }
 
  filteredCoins = coins;
  currentPage   = 1;
  renderList();
  renderPagination();
}
 
/* ─────────────────────────────
   RENDER LIST
───────────────────────────── */
function renderList() {
  const container = document.getElementById('cryptoList');
 
  if (filteredCoins.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌊</div>
        <p>Tidak ada koin ditemukan.<br>Coba kata kunci lain.</p>
      </div>`;
    return;
  }
 
  const start = (currentPage - 1) * COINS_PER_PAGE;
  const slice = filteredCoins.slice(start, start + COINS_PER_PAGE);
  const globalOffset = start + 1;
 
  container.innerHTML = slice.map((c, i) => {
    const ch   = fmtChange(c.price_change_percentage_24h);
    const rank = globalOffset + i;
    return `
      <div class="crypto-row" data-id="${c.id}">
        <div class="col-rank">${rank}</div>
        <div class="col-coin">
          <img class="coin-img"
               src="${c.image}"
               alt="${c.name}"
               loading="lazy"
               onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2234%22 height=%2234%22><circle cx=%2217%22 cy=%2217%22 r=%2217%22 fill=%22%230D3348%22/></svg>'" />
          <div class="coin-info">
            <span class="coin-name">${c.name}</span>
            <span class="coin-symbol">${c.symbol}</span>
          </div>
        </div>
        <div class="col-price">${fmtPrice(c.current_price)}</div>
        <div class="col-change">
          <span class="change-pill ${ch.dir === 'flat' ? '' : ch.dir}">${ch.text}</span>
        </div>
        <div class="col-high">${fmtPrice(c.high_24h)}</div>
        <div class="col-low">${fmtPrice(c.low_24h)}</div>
        <div class="col-mcap">${fmtLarge(c.market_cap)}</div>
        <div class="col-vol">${fmtLarge(c.total_volume)}</div>
      </div>`;
  }).join('');
}
 
/* ─────────────────────────────
   PAGINATION
───────────────────────────── */
function renderPagination() {
  const total = Math.ceil(filteredCoins.length / COINS_PER_PAGE);
  const pg    = document.getElementById('pagination');
 
  if (total <= 1) { pg.innerHTML = ''; return; }
 
  let html = '';
  const addBtn = (label, page, cls = '') => {
    html += `<button class="page-btn ${cls}" data-page="${page}">${label}</button>`;
  };
 
  addBtn('‹', currentPage - 1, currentPage === 1 ? 'disabled' : '');
 
  const pages = buildPageRange(currentPage, total);
  pages.forEach(p => {
    if (p === '…') html += `<span class="page-ellipsis">…</span>`;
    else addBtn(p, p, currentPage === p ? 'active' : '');
  });
 
  addBtn('›', currentPage + 1, currentPage === total ? 'disabled' : '');
 
  pg.innerHTML = html;
  pg.querySelectorAll('.page-btn:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page);
      if (p && p !== currentPage) {
        currentPage = p;
        renderList();
        renderPagination();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}
 
function buildPageRange(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  if (cur <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push('…', total);
  } else if (cur >= total - 3) {
    pages.push(1, '…');
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1, '…', cur - 1, cur, cur + 1, '…', total);
  }
  return pages;
}
 
/* ─────────────────────────────
   ERROR TOAST
───────────────────────────── */
function showError(msg) {
  const old = document.querySelector('.error-toast');
  if (old) old.remove();
 
  const el = document.createElement('div');
  el.className = 'error-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}
 
/* ─────────────────────────────
   EVENT LISTENERS
───────────────────────────── */
function initEvents() {
  // Search
  const searchInput = document.getElementById('searchInput');
  let debounce;
  searchInput.addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      searchQuery = e.target.value.trim();
      applyFiltersAndSort();
    }, 250);
  });
 
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyFiltersAndSort();
    });
  });
 
  // Sort select
  document.getElementById('sortSelect').addEventListener('change', e => {
    sortMode = e.target.value;
    applyFiltersAndSort();
  });
 
  // Nav items (cosmetic for now)
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
    });
  });
}
 
/* ─────────────────────────────
   INIT
───────────────────────────── */
async function init() {
  spawnBubbles();
  initEvents();
 
  // Show loading state
  document.getElementById('cryptoList').innerHTML = `
    <div class="loading-state">
      <div class="loading-wave">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <p>Menyelam ke data pasar…</p>
    </div>`;
 
  // Initial fetch
  await Promise.all([fetchGlobalStats(), fetchCoins()]);
 
  // Auto-refresh every 30s
  refreshTimer = setInterval(async () => {
    await Promise.all([fetchGlobalStats(), fetchCoins()]);
  }, REFRESH_MS);
}
 
document.addEventListener('DOMContentLoaded', init);
 