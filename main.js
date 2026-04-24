/* ═══════════════════════════════════════════════════════════════
   CRYPTEX — MARKET INTELLIGENCE TERMINAL
   main.js
════════════════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIG ─────────────────────────────────────────────────── */
const CFG = {
  BINANCE_FAPI : 'https://fapi.binance.com/fapi/v1',
  BYBIT_API    : 'https://api.bybit.com/v5/market',
  GECKO_API    : 'https://api.coingecko.com/api/v3',
  KLINE_LIMIT  : 50,    // candles to fetch for calculations
  FETCH_TIMEOUT: 8000,  // ms per request
};

/* Binance → Bybit interval mapping */
const TF_MAP = {
  binance: { '5m':'5m', '15m':'15m', '30m':'30m', '1h':'1h', '4h':'4h', '1d':'1d', '1w':'1w' },
  bybit:   { '5m':'5',  '15m':'15',  '30m':'30',  '1h':'60', '4h':'240','1d':'D',  '1w':'W'  },
};

/* CoinGecko slug lookup for common tickers */
const GECKO_IDS = {
  BTC:'bitcoin', ETH:'ethereum', BNB:'binancecoin', SOL:'solana',
  XRP:'ripple',  ADA:'cardano',  DOGE:'dogecoin',   AVAX:'avalanche-2',
  DOT:'polkadot',MATIC:'matic-network',LINK:'chainlink',LTC:'litecoin',
  UNI:'uniswap', ATOM:'cosmos',  TRX:'tron',        NEAR:'near',
  APT:'aptos',   ARB:'arbitrum', OP:'optimism',     INJ:'injective-protocol',
  SUI:'sui',     FTM:'fantom',   SAND:'the-sandbox', MANA:'decentraland',
  CRV:'curve-dao-token', AAVE:'aave', MKR:'maker',  SNX:'synthetix-network-token',
  FIL:'filecoin',ICP:'internet-computer',HBAR:'hedera-hashgraph',
  VET:'vechain', ALGO:'algorand',XLM:'stellar',     EOS:'eos',
  THETA:'theta-token',XMR:'monero',ZEC:'zcash',DASH:'dash',
};

/* ── STATE ──────────────────────────────────────────────────── */
const STATE = {
  singleTf       : '1h',
  scannerTf      : '1h',
  scannerSource  : 'binance',
  scannerData    : [],
  scannerCategory: 'gainers',
  fundingInterval: null,
  currentPrice   : 0,
};

/* ── UTILITY ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function fPrice(n, decimals = null) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const d = decimals !== null ? decimals
    : abs >= 10000 ? 0
    : abs >= 100   ? 1
    : abs >= 1     ? 2
    : abs >= 0.1   ? 4
    : 6;
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fNum(n) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(2) + 'K';
  return Number(n).toLocaleString('en-US');
}

function fPct(n, digits = 2) {
  if (n == null || isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return sign + Number(n).toFixed(digits) + '%';
}

function fRate(n) {
  if (n == null || isNaN(n)) return '—';
  return (Number(n) * 100).toFixed(4) + '%';
}

function pctClass(n) {
  if (n == null || isNaN(n)) return '';
  return n >= 0 ? 'bull' : 'bear';
}

function setPct(id, val) {
  const el = $(id);
  if (!el) return;
  el.textContent = fPct(val);
  el.className = 'pc-value ' + pctClass(val);
}

function setTfcPct(id, val) {
  const el = $(id);
  if (!el) return;
  el.textContent = fPct(val);
  el.className = 'tfc-value ' + pctClass(val);
}

function fetchWithTimeout(url, ms = CFG.FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

function nowStr() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/* ── CLOCK ──────────────────────────────────────────────────── */
function startClock() {
  const el = $('header-time');
  const tick = () => { el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false }); };
  tick();
  setInterval(tick, 1000);
}

/* ── STATUS ─────────────────────────────────────────────────── */
function setStatus(type, text) {
  const dot  = $('status-dot');
  const stxt = $('status-text');
  dot.className  = 'status-dot ' + (type === 'ok' ? '' : type);
  stxt.textContent = text;
}

/* ── TAB SWITCHING ──────────────────────────────────────────── */
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });
}

/* ── TIMEFRAME SELECTORS ────────────────────────────────────── */
function initTfSelectors() {
  document.querySelectorAll('#tf-selector-single .tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tf-selector-single .tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.singleTf = btn.dataset.tf;
    });
  });

  document.querySelectorAll('#tf-selector-scanner .tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tf-selector-scanner .tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.scannerTf = btn.dataset.tf;
    });
  });
}

/* ── SOURCE TOGGLE (Scanner) ────────────────────────────────── */
function initSourceToggle() {
  document.querySelectorAll('.src-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.src-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.scannerSource = btn.dataset.src;
    });
  });
}

/* ── SCANNER CATEGORY TABS ──────────────────────────────────── */
function initScannerTabs() {
  document.querySelectorAll('.scanner-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scanner-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.scannerCategory = btn.dataset.category;
      renderScannerCategory();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   API LAYER
══════════════════════════════════════════════════════════════ */

/* ── BINANCE: single coin ───────────────────────────────────── */
async function fetchBinance(symbol) {
  const [t24, prem, oi, fr] = await Promise.allSettled([
    fetchWithTimeout(`${CFG.BINANCE_FAPI}/ticker/24hr?symbol=${symbol}`).then(r => r.json()),
    fetchWithTimeout(`${CFG.BINANCE_FAPI}/premiumIndex?symbol=${symbol}`).then(r => r.json()),
    fetchWithTimeout(`${CFG.BINANCE_FAPI}/openInterest?symbol=${symbol}`).then(r => r.json()),
    fetchWithTimeout(`${CFG.BINANCE_FAPI}/fundingRate?symbol=${symbol}&limit=1`).then(r => r.json()),
  ]);

  const ticker = t24.status === 'fulfilled' ? t24.value : null;
  if (!ticker || ticker.code) throw new Error('Binance ticker failed');

  return {
    source      : 'BINANCE',
    symbol,
    lastPrice   : parseFloat(ticker.lastPrice),
    priceChange : parseFloat(ticker.priceChange),
    changePct24h: parseFloat(ticker.priceChangePercent),
    weightedAvg : parseFloat(ticker.weightedAvgPrice),
    openPrice   : parseFloat(ticker.openPrice),
    high24h     : parseFloat(ticker.highPrice),
    low24h      : parseFloat(ticker.lowPrice),
    volume      : parseFloat(ticker.volume),
    quoteVolume : parseFloat(ticker.quoteVolume),
    tradeCount  : ticker.count,
    markPrice   : prem.status === 'fulfilled' ? parseFloat(prem.value.markPrice)  : null,
    indexPrice  : prem.status === 'fulfilled' ? parseFloat(prem.value.indexPrice) : null,
    fundingRate : prem.status === 'fulfilled' ? parseFloat(prem.value.lastFundingRate) : null,
    interestRate: prem.status === 'fulfilled' ? parseFloat(prem.value.interestRate)    : null,
    nextFunding : prem.status === 'fulfilled' ? parseInt(prem.value.nextFundingTime)   : null,
    openInterest: oi.status  === 'fulfilled' ? parseFloat(oi.value.openInterest)       : null,
    oiValue     : null,
    turnover24h : null,
    fundingInterval: 8,
    lastFundingRate: fr.status === 'fulfilled' && fr.value[0] ? parseFloat(fr.value[0].fundingRate) : null,
    bid1Price   : null, ask1Price: null, bid1Size: null, ask1Size: null,
    bids: [], asks: [],
  };
}

/* ── BYBIT: single coin ─────────────────────────────────────── */
async function fetchBybit(symbol) {
  const [tk, ob, fr] = await Promise.allSettled([
    fetchWithTimeout(`${CFG.BYBIT_API}/tickers?category=linear&symbol=${symbol}`).then(r => r.json()),
    fetchWithTimeout(`${CFG.BYBIT_API}/orderbook?category=linear&symbol=${symbol}&limit=5`).then(r => r.json()),
    fetchWithTimeout(`${CFG.BYBIT_API}/funding/history?category=linear&symbol=${symbol}&limit=1`).then(r => r.json()),
  ]);

  if (tk.status !== 'fulfilled' || tk.value.retCode !== 0 || !tk.value.result.list.length)
    throw new Error('Bybit ticker failed');

  const t = tk.value.result.list[0];
  const book = ob.status === 'fulfilled' && ob.value.retCode === 0 ? ob.value.result : null;

  return {
    source      : 'BYBIT',
    symbol,
    lastPrice   : parseFloat(t.lastPrice),
    priceChange : parseFloat(t.lastPrice) - parseFloat(t.prevPrice24h),
    changePct24h: parseFloat(t.price24hPcnt) * 100,
    weightedAvg : null,
    openPrice   : parseFloat(t.prevPrice24h),
    high24h     : parseFloat(t.highPrice24h),
    low24h      : parseFloat(t.lowPrice24h),
    volume      : parseFloat(t.volume24h),
    quoteVolume : parseFloat(t.turnover24h),
    tradeCount  : null,
    markPrice   : parseFloat(t.markPrice),
    indexPrice  : parseFloat(t.indexPrice),
    fundingRate : parseFloat(t.fundingRate),
    interestRate: null,
    nextFunding : parseInt(t.nextFundingTime),
    openInterest: parseFloat(t.openInterest),
    oiValue     : parseFloat(t.openInterestValue),
    turnover24h : parseFloat(t.turnover24h),
    fundingInterval: parseInt(t.fundingIntervalHour) || 8,
    lastFundingRate: fr.status === 'fulfilled' && fr.value.result?.list?.[0]
                     ? parseFloat(fr.value.result.list[0].fundingRate) : null,
    bid1Price   : parseFloat(t.bid1Price),
    ask1Price   : parseFloat(t.ask1Price),
    bid1Size    : parseFloat(t.bid1Size),
    ask1Size    : parseFloat(t.ask1Size),
    bids        : book ? book.b.map(([p,s]) => [parseFloat(p), parseFloat(s)]) : [],
    asks        : book ? book.a.map(([p,s]) => [parseFloat(p), parseFloat(s)]) : [],
  };
}

/* ── KLINE FETCH with fallback ──────────────────────────────── */
async function fetchKline(symbol, tf) {
  // Try Binance first
  try {
    const interval = TF_MAP.binance[tf] || '1h';
    const url = `${CFG.BINANCE_FAPI}/klines?symbol=${symbol}&interval=${interval}&limit=${CFG.KLINE_LIMIT}`;
    const res = await fetchWithTimeout(url);
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      // [openTime, open, high, low, close, volume, ...]
      return data.map(c => ({
        t: c[0], o: parseFloat(c[1]), h: parseFloat(c[2]),
        l: parseFloat(c[3]), c: parseFloat(c[4]), v: parseFloat(c[5]),
      }));
    }
  } catch (_) { /* fall through */ }

  // Fallback: Bybit
  try {
    const interval = TF_MAP.bybit[tf] || '60';
    const url = `${CFG.BYBIT_API}/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${CFG.KLINE_LIMIT}`;
    const res = await fetchWithTimeout(url);
    const data = await res.json();
    if (data.retCode === 0 && data.result.list.length) {
      // Bybit: [startTime, open, high, low, close, volume, turnover]
      return data.result.list.map(c => ({
        t: parseInt(c[0]), o: parseFloat(c[1]), h: parseFloat(c[2]),
        l: parseFloat(c[3]), c: parseFloat(c[4]), v: parseFloat(c[5]),
      })).reverse();
    }
  } catch (_) { /* fail silently */ }

  return null;
}

/* ── COINGECKO ──────────────────────────────────────────────── */
async function resolveGeckoId(ticker) {
  // 1. Check hardcoded map
  if (GECKO_IDS[ticker]) return GECKO_IDS[ticker];

  // 2. Try lowercase slug directly (works for many coins)
  const slug = ticker.toLowerCase();
  try {
    const probe = await fetchWithTimeout(
      `${CFG.GECKO_API}/coins/${slug}?localization=false&tickers=false&community_data=false&developer_data=false`
    ).then(r => r.json());
    if (probe.id && !probe.error) return probe.id;
  } catch (_) {}

  // 3. Use CoinGecko search to find the correct slug
  try {
    const search = await fetchWithTimeout(
      `${CFG.GECKO_API}/search?query=${encodeURIComponent(ticker)}`
    ).then(r => r.json());
    const coins = search.coins || [];
    // Prefer exact symbol match
    const exact = coins.find(c => c.symbol.toUpperCase() === ticker);
    if (exact) return exact.id;
    // Otherwise take top result
    if (coins.length) return coins[0].id;
  } catch (_) {}

  return slug; // last resort
}

async function fetchGecko(ticker) {
  const id = await resolveGeckoId(ticker.toUpperCase());
  try {
    const [coin, mkt] = await Promise.allSettled([
      fetchWithTimeout(`${CFG.GECKO_API}/coins/${id}?localization=false&tickers=false&community_data=true&developer_data=false`).then(r => r.json()),
      fetchWithTimeout(`${CFG.GECKO_API}/coins/markets?vs_currency=usd&ids=${id}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=1h,24h,7d`).then(r => r.json()),
    ]);

    const raw = coin.status === 'fulfilled' ? coin.value : null;
    // Guard: CoinGecko returns {error:"coin not found"} with HTTP 200
    const c  = (raw && !raw.error) ? raw : null;
    const m  = mkt.status  === 'fulfilled' && mkt.value.length ? mkt.value[0] : null;
    const md = c?.market_data;

    return {
      name          : c?.name,
      symbol        : c?.symbol?.toUpperCase(),
      image         : c?.image?.large,
      categories    : c?.categories || [],
      genesis       : c?.genesis_date,
      algorithm     : c?.hashing_algorithm,
      description   : c?.description?.en || '',
      marketCapRank : c?.market_cap_rank,
      watchlist     : c?.watchlist_portfolio_users,
      sentimentUp   : c?.sentiment_votes_up_percentage,
      sentimentDown : c?.sentiment_votes_down_percentage,
      links         : c?.links,
      marketCap     : md?.market_cap?.usd,
      fdv           : md?.fully_diluted_valuation?.usd,
      circSupply    : md?.circulating_supply,
      totalSupply   : md?.total_supply,
      maxSupply     : md?.max_supply,
      ath           : md?.ath?.usd,
      athChange     : md?.ath_change_percentage?.usd,
      athDate       : md?.ath_date?.usd,
      atl           : md?.atl?.usd,
      atlChange     : md?.atl_change_percentage?.usd,
      pc1h          : md?.price_change_percentage_1h_in_currency?.usd  ?? m?.price_change_percentage_1h_in_currency,
      pc24h         : md?.price_change_percentage_24h,
      pc7d          : md?.price_change_percentage_7d,
      pc14d         : md?.price_change_percentage_14d,
      pc30d         : md?.price_change_percentage_30d,
      pc60d         : md?.price_change_percentage_60d,
      pc200d        : md?.price_change_percentage_200d,
      pc1y          : md?.price_change_percentage_1y,
    };
  } catch (_) {
    return null;
  }
}

/* ── BYBIT ORDERBOOK (separate fetch for Binance path) ──────── */
async function fetchBybitOrderbook(symbol) {
  try {
    const res = await fetchWithTimeout(`${CFG.BYBIT_API}/orderbook?category=linear&symbol=${symbol}&limit=5`);
    const data = await res.json();
    if (data.retCode === 0) {
      return {
        bids: data.result.b.map(([p,s]) => [parseFloat(p), parseFloat(s)]),
        asks: data.result.a.map(([p,s]) => [parseFloat(p), parseFloat(s)]),
      };
    }
  } catch (_) {}
  return { bids: [], asks: [] };
}

/* ══════════════════════════════════════════════════════════════
   CALCULATIONS
══════════════════════════════════════════════════════════════ */

/* ── PIVOT POINTS & S/R ─────────────────────────────────────── */
function calcPivots(candles, currentPrice) {
  if (!candles || !candles.length) return null;

  // Use last completed candle
  const last  = candles[candles.length - 2] || candles[candles.length - 1];
  const H = last.h, L = last.l, C = last.c;

  const PP = (H + L + C) / 3;
  const R1 = 2 * PP - L;
  const R2 = PP + (H - L);
  const R3 = H + 2 * (PP - L);
  const S1 = 2 * PP - H;
  const S2 = PP - (H - L);
  const S3 = L - 2 * (H - PP);

  const dist = p => {
    const d = ((currentPrice - p) / currentPrice) * 100;
    return (d >= 0 ? '+' : '') + d.toFixed(2) + '%';
  };

  return [
    { tag:'R3', label:'Resistance 3', price:R3, type:'resistance', dist:dist(R3) },
    { tag:'R2', label:'Resistance 2', price:R2, type:'resistance', dist:dist(R2) },
    { tag:'R1', label:'Resistance 1', price:R1, type:'resistance', dist:dist(R1) },
    { tag:'PP', label:'Pivot Point',  price:PP, type:'pivot',      dist:dist(PP) },
    { tag:'S1', label:'Support 1',    price:S1, type:'support',    dist:dist(S1) },
    { tag:'S2', label:'Support 2',    price:S2, type:'support',    dist:dist(S2) },
    { tag:'S3', label:'Support 3',    price:S3, type:'support',    dist:dist(S3) },
  ];
}

/* ── SUPPLY & DEMAND ZONES ──────────────────────────────────── */
function calcSupplyDemand(candles, currentPrice) {
  if (!candles || candles.length < 5) return null;

  // Find significant swing highs and lows from recent candles
  const recent = candles.slice(-20);
  const highs = recent.map(c => c.h);
  const lows  = recent.map(c => c.l);

  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const range = maxH - minL;
  const mid   = (maxH + minL) / 2;

  // Fibonacci-based zones
  const supplyHigh  = maxH;
  const supplyLow   = maxH - range * 0.236;
  const demandLow   = minL;
  const demandHigh  = minL + range * 0.236;
  const eq          = mid;

  // Premium / Discount zones (ICT concept)
  const premium      = mid + range * 0.25;
  const discount     = mid - range * 0.25;

  // Identify current zone
  let currentZone = 'EQUILIBRIUM';
  if (currentPrice >= supplyLow)   currentZone = 'SUPPLY (PREMIUM)';
  else if (currentPrice <= demandHigh) currentZone = 'DEMAND (DISCOUNT)';

  return {
    supply:    { high: supplyHigh, low: supplyLow },
    demand:    { high: demandHigh, low: demandLow },
    eq,
    premium,
    discount,
    currentZone,
    range,
  };
}

/* ── LIQUIDITY ZONES ────────────────────────────────────────── */
function calcLiquidity(currentPrice, high24h, low24h, ath, atl) {
  const zones = [];

  // Round number levels near current price
  const magnitude = Math.pow(10, Math.floor(Math.log10(currentPrice)));
  for (let m = -3; m <= 3; m++) {
    const level = Math.round(currentPrice / magnitude) * magnitude + m * magnitude;
    if (level > 0 && Math.abs(level - currentPrice) / currentPrice < 0.15) {
      const dist = ((currentPrice - level) / currentPrice * 100).toFixed(2);
      zones.push({
        type : 'liquidity',
        name : 'ROUND NUMBER',
        price: level,
        desc : `Psychological level — ${(dist >= 0 ? '+' : '') + dist}% from price`,
      });
    }
  }

  // 24h high/low as liquidity magnets
  zones.push({
    type : 'liquidity',
    name : '24H HIGH LIQUIDITY',
    price: high24h,
    desc : `Stop cluster above — ${(((currentPrice - high24h) / currentPrice) * 100).toFixed(2)}% from price`,
  });

  zones.push({
    type : 'liquidity',
    name : '24H LOW LIQUIDITY',
    price: low24h,
    desc : `Stop cluster below — ${(((currentPrice - low24h) / currentPrice) * 100).toFixed(2)}% from price`,
  });

  // ATH / ATL
  if (ath) {
    const d = (((currentPrice - ath) / currentPrice) * 100).toFixed(2);
    zones.push({ type:'liquidity', name:'ALL TIME HIGH', price:ath, desc:`${d}% from price` });
  }
  if (atl) {
    const d = (((currentPrice - atl) / currentPrice) * 100).toFixed(2);
    zones.push({ type:'liquidity', name:'ALL TIME LOW', price:atl, desc:`${d}% from price` });
  }

  // Sort by distance to current price
  zones.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));
  return zones;
}

/* ── FUNDING RATE SENTIMENT ─────────────────────────────────── */
function fundingSentiment(rate) {
  if (rate == null) return { text: '—', cls: '' };
  const r = rate * 100;
  if (r > 0.05)  return { text: 'LONGS PAYING — BEARISH', cls: 'bear' };
  if (r > 0.01)  return { text: 'MILD BULLISH BIAS',      cls: 'bull' };
  if (r < -0.05) return { text: 'SHORTS PAYING — BULLISH',cls: 'bull' };
  if (r < -0.01) return { text: 'MILD BEARISH BIAS',      cls: 'bear' };
  return { text: 'NEUTRAL / BALANCED', cls: 'neutral' };
}

/* ── FUNDING COUNTDOWN ──────────────────────────────────────── */
function startFundingCountdown(nextFundingMs) {
  if (STATE.fundingInterval) clearInterval(STATE.fundingInterval);
  const el = $('funding-countdown');
  if (!el || !nextFundingMs) return;

  const tick = () => {
    const diff = nextFundingMs - Date.now();
    if (diff <= 0) { el.textContent = '00:00:00'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = [h,m,s].map(n => String(n).padStart(2,'0')).join(':');
  };

  tick();
  STATE.fundingInterval = setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════════════════════
   RENDERERS — SINGLE COIN
══════════════════════════════════════════════════════════════ */

function renderCoinIdentity(gecko, fallbackTicker) {
  // Always reset logo first
  const logo = $('coin-logo');
  logo.onload  = null;
  logo.onerror = null;
  logo.src = '';
  logo.style.display = 'none';

  if (gecko?.image) {
    logo.onload  = () => { logo.style.display = 'block'; };
    logo.onerror = () => { logo.style.display = 'none'; };
    logo.src = gecko.image;
  }

  // Always show at minimum the ticker symbol we searched
  $('coin-symbol').textContent    = gecko?.symbol || fallbackTicker || '—';
  $('coin-name').textContent      = gecko?.name   || (fallbackTicker ? fallbackTicker + ' (no CoinGecko data)' : '—');
  $('coin-rank').textContent      = gecko?.marketCapRank ? `#${gecko.marketCapRank} BY MARKET CAP` : '—';
  $('coin-genesis').textContent   = gecko?.genesis    || '—';
  $('coin-algo').textContent      = gecko?.algorithm  || 'N/A';
  $('coin-watchlist').textContent = gecko?.watchlist  ? fNum(gecko.watchlist) : '—';

  // Categories
  const catEl = $('coin-categories');
  catEl.innerHTML = '';
  (gecko?.categories || []).slice(0, 4).forEach(cat => {
    const tag = document.createElement('span');
    tag.className   = 'category-tag';
    tag.textContent = cat;
    catEl.appendChild(tag);
  });

  // Sentiment
  if (gecko?.sentimentUp != null) {
    $('sentiment-up').textContent   = gecko.sentimentUp.toFixed(1) + '% BULLISH';
    $('sentiment-down').textContent = gecko.sentimentDown.toFixed(1) + '% BEARISH';
    $('sentiment-fill').style.width = gecko.sentimentUp + '%';
  }
}

function renderPriceAction(market, gecko) {
  const price = market.lastPrice;
  STATE.currentPrice = price;

  $('price-main').textContent = fPrice(price);
  setPct('pc-1h',  gecko?.pc1h  ?? null);
  setPct('pc-24h', market.changePct24h);
  setPct('pc-7d',  gecko?.pc7d  ?? null);

  $('mark-price').textContent    = fPrice(market.markPrice);
  $('index-price').textContent   = fPrice(market.indexPrice);
  $('high-24h').textContent      = fPrice(market.high24h);
  $('low-24h').textContent       = fPrice(market.low24h);
  $('vol-base').textContent      = fNum(market.volume);
  $('vol-quote').textContent     = '$' + fNum(market.quoteVolume);
  $('weighted-avg').textContent  = fPrice(market.weightedAvg);
  $('trade-count').textContent   = market.tradeCount ? fNum(market.tradeCount) : '—';
}

function renderOHLC(candles) {
  if (!candles || !candles.length) return;
  const last = candles[candles.length - 1];
  $('ohlc-o').textContent = fPrice(last.o);
  $('ohlc-h').textContent = fPrice(last.h);
  $('ohlc-l').textContent = fPrice(last.l);
  $('ohlc-c').textContent = fPrice(last.c);
}

function renderFunding(market) {
  const fr  = market.fundingRate;
  const sen = fundingSentiment(fr);

  const frEl = $('funding-rate');
  frEl.textContent = fRate(fr);
  frEl.className = sen.cls;

  $('funding-sentiment').textContent = sen.text;
  $('funding-sentiment').className   = 'fr-sub ' + sen.cls;

  $('open-interest').textContent   = market.openInterest ? fNum(market.openInterest) : '—';
  $('oi-value').textContent        = market.oiValue      ? '$' + fNum(market.oiValue): '—';
  $('interest-rate').textContent   = fRate(market.interestRate);
  $('funding-interval').textContent= market.fundingInterval ? market.fundingInterval + 'H' : '—';
  $('last-funding-rate').textContent= fRate(market.lastFundingRate);
  $('turnover-24h').textContent    = market.turnover24h ? '$' + fNum(market.turnover24h) : '—';

  startFundingCountdown(market.nextFunding);
}

function renderSR(levels, tf) {
  const container = $('sr-levels');
  $('sr-tf-badge').textContent = tf.toUpperCase();
  if (!levels) { container.innerHTML = '<div class="levels-placeholder">Could not calculate — insufficient kline data</div>'; return; }

  container.innerHTML = levels.map(l => `
    <div class="level-row ${l.type}">
      <span class="level-tag">${l.tag}</span>
      <span class="level-label">${l.label}</span>
      <span class="level-price">${fPrice(l.price)}</span>
      <span class="level-dist">${l.dist}</span>
    </div>
  `).join('');
}

function renderSupplyDemand(zones, tf) {
  const container = $('sd-zones');
  $('sd-tf-badge').textContent = tf.toUpperCase();
  if (!zones) { container.innerHTML = '<div class="levels-placeholder">Could not calculate — insufficient kline data</div>'; return; }

  const currentBadge = `<span class="zone-strength">◀ PRICE HERE</span>`;
  const isCurrent = (name) => zones.currentZone.includes(name.split(' ')[0]);

  container.innerHTML = `
    <div class="zone-row supply">
      <div class="zone-header">
        <span class="zone-name">SUPPLY ZONE ${isCurrent('SUPPLY') ? currentBadge : ''}</span>
        <span class="zone-strength">PREMIUM</span>
      </div>
      <div class="zone-range">${fPrice(zones.supply.low)} — ${fPrice(zones.supply.high)}</div>
      <div class="zone-desc">Distribution area — sellers likely active</div>
    </div>
    <div class="zone-row equilibrium">
      <div class="zone-header">
        <span class="zone-name">EQUILIBRIUM ${!isCurrent('SUPPLY') && !isCurrent('DEMAND') ? currentBadge : ''}</span>
        <span class="zone-strength">FAIR VALUE</span>
      </div>
      <div class="zone-range">${fPrice(zones.discount)} — ${fPrice(zones.premium)}</div>
      <div class="zone-desc">Mid-range — balanced supply/demand area</div>
    </div>
    <div class="zone-row demand">
      <div class="zone-header">
        <span class="zone-name">DEMAND ZONE ${isCurrent('DEMAND') ? currentBadge : ''}</span>
        <span class="zone-strength">DISCOUNT</span>
      </div>
      <div class="zone-range">${fPrice(zones.demand.low)} — ${fPrice(zones.demand.high)}</div>
      <div class="zone-desc">Accumulation area — buyers likely active</div>
    </div>
  `;
}

function renderLiquidity(zones) {
  const container = $('liq-zones');
  if (!zones || !zones.length) { container.innerHTML = '<div class="levels-placeholder">No data</div>'; return; }

  container.innerHTML = zones.slice(0, 8).map(z => `
    <div class="zone-row liquidity">
      <div class="zone-header">
        <span class="zone-name">${z.name}</span>
      </div>
      <div class="zone-range">${fPrice(z.price)}</div>
      <div class="zone-desc">${z.desc}</div>
    </div>
  `).join('');
}

function renderOrderBook(market) {
  const bids = market.bids || [];
  const asks = market.asks || [];

  // Asks (reversed — show closest first)
  const asksReversed = [...asks].reverse();
  $('ob-asks').innerHTML = asksReversed.map(([p,s]) => {
    const total = (p * s).toFixed(0);
    return `<div class="ob-row ask">
      <span>${fPrice(p)}</span>
      <span>${s.toFixed(4)}</span>
      <span>$${fNum(parseFloat(total))}</span>
    </div>`;
  }).join('') || '<div class="levels-placeholder">—</div>';

  // Bids
  $('ob-bids').innerHTML = bids.map(([p,s]) => {
    const total = (p * s).toFixed(0);
    return `<div class="ob-row bid">
      <span>${fPrice(p)}</span>
      <span>${s.toFixed(4)}</span>
      <span>$${fNum(parseFloat(total))}</span>
    </div>`;
  }).join('') || '<div class="levels-placeholder">—</div>';

  // Spread
  if (bids.length && asks.length) {
    const spread    = asks[0][0] - bids[0][0];
    const spreadPct = (spread / asks[0][0] * 100).toFixed(4);
    $('ob-spread').textContent     = fPrice(spread);
    $('ob-spread-pct').textContent = spreadPct + '%';
  }

  // Imbalance
  const bidVol = bids.reduce((s,[p,sz]) => s + p * sz, 0);
  const askVol = asks.reduce((s,[p,sz]) => s + p * sz, 0);
  const total  = bidVol + askVol;
  if (total > 0) {
    const bidPct = (bidVol / total * 100).toFixed(1);
    const askPct = (askVol / total * 100).toFixed(1);
    $('imb-bid').style.width     = bidPct + '%';
    $('imb-ask').style.width     = askPct + '%';
    $('imb-bid-pct').textContent = bidPct + '%';
    $('imb-ask-pct').textContent = askPct + '%';
  }
}

function renderMarketStats(gecko) {
  if (!gecko) return;
  $('market-cap').textContent   = gecko.marketCap  ? '$' + fNum(gecko.marketCap)  : '—';
  $('fdv').textContent          = gecko.fdv         ? '$' + fNum(gecko.fdv)        : '—';
  $('circ-supply').textContent  = gecko.circSupply  ? fNum(gecko.circSupply)       : '—';
  $('max-supply').textContent   = gecko.maxSupply   ? fNum(gecko.maxSupply)        : '∞';
  $('coin-ath').textContent     = fPrice(gecko.ath);
  $('coin-atl').textContent     = fPrice(gecko.atl);

  const athEl = $('coin-ath-change');
  athEl.textContent = gecko.athChange != null ? fPct(gecko.athChange) : '—';
  athEl.className   = 'pg-value ' + pctClass(gecko.athChange);

  const atlEl = $('coin-atl-change');
  atlEl.textContent = gecko.atlChange != null ? fPct(gecko.atlChange) : '—';
  atlEl.className   = 'pg-value ' + pctClass(gecko.atlChange);

  setTfcPct('pc-14d',  gecko.pc14d);
  setTfcPct('pc-30d',  gecko.pc30d);
  setTfcPct('pc-60d',  gecko.pc60d);
  setTfcPct('pc-200d', gecko.pc200d);
  setTfcPct('pc-1y',   gecko.pc1y);
}

function renderSocials(gecko) {
  if (!gecko?.links) return;
  const links = gecko.links;
  const grid  = $('socials-grid');
  grid.innerHTML = '';

  const add = (href, label) => {
    if (!href) return;
    const a = document.createElement('a');
    a.className   = 'social-link';
    a.href        = href;
    a.target      = '_blank';
    a.rel         = 'noopener';
    a.textContent = label;
    grid.appendChild(a);
  };

  add(links.homepage?.[0],             '🌐 WEBSITE');
  add(links.whitepaper,                '📄 WHITEPAPER');
  add(links.twitter_screen_name ? `https://twitter.com/${links.twitter_screen_name}` : null, '𝕏 TWITTER');
  add(links.subreddit_url,             '👾 REDDIT');
  add(links.repos_url?.github?.[0],    '⌨ GITHUB');
  add(links.blockchain_site?.[0],      '🔗 EXPLORER');
  add(links.official_forum_url?.[0],   '💬 FORUM');
}

function renderDescription(gecko) {
  if (!gecko?.description) return;
  const el     = $('coin-description');
  const toggle = $('desc-toggle');
  const text   = gecko.description.replace(/<[^>]+>/g, '');
  el.textContent = text;

  toggle.addEventListener('click', () => {
    el.classList.toggle('expanded');
    toggle.textContent = el.classList.contains('expanded') ? 'READ LESS' : 'READ MORE';
  });
}

/* ── SOURCE BAR ─────────────────────────────────────────────── */
function renderSourceBar(source, tf) {
  $('source-badge').textContent  = source;
  $('tf-badge').textContent      = tf.toUpperCase();
  $('updated-badge').textContent = nowStr();
  $('source-bar').style.display  = 'flex';
}

/* ══════════════════════════════════════════════════════════════
   MAIN FETCH — SINGLE COIN
══════════════════════════════════════════════════════════════ */
async function fetchCoin() {
  const ticker = $('coin-input').value.trim().toUpperCase();
  if (!ticker) return;
  const symbol = ticker + 'USDT';
  const tf     = STATE.singleTf;

  // UI: show loading — reset stale image immediately
  const _logo = $('coin-logo');
  _logo.onload  = null;
  _logo.onerror = null;
  _logo.src = '';
  _logo.style.display = 'none';

  $('empty-state').style.display   = 'none';
  $('error-state').style.display   = 'none';
  $('coin-grid').style.display     = 'none';
  $('source-bar').style.display    = 'none';
  $('loading-state').style.display = 'flex';
  $('loader-text').textContent     = 'CONNECTING TO BINANCE...';
  $('fetch-btn').classList.add('loading');
  setStatus('loading', 'FETCHING');

  let market = null;

  // 1. Try Binance
  try {
    $('loader-text').textContent = 'FETCHING FROM BINANCE...';
    market = await fetchBinance(symbol);
  } catch (e) {
    // 2. Fallback: Bybit
    try {
      $('loader-text').textContent = 'BINANCE FAILED — TRYING BYBIT...';
      market = await fetchBybit(symbol);
    } catch (e2) {
      $('loading-state').style.display = 'none';
      $('error-state').style.display   = 'flex';
      $('error-title').textContent     = 'FETCH FAILED';
      $('error-sub').textContent       = `Could not fetch "${ticker}" from Binance or Bybit. Check ticker.`;
      $('fetch-btn').classList.remove('loading');
      setStatus('error', 'ERROR');
      return;
    }
  }

  // If Binance was source, try to get orderbook from Bybit
  if (market.source === 'BINANCE' && (!market.bids.length)) {
    $('loader-text').textContent = 'FETCHING ORDER BOOK...';
    const ob = await fetchBybitOrderbook(symbol);
    market.bids = ob.bids;
    market.asks = ob.asks;
  }

  // 3. Fetch klines
  $('loader-text').textContent = `FETCHING ${tf.toUpperCase()} KLINES...`;
  const candles = await fetchKline(symbol, tf);

  // 4. Fetch CoinGecko
  $('loader-text').textContent = 'FETCHING GECKO DATA...';
  const gecko = await fetchGecko(ticker);

  // 5. Calculate levels
  const currentPrice = market.lastPrice;
  const pivots  = calcPivots(candles, currentPrice);
  const sdZones = calcSupplyDemand(candles, currentPrice);
  const liqZones = calcLiquidity(
    currentPrice, market.high24h, market.low24h,
    gecko?.ath, gecko?.atl
  );

  // 6. Render everything
  $('loading-state').style.display = 'none';
  $('coin-grid').style.display     = 'flex';

  renderCoinIdentity(gecko, ticker);
  renderPriceAction(market, gecko);
  renderOHLC(candles);
  renderFunding(market);
  renderSR(pivots, tf);
  renderSupplyDemand(sdZones, tf);
  renderLiquidity(liqZones);
  renderOrderBook(market);
  renderMarketStats(gecko);
  renderSocials(gecko);
  renderDescription(gecko);
  renderSourceBar(market.source, tf);

  $('fetch-btn').classList.remove('loading');
  setStatus('ok', 'LIVE');
}

/* ══════════════════════════════════════════════════════════════
   MARKET SCANNER
══════════════════════════════════════════════════════════════ */

async function fetchAllBinance() {
  const res  = await fetchWithTimeout(`${CFG.BINANCE_FAPI}/ticker/24hr`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Binance all tickers failed');

  return data
    .filter(t => t.symbol.endsWith('USDT'))
    .map(t => ({
      symbol      : t.symbol.replace('USDT',''),
      lastPrice   : parseFloat(t.lastPrice),
      changePct24h: parseFloat(t.priceChangePercent),
      high24h     : parseFloat(t.highPrice),
      low24h      : parseFloat(t.lowPrice),
      volume      : parseFloat(t.volume),
      quoteVolume : parseFloat(t.quoteVolume),
      tradeCount  : t.count,
      weightedAvg : parseFloat(t.weightedAvgPrice),
      fundingRate : null,
      openInterest: null,
      oiValue     : null,
      source      : 'BINANCE',
    }));
}

async function fetchAllBybit() {
  const res  = await fetchWithTimeout(`${CFG.BYBIT_API}/tickers?category=linear`);
  const data = await res.json();
  if (data.retCode !== 0) throw new Error('Bybit all tickers failed');

  return data.result.list
    .filter(t => t.symbol.endsWith('USDT'))
    .map(t => ({
      symbol      : t.symbol.replace('USDT',''),
      lastPrice   : parseFloat(t.lastPrice),
      changePct24h: parseFloat(t.price24hPcnt) * 100,
      high24h     : parseFloat(t.highPrice24h),
      low24h      : parseFloat(t.lowPrice24h),
      volume      : parseFloat(t.volume24h),
      quoteVolume : parseFloat(t.turnover24h),
      tradeCount  : null,
      weightedAvg : null,
      fundingRate : parseFloat(t.fundingRate),
      openInterest: parseFloat(t.openInterest),
      oiValue     : parseFloat(t.openInterestValue),
      source      : 'BYBIT',
    }));
}

async function runScanner() {
  $('scanner-empty').style.display         = 'none';
  $('scanner-table-wrapper').style.display = 'none';
  $('scanner-nav').style.display           = 'none';
  $('scanner-stats-bar').style.display     = 'none';
  $('scanner-loading').style.display       = 'flex';
  $('scanner-loader-text').textContent     = `SCANNING ${STATE.scannerSource.toUpperCase()} MARKET...`;
  $('scanner-fetch-btn').classList.add('loading');
  setStatus('loading', 'SCANNING');

  try {
    let coins;

    if (STATE.scannerSource === 'binance') {
      try {
        coins = await fetchAllBinance();
      } catch(_) {
        $('scanner-loader-text').textContent = 'BINANCE FAILED — TRYING BYBIT...';
        coins = await fetchAllBybit();
      }
    } else {
      try {
        coins = await fetchAllBybit();
      } catch(_) {
        $('scanner-loader-text').textContent = 'BYBIT FAILED — TRYING BINANCE...';
        coins = await fetchAllBinance();
      }
    }

    STATE.scannerData = coins;

    // Stats bar
    $('scan-count').textContent   = coins.length + ' PAIRS';
    $('scan-source').textContent  = coins[0]?.source || STATE.scannerSource.toUpperCase();
    $('scan-updated').textContent = nowStr();
    $('scanner-stats-bar').style.display = 'flex';

    $('scanner-loading').style.display       = 'none';
    $('scanner-nav').style.display           = 'flex';
    $('scanner-table-wrapper').style.display = 'block';

    renderScannerCategory();
    setStatus('ok', 'SCAN COMPLETE');
  } catch(e) {
    $('scanner-loading').style.display = 'none';
    $('scanner-empty').style.display   = 'flex';
    $('scanner-empty').querySelector('.empty-title').textContent = 'SCAN FAILED';
    $('scanner-empty').querySelector('.empty-sub').textContent   = e.message;
    setStatus('error', 'ERROR');
  }

  $('scanner-fetch-btn').classList.remove('loading');
}

/* ── SCANNER CATEGORY RENDERERS ─────────────────────────────── */
const SCANNER_CONFIGS = {
  gainers: {
    label  : '▲ TOP GAINERS',
    sort   : (a,b) => b.changePct24h - a.changePct24h,
    limit  : 30,
    headers: ['#','SYMBOL','PRICE','24H CHANGE','24H HIGH','24H LOW','VOLUME (USDT)'],
    row    : (c, i) => [
      i+1, c.symbol,
      fPrice(c.lastPrice),
      { text: fPct(c.changePct24h), cls: pctClass(c.changePct24h) + ' change-cell' },
      fPrice(c.high24h),
      fPrice(c.low24h),
      '$' + fNum(c.quoteVolume),
    ],
    rowCls : c => c.changePct24h >= 10 ? 'top-gainer' : '',
  },
  losers: {
    label  : '▼ TOP LOSERS',
    sort   : (a,b) => a.changePct24h - b.changePct24h,
    limit  : 30,
    headers: ['#','SYMBOL','PRICE','24H CHANGE','24H HIGH','24H LOW','VOLUME (USDT)'],
    row    : (c, i) => [
      i+1, c.symbol,
      fPrice(c.lastPrice),
      { text: fPct(c.changePct24h), cls: pctClass(c.changePct24h) + ' change-cell' },
      fPrice(c.high24h),
      fPrice(c.low24h),
      '$' + fNum(c.quoteVolume),
    ],
    rowCls : c => c.changePct24h <= -10 ? 'top-loser' : '',
  },
  volume: {
    label  : '◈ VOLUME LEADERS',
    sort   : (a,b) => b.quoteVolume - a.quoteVolume,
    limit  : 30,
    headers: ['#','SYMBOL','PRICE','VOLUME (USDT)','VOLUME (BASE)','TRADES','24H CHANGE'],
    row    : (c, i) => [
      i+1, c.symbol,
      fPrice(c.lastPrice),
      '$' + fNum(c.quoteVolume),
      fNum(c.volume),
      c.tradeCount ? fNum(c.tradeCount) : '—',
      { text: fPct(c.changePct24h), cls: pctClass(c.changePct24h) + ' change-cell' },
    ],
    rowCls : () => '',
  },
  funding: {
    label  : '⚡ FUNDING EXTREMES',
    sort   : (a,b) => Math.abs(b.fundingRate||0) - Math.abs(a.fundingRate||0),
    limit  : 40,
    filter : c => c.fundingRate != null,
    headers: ['#','SYMBOL','PRICE','FUNDING RATE','SENTIMENT','OI VALUE','24H CHANGE'],
    row    : (c, i) => {
      const fr  = c.fundingRate;
      const sen = fundingSentiment(fr);
      const frCls = fr > 0 ? 'funding-positive' : fr < 0 ? 'funding-negative' : 'funding-neutral';
      return [
        i+1, c.symbol,
        fPrice(c.lastPrice),
        { text: fRate(fr), cls: frCls },
        { text: sen.text, cls: sen.cls },
        c.oiValue ? '$' + fNum(c.oiValue) : '—',
        { text: fPct(c.changePct24h), cls: pctClass(c.changePct24h) + ' change-cell' },
      ];
    },
    rowCls : () => '',
  },
  oi: {
    label  : '◉ OPEN INTEREST',
    sort   : (a,b) => (b.oiValue||0) - (a.oiValue||0),
    limit  : 30,
    filter : c => c.oiValue != null && c.oiValue > 0,
    headers: ['#','SYMBOL','PRICE','OI VALUE (USD)','OI (COINS)','FUNDING RATE','24H CHANGE'],
    row    : (c, i) => [
      i+1, c.symbol,
      fPrice(c.lastPrice),
      '$' + fNum(c.oiValue),
      fNum(c.openInterest),
      c.fundingRate != null ? { text: fRate(c.fundingRate), cls: c.fundingRate > 0 ? 'funding-positive' : 'funding-negative' } : '—',
      { text: fPct(c.changePct24h), cls: pctClass(c.changePct24h) + ' change-cell' },
    ],
    rowCls : () => '',
  },
  momentum: {
    label  : '⟶ MOMENTUM (>3% + HIGH VOL)',
    sort   : (a,b) => b.changePct24h - a.changePct24h,
    limit  : 30,
    filter : c => {
      const avgVol = 1000000;
      return Math.abs(c.changePct24h) >= 3 && c.quoteVolume >= avgVol;
    },
    headers: ['#','SYMBOL','PRICE','24H CHANGE','VOLUME (USDT)','HIGH','LOW'],
    row    : (c, i) => [
      i+1, c.symbol,
      fPrice(c.lastPrice),
      { text: fPct(c.changePct24h), cls: pctClass(c.changePct24h) + ' change-cell' },
      '$' + fNum(c.quoteVolume),
      fPrice(c.high24h),
      fPrice(c.low24h),
    ],
    rowCls : c => c.changePct24h >= 5 ? 'top-gainer' : c.changePct24h <= -5 ? 'top-loser' : '',
  },
};

function renderScannerCategory() {
  const cfg  = SCANNER_CONFIGS[STATE.scannerCategory];
  if (!cfg || !STATE.scannerData.length) return;

  let data = [...STATE.scannerData];
  if (cfg.filter) data = data.filter(cfg.filter);
  data.sort(cfg.sort);
  data = data.slice(0, cfg.limit);

  // Headers
  const thead = $('scanner-thead');
  thead.innerHTML = `<tr>${cfg.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

  // Rows
  const tbody = $('scanner-tbody');
  tbody.innerHTML = data.map((coin, i) => {
    const cells = cfg.row(coin, i);
    const rowCls = cfg.rowCls(coin);
    const tds = cells.map((cell, ci) => {
      if (ci === 1) return `<td class="symbol-cell">${cell}</td>`;
      if (ci === 0) return `<td class="rank-cell">${cell}</td>`;
      if (typeof cell === 'object' && cell.text !== undefined) {
        return `<td class="${cell.cls || ''}">${cell.text}</td>`;
      }
      return `<td>${cell}</td>`;
    }).join('');
    return `<tr class="${rowCls}" data-symbol="${coin.symbol}" title="Click to view ${coin.symbol}">${tds}</tr>`;
  }).join('');

  // Click row → switch to single coin view
  tbody.querySelectorAll('tr[data-symbol]').forEach(row => {
    row.addEventListener('click', () => {
      const sym = row.dataset.symbol;
      $('coin-input').value = sym;

      // Switch to single tab
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="single"]').classList.add('active');
      $('tab-single').classList.add('active');

      fetchCoin();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
function init() {
  startClock();
  initTabs();
  initTfSelectors();
  initSourceToggle();
  initScannerTabs();

  // Fetch button — single coin
  $('fetch-btn').addEventListener('click', fetchCoin);

  // Enter key on input
  $('coin-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') fetchCoin();
  });

  // Scanner fetch
  $('scanner-fetch-btn').addEventListener('click', runScanner);

  // Description toggle init
  $('desc-toggle').addEventListener('click', () => {
    const el = $('coin-description');
    el.classList.toggle('expanded');
    $('desc-toggle').textContent = el.classList.contains('expanded') ? 'READ LESS' : 'READ MORE';
  });
}

document.addEventListener('DOMContentLoaded', init);
