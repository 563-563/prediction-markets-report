/* ============================================
   BLOCMATES INTERACTIVE REPORTS - App JS
   Charts, interactions, scroll animations
   ============================================ */

// --- Constants ---
const DATA_PATH = 'prediction-markets/';
const BM = {
  black: '#1f1f1f',
  blue: '#253f58',
  green: '#80a76a',
  red: '#aa4946',
  gold: '#e6a93e',
  grey: '#444342',
  cream: '#ede6dd',
  blueLight: '#4a7a9b',
  greenLight: '#9cc085',
  redLight: '#c46560',
  goldLight: '#f0c060',
  creamFaded: 'rgba(237,230,221,0.5)',
  gridColor: 'rgba(237,230,221,0.06)',
  gridColorLight: 'rgba(237,230,221,0.1)',
  // Platform brand colors
  poly: '#2f5cff',
  polyLight: '#93aaff',
  kalshi: '#00de95',
  kalshiDark: '#004830',
  kalshiLight: '#66ebbe',
  opinion: '#fe5915',
  limitless: '#dbf494',
  limitlessLight: '#a4b770',
  uma: '#fe4a49',
};

// --- Chart.js Global Defaults ---
Chart.defaults.font.family = "'Inter', Arial, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.font.weight = 300;
Chart.defaults.color = BM.creamFaded;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(31,31,31,0.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(237,230,221,0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.titleFont = { family: "'Poppins', sans-serif", weight: 700, size: 13 };
Chart.defaults.plugins.tooltip.bodyFont = { family: "'Inter', sans-serif", weight: 300, size: 12 };
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 5;
Chart.defaults.elements.line.tension = 0.3;
Chart.defaults.elements.line.borderWidth = 2;
Chart.defaults.scale.grid = { color: BM.gridColor };
Chart.defaults.scale.border = { color: BM.gridColor };
Chart.defaults.layout = { padding: { left: 4, right: 12, top: 8, bottom: 4 } };
Chart.defaults.scale.ticks = { ...Chart.defaults.scale.ticks, padding: 6 };
// Disable animation to force synchronous drawing (prevents blank charts when canvas is off-screen or in hidden container)
Chart.defaults.animation = false;
// Fix Chart.js 4.4.7 bug: bar elements get base=NaN in responsive mode,
// preventing first-dataset bars from rendering. This plugin patches the base
// from the scale's basePixel before each draw.
Chart.register({
  id: 'fixBarBase',
  beforeDraw(chart) {
    for (const meta of chart.getSortedVisibleDatasetMetas()) {
      if (meta.type !== 'bar') continue;
      const scale = meta.vScale;
      if (!scale) continue;
      const basePixel = scale.getBasePixel();
      if (isNaN(basePixel)) continue;
      for (const bar of meta.data) {
        if (isNaN(bar.base)) bar.base = basePixel;
      }
    }
  }
});

// --- Utility: Parse CSV ---
function loadCSV(filename) {
  // Encode special chars like # in filenames for URL safety
  const url = DATA_PATH + filename.split('/').map(part => encodeURIComponent(part)).join('/');
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
}

// --- Utility: Format numbers ---
function fmtM(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function fmtK(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Shared scale config
function timeXAxis(skipLabels = 4) {
  return {
    ticks: {
      maxTicksLimit: 12,
      callback: function(val, idx) {
        if (idx % skipLabels !== 0) return '';
        return this.getLabelForValue(val);
      }
    }
  };
}

// --- HiDPI canvas helper ---
function setupHiDPICanvas(canvas, logicalW, logicalH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalW * dpr;
  canvas.height = logicalH * dpr;
  canvas.style.width = logicalW + 'px';
  canvas.style.height = logicalH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: logicalW, h: logicalH };
}

// --- Shared platform color map (case-insensitive lookup) ---
function platformColor(name) {
  const key = (name || '').toLowerCase();
  const map = {
    polymarket: BM.poly, kalshi: BM.kalshi, opinion: BM.opinion,
    limitless: BM.limitless, uma: BM.uma,
  };
  return map[key] || BM.gold;
}

// --- Store chart instances for toggling ---
const charts = {};
const chartData = {};

// ============ INIT ============

// Map canvas IDs to their builder functions
const chartBuilders = {
  volumeChart: buildVolumeChart,
  institutionalChart: buildInstitutionalChart,
  hhiChart: buildHHIChart,
  disputeChart: buildDisputeChart,
  breadthChart: buildBreadthChart,
  kalshiSportsChart: buildKalshiSportsChart,
  decileChart: buildDecileChart,
  concentrationChart: buildConcentrationChart,
  tradersChart: buildTradersChart,
  whaleChart: buildWhaleChart,
  kalshiTakerChart: buildKalshiTakerChart,
  polyTakerChart: buildPolyTakerChart,
  settlementSpreadChart: buildSettlementSpreadChart,
  settlementImpactChart: buildSettlementImpactChart,
  calibrationChart: buildCalibrationChart,
  displacementChart: buildDisplacementChart,
  tradeSizeChart: buildTradeSizeChart,
  disputeRateChart: buildDisputeRateChart,
  decileChart2: buildDecileChart2,
};

document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initNavigation();
  initArchetypeCards();
  initReportWidgets();

  // Lazy-init charts: only build when canvas scrolls into view
  const chartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const canvasId = entry.target.id;
        const builder = chartBuilders[canvasId];
        if (builder) {
          chartObserver.unobserve(entry.target);
          builder().catch(e => console.error(`Chart build error (${canvasId}):`, e));
        }
      }
    });
  }, { rootMargin: '200px 0px' }); // Start building 200px before visible

  Object.keys(chartBuilders).forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas) chartObserver.observe(canvas);
  });
});

// ============ SCROLL ANIMATIONS ============
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // Reading progress
  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = Math.min(scrollTop / docHeight * 100, 100);
    document.getElementById('readingProgress').style.width = progress + '%';
  });
}

// ============ NAVIGATION ============
function initNavigation() {
  const nav = document.getElementById('reportNav');
  const viewBar = document.getElementById('viewBar');
  const heroBottom = document.querySelector('.hero').offsetHeight;

  window.addEventListener('scroll', () => {
    if (window.scrollY > heroBottom - 100) {
      nav.classList.add('visible');
      if (viewBar) viewBar.style.opacity = '0';
      if (viewBar) viewBar.style.pointerEvents = 'none';
    } else {
      nav.classList.remove('visible');
      if (viewBar) viewBar.style.opacity = '1';
      if (viewBar) viewBar.style.pointerEvents = '';
    }
  });

  // Active section tracking
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const link = document.querySelector(`.nav-links a[data-section="${entry.target.id}"]`);
        if (link) link.classList.add('active');
      }
    });
  }, { threshold: 0.01, rootMargin: '-100px 0px -60% 0px' });

  sections.forEach(s => sectionObserver.observe(s));
}

// ============ ARCHETYPE CARDS ============
function initArchetypeCards() {
  document.querySelectorAll('.archetype-card').forEach(card => {
    card.addEventListener('click', () => {
      const wasActive = card.classList.contains('active');
      document.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('active'));
      if (!wasActive) card.classList.add('active');
    });
  });
}

// ============ CHART TOGGLE BUTTONS ============
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.chart-btn');
  if (!btn) return;

  const chartId = btn.dataset.chart;
  const view = btn.dataset.view;

  // Update active button
  btn.parentElement.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Update chart
  if (chartId === 'volumeChart') toggleVolumeChart(view);
  if (chartId === 'kalshiSportsChart') toggleKalshiSportsChart(view);
  if (chartId === 'decileChart') toggleDecileChart(view);
  if (chartId === 'decileChart2') toggleDecileChart2(view);
  if (chartId === 'db-decileChart') toggleDbDecileChart(view);
  if (chartId === 'db-cohortChart') toggleDbCohort(view);
  if (chartId === 'db-calExtremesChart') toggleDbCalExtremes(view);
  if (chartId === 'rptFeeCompChart') toggleRptFeeChart(view);
});

// ============ CHARTS ============

// 1. Weekly Volume (Stacked Bar + Market Share)
async function buildVolumeChart() {
  const raw = await loadCSV('6767119_s1-01_prediction_markets_weekly_volume_(usd_spent).csv');

  const weeks = [...new Set(raw.map(r => r.week))];
  const platforms = [...new Set(raw.map(r => r.platform))];
  const labels = weeks.map(fmtDate);

  // Build per-platform data
  const platformData = {};
  platforms.forEach(p => {
    platformData[p] = weeks.map(w => {
      const row = raw.find(r => r.week === w && r.platform === p);
      return row ? row.volume_usd : 0;
    });
  });

  chartData.volume = { labels, platformData, platforms, weeks };

  const datasets = platforms.map(p => ({
    label: p,
    data: platformData[p],
    backgroundColor: platformColor(p) + 'cc',
    borderRadius: 2,
    minBarLength: 3,
  }));

  charts.volumeChart = new Chart(document.getElementById('volumeChart'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtM(ctx.raw)}` },
        },
      },
      scales: {
        x: { stacked: true, ...timeXAxis(6) },
        y: { stacked: true, ticks: { callback: (v) => fmtM(v) } },
      },
    },
  });
}

function toggleVolumeChart(view) {
  const chart = charts.volumeChart;
  const d = chartData.volume;
  if (view === 'share') {
    const totals = d.weeks.map((_, i) => d.platforms.reduce((sum, p) => sum + d.platformData[p][i], 0));
    d.platforms.forEach((p, pi) => {
      chart.data.datasets[pi].data = d.platformData[p].map((v, i) => totals[i] ? (v / totals[i] * 100) : 0);
    });
    chart.options.scales.y.ticks.callback = (v) => v.toFixed(0) + '%';
    chart.options.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`;
  } else {
    d.platforms.forEach((p, pi) => {
      chart.data.datasets[pi].data = d.platformData[p];
    });
    chart.options.scales.y.ticks.callback = (v) => fmtM(v);
    chart.options.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${fmtM(ctx.raw)}`;
  }
  chart.update();
}

// 2. Institutional-Grade Markets
async function buildInstitutionalChart() {
  const raw = await loadCSV('6783201_s6-01_institutional-grade_markets_$10k_within_1¢_impact.csv');

  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rowA = raw.find(r => r.quarter === a);
    const rowB = raw.find(r => r.quarter === b);
    return (rowA?.quarter_order || 0) - (rowB?.quarter_order || 0);
  });

  const kalshi = quarters.map(q => {
    const row = raw.find(r => r.quarter === q && r.platform === 'kalshi');
    return row ? row.markets_under_1c : 0;
  });
  const poly = quarters.map(q => {
    const row = raw.find(r => r.quarter === q && r.platform === 'polymarket');
    return row ? row.markets_under_1c : 0;
  });

  new Chart(document.getElementById('institutionalChart'), {
    type: 'bar',
    data: {
      labels: quarters,
      datasets: [
        { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3, minBarLength: 3 },
        { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3, minBarLength: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} markets` },
        },
      },
      scales: {
        x: { ...timeXAxis(1) },
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'Markets with <1¢ Impact', color: BM.creamFaded },
          ticks: {
            callback: (v) => {
              if ([1, 5, 10, 50, 100, 500, 1000, 5000, 10000].includes(v)) return v.toLocaleString();
              return '';
            },
          },
        },
      },
    },
  });
}

// 3. HHI Concentration
async function buildHHIChart() {
  const raw = await loadCSV('6783209_s6-23_hhi_concentration_over_time.csv');

  const years = [...new Set(raw.map(r => r.year))].sort();
  const kalshi = years.map(y => {
    const row = raw.find(r => r.year === y && r.platform === 'kalshi');
    return row ? row.hhi : null;
  });
  const poly = years.map(y => {
    const row = raw.find(r => r.year === y && r.platform === 'polymarket');
    return row ? row.hhi : null;
  });

  new Chart(document.getElementById('hhiChart'), {
    type: 'line',
    data: {
      labels: years.map(String),
      datasets: [
        { label: 'Polymarket', data: poly, borderColor: BM.poly, backgroundColor: BM.poly + '20', fill: true, spanGaps: true },
        { label: 'Kalshi', data: kalshi, borderColor: BM.kalshi, backgroundColor: BM.kalshi + '20', fill: true, spanGaps: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw?.toFixed(0) ?? 'N/A'} HHI` },
        },
      },
      scales: {
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'HHI Index', color: BM.creamFaded },
          ticks: {
            callback: (v) => {
              if ([10, 100, 500, 1000, 2000].includes(v)) return v.toLocaleString();
              return '';
            },
          },
        },
      },
    },
  });
}

// 4. UMA Disputes
async function buildDisputeChart() {
  const raw = await loadCSV('6767166_s4-18_uma_dispute_resolution_disputes_over_time.csv');

  const labels = raw.map(r => fmtDate(r.week));
  const disputes = raw.map(r => r.disputes);
  const cumulative = raw.map(r => r.cumulative_disputes);

  new Chart(document.getElementById('disputeChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Weekly Disputes', data: disputes, borderColor: BM.uma, backgroundColor: BM.uma + '40', fill: true, tension: 0.2, pointRadius: 0, pointHoverRadius: 4, yAxisID: 'y' },
        { label: 'Cumulative', data: cumulative, borderColor: BM.gold, backgroundColor: 'transparent', fill: false, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ...timeXAxis(6) },
        y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Weekly', color: BM.creamFaded } },
        y1: { position: 'right', beginAtZero: true, title: { display: true, text: 'Cumulative', color: BM.creamFaded }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

// 5. Market Breadth
async function buildBreadthChart() {
  const raw = await loadCSV('6783207_s6-17_market_breadth_qualifying_markets_($1k_liquidity_threshold).csv');

  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rowA = raw.find(r => r.quarter === a);
    const rowB = raw.find(r => r.quarter === b);
    return (rowA?.quarter_order || 0) - (rowB?.quarter_order || 0);
  }).filter(q => q !== '2025 Q4');

  const kalshi = quarters.map(q => {
    const row = raw.find(r => r.quarter === q && r.platform === 'kalshi');
    return row ? row.qualifying_markets : 0;
  });
  const poly = quarters.map(q => {
    const row = raw.find(r => r.quarter === q && r.platform === 'polymarket');
    return row ? row.qualifying_markets : 0;
  });

  new Chart(document.getElementById('breadthChart'), {
    type: 'bar',
    data: {
      labels: quarters,
      datasets: [
        { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3, minBarLength: 3 },
        { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3, minBarLength: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} markets` },
        },
      },
      scales: {
        x: { ...timeXAxis(1) },
        y: {
          type: 'logarithmic',
          ticks: {
            callback: (v) => {
              if ([10, 50, 100, 500, 1000, 5000, 10000, 20000].includes(v)) return v.toLocaleString();
              return '';
            },
          },
        },
      },
    },
  });
}

// 6. Kalshi Sports Volume
async function buildKalshiSportsChart() {
  const raw = await loadCSV('6767133_s2-12_kalshi_sports_vs_non-sports_volume_share.csv');

  const weeks = [...new Set(raw.map(r => r.week))];
  const sports = weeks.map(w => {
    const row = raw.find(r => r.week === w && r.market_type === 'Sports');
    return row ? row.volume_usd : 0;
  });
  const nonSports = weeks.map(w => {
    const row = raw.find(r => r.week === w && r.market_type === 'Non-Sports');
    return row ? row.volume_usd : 0;
  });

  const labels = weeks.map(fmtDate);

  chartData.kalshiSports = { labels, sports, nonSports };

  charts.kalshiSportsChart = new Chart(document.getElementById('kalshiSportsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Non-Sports', data: nonSports, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 2 },
        { label: 'Sports', data: sports, backgroundColor: BM.kalshi + 'cc', borderRadius: 2 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtM(ctx.raw)}` },
        },
      },
      scales: {
        x: { stacked: true, ...timeXAxis(6) },
        y: { stacked: true, ticks: { callback: (v) => fmtM(v) } },
      },
    },
  });
}

function toggleKalshiSportsChart(view) {
  const chart = charts.kalshiSportsChart;
  const d = chartData.kalshiSports;
  if (view === 'relative') {
    const totals = d.sports.map((s, i) => s + d.nonSports[i]);
    chart.data.datasets[0].data = d.nonSports.map((ns, i) => totals[i] ? (ns / totals[i] * 100) : 0);
    chart.data.datasets[1].data = d.sports.map((s, i) => totals[i] ? (s / totals[i] * 100) : 0);
    chart.options.scales.y.ticks.callback = (v) => v.toFixed(0) + '%';
    chart.options.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%`;
  } else {
    chart.data.datasets[0].data = d.nonSports;
    chart.data.datasets[1].data = d.sports;
    chart.options.scales.y.ticks.callback = (v) => fmtM(v);
    chart.options.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${fmtM(ctx.raw)}`;
  }
  chart.update();
}

// 7. Displacement by Decile (Clustered Bar with YoY / Platform toggle)
async function buildDecileChart() {
  const raw = await loadCSV('6783202_s6-14_the_execution_cliff_displacement_by_market_decile_(q4_2024_vs_2025).csv');

  const deciles = [...new Set(raw.map(r => r.decile))].sort((a, b) => {
    const rowA = raw.find(r => r.decile === a);
    const rowB = raw.find(r => r.decile === b);
    return (rowA?.decile_order || 0) - (rowB?.decile_order || 0);
  });

  // Build lookup: series → decile → value
  const seriesNames = [...new Set(raw.map(r => r.series))];
  const lookup = {};
  raw.forEach(r => {
    if (!lookup[r.series]) lookup[r.series] = {};
    lookup[r.series][r.decile] = r.median_1k_impact_cents;
  });

  // Store all data for toggling
  chartData.decile = { deciles, lookup, seriesNames };

  // Helper to build datasets by key list
  function decileDS(key, color) {
    return { label: key, data: deciles.map(d => lookup[key]?.[d] ?? null), backgroundColor: color, borderRadius: 3 };
  }

  // Default: show all 4 series
  charts.decileChart = new Chart(document.getElementById('decileChart'), {
    type: 'bar',
    data: {
      labels: deciles,
      datasets: [
        decileDS('kalshi Q4 2024', BM.kalshi + 'cc'),
        decileDS('kalshi Q4 2025', BM.kalshiLight + 'cc'),
        decileDS('polymarket Q4 2024', BM.poly + 'cc'),
        decileDS('polymarket Q4 2025', BM.polyLight + 'cc'),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw?.toFixed(2) ?? 'N/A'}¢ impact` },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Median $1K Impact (cents)', color: BM.creamFaded },
          ticks: { callback: (v) => v + '¢' },
        },
      },
    },
  });
}

function toggleDecileChart(view) {
  const chart = charts.decileChart;
  const d = chartData.decile;
  const ds = (key, color) => ({ label: key, data: d.deciles.map(dec => d.lookup[key]?.[dec] ?? null), backgroundColor: color, borderRadius: 3 });

  const views = {
    all: [
      ds('kalshi Q4 2024', BM.kalshi + 'cc'),
      ds('kalshi Q4 2025', BM.kalshiLight + 'cc'),
      ds('polymarket Q4 2024', BM.poly + 'cc'),
      ds('polymarket Q4 2025', BM.polyLight + 'cc'),
    ],
    kalshi_yoy: [
      ds('kalshi Q4 2024', BM.kalshi + 'cc'),
      ds('kalshi Q4 2025', BM.kalshiLight + 'cc'),
    ],
    poly_yoy: [
      ds('polymarket Q4 2024', BM.poly + 'cc'),
      ds('polymarket Q4 2025', BM.polyLight + 'cc'),
    ],
    '2024_platform': [
      ds('kalshi Q4 2024', BM.kalshi + 'cc'),
      ds('polymarket Q4 2024', BM.poly + 'cc'),
    ],
    '2025_platform': [
      ds('kalshi Q4 2025', BM.kalshi + 'cc'),
      ds('polymarket Q4 2025', BM.poly + 'cc'),
    ],
  };

  chart.data.datasets = views[view] || views.all;
  chart.update();
}

// 8. Volume Concentration (Power Law)
async function buildConcentrationChart() {
  const raw = await loadCSV('6783208_s6-22_volume_concentration_power_law_distribution.csv');

  const buckets = [...new Set(raw.map(r => r.percentile_bucket))];
  const kalshi = buckets.map(b => {
    const row = raw.find(r => r.percentile_bucket === b && r.platform === 'kalshi');
    return row ? row.pct_of_total : 0;
  });
  const poly = buckets.map(b => {
    const row = raw.find(r => r.percentile_bucket === b && r.platform === 'polymarket');
    return row ? row.pct_of_total : 0;
  });

  new Chart(document.getElementById('concentrationChart'), {
    type: 'bar',
    data: {
      labels: buckets,
      datasets: [
        { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3 },
        { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}% of volume` },
        },
      },
      scales: {
        y: { min: 0, beginAtZero: true, ticks: { callback: (v) => v + '%' } },
      },
    },
  });
}

// 9. New vs Returning Traders
async function buildTradersChart() {
  const raw = await loadCSV('6767144_s5-23_polymarket_new_vs_returning_traders_(weekly).csv');

  const labels = raw.map(r => fmtDate(r.week));
  const newT = raw.map(r => r.new_traders);
  const retT = raw.map(r => r.returning_traders);

  new Chart(document.getElementById('tradersChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Returning', data: retT, backgroundColor: BM.poly, barPercentage: 1.0, categoryPercentage: 1.0 },
        { label: 'New', data: newT, backgroundColor: BM.polyLight, barPercentage: 1.0, categoryPercentage: 1.0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtK(ctx.raw)} traders` },
        },
      },
      scales: {
        x: { stacked: true, ...timeXAxis(6) },
        y: { stacked: true, min: 0, ticks: { callback: (v) => fmtK(v) } },
      },
    },
  });
}

// 10. Whale Dominance
async function buildWhaleChart() {
  const raw = await loadCSV('6767146_s5-24_polymarket_trader_concentration_(whale_dominance).csv');

  const labels = raw.map(r => fmtDate(r.week));
  const top10 = raw.map(r => r.top_10_pct);
  const top50 = raw.map(r => r.top_50_pct);
  const top100 = raw.map(r => r.top_100_pct);

  new Chart(document.getElementById('whaleChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Top 10 Traders', data: top10, borderColor: BM.poly, backgroundColor: BM.poly + '15', fill: true },
        { label: 'Top 50 Traders', data: top50, borderColor: BM.polyLight, backgroundColor: BM.polyLight + '10', fill: true },
        { label: 'Top 100 Traders', data: top100, borderColor: BM.gold, backgroundColor: BM.gold + '10', fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}% of volume` },
        },
      },
      scales: {
        x: { ...timeXAxis(6) },
        y: {
          min: 0, max: 100,
          ticks: { callback: (v) => v + '%' },
        },
      },
    },
  });
}

// 11. Kalshi Taker YES/NO Ratio
async function buildKalshiTakerChart() {
  const raw = await loadCSV('6783188_s6-18_kalshi_taker_yesno_ratio_by_year.csv');

  const labels = raw.map(r => String(r.year));
  const ratios = raw.map(r => r.yes_no_ratio);

  new Chart(document.getElementById('kalshiTakerChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'YES/NO Ratio',
          data: ratios,
          backgroundColor: BM.kalshi + 'cc',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `YES/NO Ratio: ${ctx.raw.toFixed(2)}x` },
        },
        annotation: {
          annotations: {
            parityLine: {
              type: 'line',
              yMin: 1,
              yMax: 1,
              borderColor: BM.creamFaded,
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                display: true,
                content: '1.0x parity',
                position: 'start',
                color: BM.creamFaded,
                font: { size: 11, family: "'Inter', sans-serif" },
                backgroundColor: 'transparent',
              },
            },
          },
        },
      },
      scales: {
        y: {
          ticks: { callback: (v) => v.toFixed(1) + 'x' },
          title: { display: true, text: 'YES/NO Taker Ratio', color: BM.creamFaded },
        },
      },
    },
  });
}

// 12. Polymarket Taker Buy/Sell Ratio (Annual)
async function buildPolyTakerChart() {
  const raw = await loadCSV('6783191_s6-21_polymarket_taker_volume_buy_vs_sell.csv');

  const years = [...new Set(raw.map(r => r.year))].sort();
  const ratios = years.map(y => {
    const buyRow = raw.find(r => r.year === y && r.metric === 'taker_buy_vol_b');
    const sellRow = raw.find(r => r.year === y && r.metric === 'taker_sell_vol_b');
    const buy = buyRow ? buyRow.value : 0;
    const sell = sellRow ? sellRow.value : 0;
    return sell > 0 ? buy / sell : 0;
  });

  new Chart(document.getElementById('polyTakerChart'), {
    type: 'bar',
    data: {
      labels: years.map(String),
      datasets: [
        {
          label: 'BUY/SELL Ratio',
          data: ratios,
          backgroundColor: BM.poly + 'cc',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `BUY/SELL Ratio: ${ctx.raw.toFixed(2)}x` },
        },
        annotation: {
          annotations: {
            parityLine: {
              type: 'line',
              yMin: 1,
              yMax: 1,
              borderColor: BM.creamFaded,
              borderWidth: 1.5,
              borderDash: [6, 4],
              label: {
                display: true,
                content: '1.0x parity',
                position: 'start',
                color: BM.creamFaded,
                font: { size: 11, family: "'Inter', sans-serif" },
                backgroundColor: 'transparent',
              },
            },
          },
        },
      },
      scales: {
        y: {
          ticks: { callback: (v) => v.toFixed(1) + 'x' },
          title: { display: true, text: 'BUY/SELL Taker Ratio', color: BM.creamFaded },
        },
      },
    },
  });
}

// 13a. Settlement Curve - Spread
async function buildSettlementSpreadChart() {
  const raw = await loadCSV('6823819_s7-2_settlement_curve_spread_widening_approaching_resolution.csv');

  const buckets = [...new Set(raw.map(r => r.settle_bucket))].sort((a, b) => {
    const rowA = raw.find(r => r.settle_bucket === a);
    const rowB = raw.find(r => r.settle_bucket === b);
    return (rowA?.bucket_order || 0) - (rowB?.bucket_order || 0);
  });

  const kalshiSpread = buckets.map(b => {
    const row = raw.find(r => r.settle_bucket === b && r.platform === 'kalshi');
    return row ? row.avg_spread_cents : null;
  });
  const polySpread = buckets.map(b => {
    const row = raw.find(r => r.settle_bucket === b && r.platform === 'polymarket');
    return row ? row.avg_spread_cents : null;
  });

  new Chart(document.getElementById('settlementSpreadChart'), {
    type: 'line',
    data: {
      labels: buckets,
      datasets: [
        { label: 'Polymarket', data: polySpread, borderColor: BM.poly, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: BM.poly },
        { label: 'Kalshi', data: kalshiSpread, borderColor: BM.kalshi, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: BM.kalshi },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw?.toFixed(2) ?? 'N/A'}¢` },
        },
      },
      scales: {
        y: {
          min: 0,
          title: { display: true, text: 'Spread (cents)', color: BM.creamFaded },
          ticks: { callback: (v) => v + '¢' },
        },
      },
    },
  });
}

// 13b. Settlement Curve - Impact
async function buildSettlementImpactChart() {
  const raw = await loadCSV('6823819_s7-2_settlement_curve_spread_widening_approaching_resolution.csv');

  const buckets = [...new Set(raw.map(r => r.settle_bucket))].sort((a, b) => {
    const rowA = raw.find(r => r.settle_bucket === a);
    const rowB = raw.find(r => r.settle_bucket === b);
    return (rowA?.bucket_order || 0) - (rowB?.bucket_order || 0);
  });

  const kalshiImpact = buckets.map(b => {
    const row = raw.find(r => r.settle_bucket === b && r.platform === 'kalshi');
    return row ? row.avg_impact_cents : null;
  });
  const polyImpact = buckets.map(b => {
    const row = raw.find(r => r.settle_bucket === b && r.platform === 'polymarket');
    return row ? row.avg_impact_cents : null;
  });

  new Chart(document.getElementById('settlementImpactChart'), {
    type: 'line',
    data: {
      labels: buckets,
      datasets: [
        { label: 'Polymarket', data: polyImpact, borderColor: BM.poly, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: BM.poly },
        { label: 'Kalshi', data: kalshiImpact, borderColor: BM.kalshi, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5, pointBackgroundColor: BM.kalshi },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw?.toFixed(2) ?? 'N/A'}¢` },
        },
      },
      scales: {
        y: {
          min: 0,
          title: { display: true, text: 'Price Impact (cents)', color: BM.creamFaded },
          ticks: { callback: (v) => v + '¢' },
        },
      },
    },
  });
}

// 14. Calibration Curve
async function buildCalibrationChart() {
  const raw = await loadCSV('6783184_s6-02_calibration_curve_implied_probability_vs_actual_win_rate.csv');

  const platforms = [...new Set(raw.map(r => r.platform))];
  const colorMap = { ideal: BM.creamFaded, polymarket: BM.poly, kalshi: BM.kalshi };

  const datasets = platforms.map(p => {
    const rows = raw.filter(r => r.platform === p).sort((a, b) => a.implied_prob - b.implied_prob);
    return {
      label: p.charAt(0).toUpperCase() + p.slice(1),
      data: rows.map(r => ({ x: r.implied_prob, y: r.actual_win_rate })),
      borderColor: colorMap[p] || BM.gold,
      backgroundColor: 'transparent',
      borderWidth: p === 'ideal' ? 1 : 2.5,
      borderDash: p === 'ideal' ? [6, 4] : [],
      pointRadius: p === 'ideal' ? 0 : 3,
      pointBackgroundColor: colorMap[p] || BM.gold,
    };
  });

  new Chart(document.getElementById('calibrationChart'), {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      showLine: true,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: implied ${ctx.parsed.x}% → actual ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Implied Probability (%)', color: BM.creamFaded },
          min: 0, max: 100,
        },
        y: {
          title: { display: true, text: 'Actual Win Rate (%)', color: BM.creamFaded },
          min: 0, max: 100,
        },
      },
    },
  });
}

// 15. Price Displacement by Trade Size
async function buildDisplacementChart() {
  const raw = await loadCSV('6783193_s6-07_price_displacement_by_trade_size.csv');

  const buckets = [...new Set(raw.map(r => r.size_bucket))].sort((a, b) => {
    // Extract leading number for sorting
    const numA = parseInt(a.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });

  const kalshi = buckets.map(b => {
    const row = raw.find(r => r.size_bucket === b && r.platform === 'kalshi');
    return row ? row.avg_impact_cents : 0;
  });
  const poly = buckets.map(b => {
    const row = raw.find(r => r.size_bucket === b && r.platform === 'polymarket');
    return row ? row.avg_impact_cents : 0;
  });

  // Clean labels
  const labels = buckets.map(b => b.replace(/^\d+ - /, ''));

  new Chart(document.getElementById('displacementChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3 },
        { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(2)}¢ avg impact` },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Avg Impact (cents)', color: BM.creamFaded },
          ticks: { callback: (v) => v + '¢' },
        },
      },
    },
  });
}

// 16. Average Trade Size Over Time
async function buildTradeSizeChart() {
  const raw = await loadCSV('6767147_s5-25_prediction_markets_average_trade_size_(weekly).csv');

  const weeks = [...new Set(raw.map(r => r.week))];
  const platforms = [...new Set(raw.map(r => r.platform))];
  const datasets = platforms.map(p => ({
    label: p,
    data: weeks.map(w => {
      const row = raw.find(r => r.week === w && r.platform === p);
      return row ? row.avg_trade_size : null;
    }),
    borderColor: platformColor(p),
    backgroundColor: platformColor(p) + '15',
    fill: true,
    spanGaps: true,
  }));

  new Chart(document.getElementById('tradeSizeChart'), {
    type: 'line',
    data: { labels: weeks.map(fmtDate), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtM(ctx.raw)}` },
        },
      },
      scales: {
        x: { ...timeXAxis(6) },
        y: { ticks: { callback: (v) => fmtM(v) } },
      },
    },
  });
}

// 17. Dispute Rate vs Volume
async function buildDisputeRateChart() {
  const raw = await loadCSV('6767141_s4-20_dispute_rate_vs_volume_is_trust_scaling.csv');

  const labels = raw.map(r => fmtDate(r.week));
  const volume = raw.map(r => r.total_volume);
  const rate = raw.map(r => r.disputes_per_million_volume);

  new Chart(document.getElementById('disputeRateChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Weekly Volume', data: volume, borderColor: BM.poly, backgroundColor: BM.poly + '15', fill: true, yAxisID: 'y' },
        { label: 'Disputes per $1M Volume', data: rate, borderColor: BM.red, backgroundColor: 'transparent', borderWidth: 2, yAxisID: 'y1' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) return `Volume: ${fmtM(ctx.raw)}`;
              return `Dispute Rate: ${ctx.raw.toFixed(4)} per $1M`;
            },
          },
        },
      },
      scales: {
        x: { ...timeXAxis(6) },
        y: { position: 'left', title: { display: true, text: 'Volume', color: BM.creamFaded }, ticks: { callback: (v) => fmtM(v) } },
        y1: { position: 'right', title: { display: true, text: 'Disputes / $1M', color: BM.creamFaded }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

// ============ VIEW TAB SWITCHING ============
let dashboardInitialized = false;

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.view-tab');
  if (!tab) return;

  const view = tab.dataset.view;
  // Sync all view-tab buttons (view-bar + nav bar)
  document.querySelectorAll('.view-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === view);
  });

  const reportView = document.getElementById('reportView');
  const dashboardView = document.getElementById('dashboardView');
  const tinkeringView = document.getElementById('tinkeringView');
  const reportNav = document.getElementById('reportNav');
  const readingProgress = document.getElementById('readingProgress');
  const viewBar = document.getElementById('viewBar');

  // Hide all views
  reportView.classList.add('hidden');
  dashboardView.classList.add('hidden');
  if (tinkeringView) tinkeringView.classList.add('hidden');

  if (view === 'dashboard') {
    dashboardView.classList.remove('hidden');
    if (reportNav) reportNav.style.display = 'none';
    if (readingProgress) readingProgress.style.display = 'none';
    if (viewBar) { viewBar.style.opacity = '1'; viewBar.style.pointerEvents = ''; }
    window.scrollTo(0, 0);
    if (!dashboardInitialized) {
      dashboardInitialized = true;
      setTimeout(() => initDashboard(), 50);
    }
  } else if (view === 'tinkering') {
    tinkeringView.classList.remove('hidden');
    if (reportNav) reportNav.style.display = 'none';
    if (readingProgress) readingProgress.style.display = 'none';
    if (viewBar) { viewBar.style.opacity = '1'; viewBar.style.pointerEvents = ''; }
    window.scrollTo(0, 0);
    if (!window.tinkeringInitialized) {
      window.tinkeringInitialized = true;
      setTimeout(() => initTinkering(), 50);
    }
  } else {
    reportView.classList.remove('hidden');
    if (reportNav) reportNav.style.display = '';
    if (readingProgress) readingProgress.style.display = '';
  }
});

// ============ DASHBOARD CHART BUILDERS ============

// Helper: create a simple line/bar chart on a dashboard canvas
function dbChart(canvasId, type, labels, datasets, opts = {}) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const chart = new Chart(el, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { boxWidth: 10, padding: 8, font: { size: 10 } } },
        tooltip: opts.tooltip || {},
      },
      scales: opts.scales || {},
      ...opts.extra,
    },
  });
  // Force immediate render (Chart.js defers even with animation:false)
  chart.update('none');
  return chart;
}

// S1-01: Volume (clone)
async function dbBuildVolume() {
  const raw = await loadCSV('6767119_s1-01_prediction_markets_weekly_volume_(usd_spent).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const datasets = platforms.map(p => ({
    label: p, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.volume_usd : 0; }),
    backgroundColor: platformColor(p) + 'cc', borderRadius: 2,
  }));
  dbChart('db-volumeChart', 'bar', weeks.map(fmtDate), datasets, {
    scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, ticks: { callback: v => fmtM(v) } } },
  });
}

// S1-03: Notional Volume
async function dbBuildNotional() {
  const raw = await loadCSV('6767122_s1-03_prediction_markets_weekly_notional_volume_($1_per_contract).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const datasets = platforms.map(p => ({
    label: p, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.notional_usd : 0; }),
    backgroundColor: platformColor(p) + 'cc', borderRadius: 2,
  }));
  dbChart('db-notionalChart', 'bar', weeks.map(fmtDate), datasets, {
    scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, ticks: { callback: v => fmtM(v) } } },
  });
}

// S1-04: Notional Market Share %
async function dbBuildNotionalShare() {
  const raw = await loadCSV('6767123_s1-04_prediction_markets_weekly_notional_volume_market_share_(%).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const datasets = platforms.map(p => ({
    label: p, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.market_share_pct : 0; }),
    backgroundColor: platformColor(p) + 'cc', fill: true, borderRadius: 2,
  }));
  dbChart('db-notionalShareChart', 'bar', weeks.map(fmtDate), datasets, {
    scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } } },
  });
}

// S1-05: Volume/Notional Ratio
async function dbBuildSpecRatio() {
  const raw = await loadCSV('6767124_s1-05_prediction_markets_volume_notional_ratio_(speculation_signal).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const datasets = platforms.map(p => ({
    label: p, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.vol_notional_ratio : null; }),
    borderColor: platformColor(p), backgroundColor: 'transparent', spanGaps: true,
  }));
  dbChart('db-specRatioChart', 'line', weeks.map(fmtDate), datasets, {
    scales: { x: timeXAxis(6), y: { title: { display: true, text: 'Vol/Notional Ratio', color: BM.creamFaded } } },
  });
}

// S1-01b: Volume Market Share % (derived from s1-01)
async function dbBuildVolumeShare() {
  const raw = await loadCSV('6767119_s1-01_prediction_markets_weekly_volume_(usd_spent).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const platformData = {};
  platforms.forEach(p => { platformData[p] = weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.volume_usd : 0; }); });
  const totals = weeks.map((_, i) => platforms.reduce((sum, p) => sum + platformData[p][i], 0));
  const datasets = platforms.map(p => ({
    label: p, data: platformData[p].map((v, i) => totals[i] ? (v / totals[i] * 100) : 0),
    backgroundColor: platformColor(p) + 'cc', borderRadius: 2,
  }));
  dbChart('db-volumeShareChart', 'bar', weeks.map(fmtDate), datasets, {
    scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } } },
  });
}

// S2-12b: Kalshi Sports Market Share % (dominance)
async function dbBuildKalshiSportsDominance() {
  const raw = await loadCSV('6767133_s2-12_kalshi_sports_vs_non-sports_volume_share.csv');
  const weeks = [...new Set(raw.map(r => r.week))];
  const sports = weeks.map(w => { const row = raw.find(r => r.week === w && r.market_type === 'Sports'); return row ? row.volume_usd : 0; });
  const nonSports = weeks.map(w => { const row = raw.find(r => r.week === w && r.market_type === 'Non-Sports'); return row ? row.volume_usd : 0; });
  const totals = sports.map((s, i) => s + nonSports[i]);
  dbChart('db-kalshiSportsDomChart', 'bar', weeks.map(fmtDate), [
    { label: 'Non-Sports', data: nonSports.map((v, i) => totals[i] ? (v / totals[i] * 100) : 0), backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 2 },
    { label: 'Sports', data: sports.map((v, i) => totals[i] ? (v / totals[i] * 100) : 0), backgroundColor: BM.kalshi + 'cc', borderRadius: 2 },
  ], { scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, max: 100, ticks: { callback: v => v + '%' } } } });
}

// S2-12: Kalshi Sports (clone)
async function dbBuildKalshiSports() {
  const raw = await loadCSV('6767133_s2-12_kalshi_sports_vs_non-sports_volume_share.csv');
  const weeks = [...new Set(raw.map(r => r.week))];
  const sports = weeks.map(w => { const row = raw.find(r => r.week === w && r.market_type === 'Sports'); return row ? row.volume_usd : 0; });
  const nonSports = weeks.map(w => { const row = raw.find(r => r.week === w && r.market_type === 'Non-Sports'); return row ? row.volume_usd : 0; });
  dbChart('db-kalshiSportsChart', 'bar', weeks.map(fmtDate), [
    { label: 'Non-Sports', data: nonSports, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 2 },
    { label: 'Sports', data: sports, backgroundColor: BM.kalshi + 'cc', borderRadius: 2 },
  ], { scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, ticks: { callback: v => fmtM(v) } } } });
}

// S2-09: Liquidity Quality
async function dbBuildLiquidity() {
  const raw = await loadCSV('6767130_s2-09_polymarket_liquidity_quality_top_pool_per_market_(snapshot).csv');
  const labels = raw.map(r => r.quality_bucket);
  dbChart('db-liquidityChart', 'bar', labels, [
    { label: 'Markets', data: raw.map(r => r.market_count), backgroundColor: BM.poly + 'cc', borderRadius: 3 },
  ], { scales: { y: { title: { display: true, text: 'Market Count', color: BM.creamFaded } } } });
}

// S3-14: Binary vs Multi-Outcome
async function dbBuildBinaryMulti() {
  const raw = await loadCSV('6767135_s3-14_polymarket_binary_vs_multi-outcome_market_volume.csv');
  const segments = [...new Set(raw.map(r => r.segment))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const colors = [BM.poly + 'cc', BM.polyLight + 'cc'];
  const datasets = segments.map((s, i) => ({
    label: s, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.segment === s); return row ? row.volume_usd : 0; }),
    backgroundColor: colors[i] || BM.gold + 'cc', borderRadius: 2,
  }));
  dbChart('db-binaryMultiChart', 'bar', weeks.map(fmtDate), datasets, {
    scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, ticks: { callback: v => fmtM(v) } } },
  });
}

// S3-15: Top Markets by Volume (horizontal bar)
async function dbBuildTopMarkets() {
  const raw = await loadCSV('6767136_s3-15_polymarket_top_markets_by_volume_(30d).csv');
  const top20 = raw.slice(0, 20);
  const labels = top20.map(r => r.market?.substring(0, 40) || 'N/A');
  dbChart('db-topMarketsChart', 'bar', labels, [
    { label: 'Volume (30d)', data: top20.map(r => r.total_volume_30d), backgroundColor: BM.poly + 'cc', borderRadius: 3 },
  ], {
    extra: { indexAxis: 'y' },
    scales: { x: { ticks: { callback: v => fmtM(v) } } },
  });
}

// S3-17: Capital Efficiency
async function dbBuildCapEff() {
  const raw = await loadCSV('6767138_s3-17_polymarket_capital_efficiency_(volume_per_$_of_liquidity).csv');
  const labels = raw.map(r => fmtDate(r.week));
  dbChart('db-capEffChart', 'bar', labels, [
    { label: 'Avg TVL', data: raw.map(r => r.avg_tvl), backgroundColor: BM.poly + 'cc', borderRadius: 2, yAxisID: 'y', order: 2 },
    { label: 'Vol/$ TVL', data: raw.map(r => r.volume_per_dollar_tvl), borderColor: BM.cream, backgroundColor: 'transparent', type: 'line', pointRadius: 0, borderWidth: 2, yAxisID: 'y1', order: 1 },
  ], {
    scales: {
      x: timeXAxis(6),
      y: { position: 'left', title: { display: true, text: 'Avg TVL', color: BM.creamFaded }, ticks: { callback: v => fmtM(v) } },
      y1: { position: 'right', title: { display: true, text: 'Vol/$ TVL', color: BM.creamFaded }, grid: { drawOnChartArea: false } },
    },
  });
}

// S4-18: Disputes (clone)
async function dbBuildDisputes() {
  const raw = await loadCSV('6767166_s4-18_uma_dispute_resolution_disputes_over_time.csv');
  dbChart('db-disputeChart', 'bar', raw.map(r => fmtDate(r.week)), [
    { label: 'Disputes', data: raw.map(r => r.disputes), backgroundColor: BM.uma, barPercentage: 1.0, categoryPercentage: 1.0, yAxisID: 'y', order: 2 },
    { label: 'Cumulative', data: raw.map(r => r.cumulative_disputes), borderColor: BM.gold, backgroundColor: 'transparent', type: 'line', pointRadius: 0, borderWidth: 2, yAxisID: 'y1', order: 1 },
  ], {
    scales: {
      x: timeXAxis(6),
      y: { position: 'left', title: { display: true, text: 'Weekly', color: BM.creamFaded } },
      y1: { position: 'right', title: { display: true, text: 'Cumulative', color: BM.creamFaded }, grid: { drawOnChartArea: false } },
    },
  });
}

// S4-18 Table: Disputes data table
async function dbBuildDisputeTable() {
  const raw = await loadCSV('6767166_s4-18_uma_dispute_resolution_disputes_over_time.csv');
  const container = document.getElementById('db-disputeTable');
  if (!container) return;
  const sorted = [...raw].sort((a, b) => new Date(b.week) - new Date(a.week));
  const rows = sorted.slice(0, 25);
  const fmtFull = (d) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  container.innerHTML = `
    <table class="dash-table">
      <thead><tr><th>Week of</th><th>Disputes</th><th>Cumulative</th><th>UMA Staked</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${fmtFull(r.week)}</td><td>${r.disputes}</td><td>${r.cumulative_disputes}</td><td>${Number(r.uma_staked_in_disputes).toLocaleString(undefined, {maximumFractionDigits: 0})}</td></tr>`).join('')}</tbody>
    </table>`;
}

// S4-20: Dispute Rate vs Volume (clone)
async function dbBuildDisputeRate() {
  const raw = await loadCSV('6767141_s4-20_dispute_rate_vs_volume_is_trust_scaling.csv');
  dbChart('db-disputeRateChart', 'line', raw.map(r => fmtDate(r.week)), [
    { label: 'Volume', data: raw.map(r => r.total_volume), borderColor: BM.poly, fill: true, backgroundColor: BM.poly + '15', yAxisID: 'y' },
    { label: 'Disputes/$1M', data: raw.map(r => r.disputes_per_million_volume), borderColor: BM.red, backgroundColor: 'transparent', yAxisID: 'y1' },
  ], {
    scales: {
      x: timeXAxis(6),
      y: { position: 'left', ticks: { callback: v => fmtM(v) } },
      y1: { position: 'right', grid: { drawOnChartArea: false } },
    },
  });
}

// S4-21: Dispute Rate vs # Markets (NEW)
async function dbBuildDisputeMarkets() {
  const raw = await loadCSV('6767142_s4-21_dispute_rate_vs_num_of_markets.csv');
  dbChart('db-disputeMarketsChart', 'line', raw.map(r => fmtDate(r.week)), [
    { label: 'Active Markets', data: raw.map(r => r.total_active_markets), borderColor: BM.poly, fill: true, backgroundColor: BM.poly + '15', yAxisID: 'y' },
    { label: 'Disputes/100 Markets', data: raw.map(r => r.disputes_per_100_markets), borderColor: BM.red, backgroundColor: 'transparent', yAxisID: 'y1' },
  ], {
    scales: {
      x: timeXAxis(6),
      y: { position: 'left', title: { display: true, text: 'Markets', color: BM.creamFaded } },
      y1: { position: 'right', title: { display: true, text: 'Disputes/100', color: BM.creamFaded }, grid: { drawOnChartArea: false } },
    },
  });
}

// S5-22: Unique Traders (NEW)
async function dbBuildUniqueTraders() {
  const raw = await loadCSV('6767143_s5-22_on-chain_prediction_markets_unique_traders_over_time_(weekly).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const datasets = platforms.map(p => ({
    label: p, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.unique_traders : 0; }),
    backgroundColor: platformColor(p) + 'cc', borderRadius: 2,
  }));
  dbChart('db-uniqueTradersChart', 'bar', weeks.map(fmtDate), datasets, {
    scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, ticks: { callback: v => fmtK(v) } } },
  });
}

// S5-23: New vs Returning (clone)
async function dbBuildTraders() {
  const raw = await loadCSV('6767144_s5-23_polymarket_new_vs_returning_traders_(weekly).csv');
  dbChart('db-tradersChart', 'bar', raw.map(r => fmtDate(r.week)), [
    { label: 'Returning', data: raw.map(r => r.returning_traders), backgroundColor: BM.poly + 'cc', borderRadius: 2 },
    { label: 'New', data: raw.map(r => r.new_traders), backgroundColor: BM.polyLight + 'cc', borderRadius: 2 },
  ], { scales: { x: { stacked: true, ...timeXAxis(6) }, y: { stacked: true, ticks: { callback: v => fmtK(v) } } } });
}

// S5-25: Trade Size (clone)
async function dbBuildTradeSize() {
  const raw = await loadCSV('6767147_s5-25_prediction_markets_average_trade_size_(weekly).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const weeks = [...new Set(raw.map(r => r.week))];
  const datasets = platforms.map(p => ({
    label: p, data: weeks.map(w => { const row = raw.find(r => r.week === w && r.platform === p); return row ? row.avg_trade_size : null; }),
    borderColor: platformColor(p), backgroundColor: 'transparent', spanGaps: true,
  }));
  dbChart('db-tradeSizeChart', 'line', weeks.map(fmtDate), datasets, {
    scales: { x: timeXAxis(6), y: { ticks: { callback: v => fmtM(v) } } },
  });
}

// S5-24: Whale Dominance (clone)
async function dbBuildWhale() {
  const raw = await loadCSV('6767146_s5-24_polymarket_trader_concentration_(whale_dominance).csv');
  dbChart('db-whaleChart', 'line', raw.map(r => fmtDate(r.week)), [
    { label: 'Top 10%', data: raw.map(r => r.top_10_pct), borderColor: BM.poly, backgroundColor: 'transparent' },
    { label: 'Top 50%', data: raw.map(r => r.top_50_pct), borderColor: BM.polyLight, backgroundColor: 'transparent' },
    { label: 'Top 100%', data: raw.map(r => r.top_100_pct), borderColor: BM.kalshi, backgroundColor: 'transparent' },
  ], { scales: { x: timeXAxis(6), y: { max: 100, ticks: { callback: v => v + '%' } } } });
}

// S6-01: Institutional (clone)
async function dbBuildInstitutional() {
  const raw = await loadCSV('6783201_s6-01_institutional-grade_markets_$10k_within_1¢_impact.csv');
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const kalshi = quarters.map(q => { const row = raw.find(r => r.quarter === q && r.platform === 'kalshi'); return row ? row.markets_under_1c : 0; });
  const poly = quarters.map(q => { const row = raw.find(r => r.quarter === q && r.platform === 'polymarket'); return row ? row.markets_under_1c : 0; });
  dbChart('db-institutionalChart', 'bar', quarters, [
    { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3, minBarLength: 3 },
    { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3, minBarLength: 3 },
  ], { scales: { y: { type: 'logarithmic', title: { display: true, text: 'Markets', color: BM.creamFaded }, ticks: { callback: v => [1,5,10,50,100,500,1000,5000,10000].includes(v) ? v.toLocaleString() : '' } } } });
}

// S6-02: Calibration (clone)
async function dbBuildCalibration() {
  const raw = await loadCSV('6783184_s6-02_calibration_curve_implied_probability_vs_actual_win_rate.csv');
  const platforms = [...new Set(raw.map(r => r.platform))].filter(p => p.toLowerCase() !== 'ideal');
  const datasets = platforms.map(p => ({
    label: p, data: raw.filter(r => r.platform === p).map(r => ({ x: r.implied_prob, y: r.actual_win_rate })),
    borderColor: platformColor(p), backgroundColor: platformColor(p) + '40',
    pointRadius: 3, showLine: true,
  }));
  datasets.unshift({ label: 'Ideal', data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], borderColor: 'rgba(255,255,255,0.7)', borderWidth: 2, borderDash: [], pointRadius: 0, showLine: true, order: 10 });
  dbChart('db-calibrationChart', 'scatter', null, datasets, {
    scales: { x: { min: 0, max: 100, title: { display: true, text: 'Implied %', color: BM.creamFaded } }, y: { min: 0, max: 100, title: { display: true, text: 'Actual %', color: BM.creamFaded } } },
  });
}

// S6-03: Calibration Error by Bucket (NEW)
async function dbBuildCalErrorBucket() {
  const raw = await loadCSV('6783185_s6-03_calibration_error_by_probability_bucket.csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const buckets = [...new Set(raw.map(r => r.bucket))];
  const colorMap = { polymarket: BM.poly + 'cc', kalshi: BM.kalshi + 'cc' };
  const datasets = platforms.map(p => ({
    label: p, data: buckets.map(b => { const row = raw.find(r => r.platform === p && r.bucket === b); return row ? row.calibration_error : null; }),
    backgroundColor: colorMap[p.toLowerCase()] || BM.gold + 'cc', borderRadius: 3,
  }));
  dbChart('db-calErrorBucketChart', 'bar', buckets, datasets, {
    scales: { y: { title: { display: true, text: 'Error (pp)', color: BM.creamFaded } } },
  });
}

// S6-04: Calibration at Extremes (with toggles)
async function dbBuildCalExtremes() {
  const raw = await loadCSV('6783186_s6-04_calibration_at_extremes_1_day_vs_3+_months_to_resolution.csv');
  const seriesNames = [...new Set(raw.map(r => r.series))];
  const cleanLabel = (s) => s.replace(/[^\x20-\x7E]+/g, ' → ').replace(/\s+/g, ' ').trim();
  const colorFor = (s) => {
    const lc = s.toLowerCase();
    if (lc === 'ideal') return 'rgba(255,255,255,0.7)';
    if (lc.includes('kalshi') && lc.includes('<1')) return BM.kalshi;
    if (lc.includes('kalshi') && lc.includes('3+')) return BM.kalshiLight;
    if (lc.includes('polymarket') && lc.includes('<1')) return BM.poly;
    if (lc.includes('polymarket') && lc.includes('3+')) return BM.polyLight;
    return BM.gold;
  };
  chartData.dbCalExtremes = { raw, seriesNames, cleanLabel, colorFor };
  const mkDS = (names) => {
    const ds = names.filter(s => s !== 'ideal').map(s => ({
      label: cleanLabel(s), data: raw.filter(r => r.series === s).map(r => ({ x: r.implied_prob, y: r.actual_win_rate })),
      borderColor: colorFor(s), backgroundColor: 'transparent', showLine: true, pointRadius: 2,
    }));
    ds.unshift({ label: 'Ideal', data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], borderColor: 'rgba(255,255,255,0.7)', borderWidth: 2, pointRadius: 0, showLine: true, order: 10 });
    return ds;
  };
  charts['db-calExtremesChart'] = new Chart(document.getElementById('db-calExtremesChart'), {
    type: 'scatter',
    data: { datasets: mkDS(seriesNames) },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { x: { min: 0, max: 100, title: { display: true, text: 'Implied %', color: BM.creamFaded } }, y: { min: 0, max: 100, title: { display: true, text: 'Actual %', color: BM.creamFaded } } },
    },
  });
}

function toggleDbCalExtremes(view) {
  const chart = charts['db-calExtremesChart'];
  if (!chart || !chartData.dbCalExtremes) return;
  const { raw, seriesNames, cleanLabel, colorFor } = chartData.dbCalExtremes;
  const mkDS = (names) => {
    const ds = names.filter(s => s !== 'ideal').map(s => ({
      label: cleanLabel(s), data: raw.filter(r => r.series === s).map(r => ({ x: r.implied_prob, y: r.actual_win_rate })),
      borderColor: colorFor(s), backgroundColor: 'transparent', showLine: true, pointRadius: 2,
    }));
    ds.unshift({ label: 'Ideal', data: [{ x: 0, y: 0 }, { x: 100, y: 100 }], borderColor: 'rgba(255,255,255,0.7)', borderWidth: 2, pointRadius: 0, showLine: true, order: 10 });
    return ds;
  };
  const filters = {
    all: seriesNames,
    kalshi: seriesNames.filter(s => s.toLowerCase().includes('kalshi') || s === 'ideal'),
    poly: seriesNames.filter(s => s.toLowerCase().includes('polymarket') || s === 'ideal'),
    near: seriesNames.filter(s => s.toLowerCase().includes('<1') || s === 'ideal'),
    far: seriesNames.filter(s => s.toLowerCase().includes('3+') || s === 'ideal'),
  };
  chart.data.datasets = mkDS(filters[view] || filters.all);
  chart.update();
}

// S6-05: Calibration Error by Time Horizon (NEW)
async function dbBuildCalHorizon() {
  const raw = await loadCSV('6783187_s6-05_calibration_error_by_time_horizon.csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const horizons = [...new Set(raw.map(r => r.horizon))];
  const colorMap = { polymarket: BM.poly + 'cc', kalshi: BM.kalshi + 'cc' };
  const datasets = platforms.map(p => ({
    label: p, data: horizons.map(h => { const row = raw.find(r => r.platform === p && r.horizon === h); return row ? row.avg_abs_error_pp : null; }),
    backgroundColor: colorMap[p.toLowerCase()] || BM.gold + 'cc', borderRadius: 3,
  }));
  dbChart('db-calHorizonChart', 'bar', horizons, datasets, {
    scales: { y: { title: { display: true, text: 'Avg Error (pp)', color: BM.creamFaded } } },
  });
}

// S6-06: Bounce Over Time (NEW)
async function dbBuildBounce() {
  const raw = await loadCSV('6783192_s6-06_bounce_over_time_(quarterly).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const colorMap = { polymarket: BM.poly + 'cc', kalshi: BM.kalshi + 'cc' };
  const datasets = platforms.map(p => ({
    label: p, data: quarters.map(q => { const row = raw.find(r => r.platform === p && r.quarter === q); return row ? row.realized_spread_cents : null; }),
    backgroundColor: colorMap[p.toLowerCase()] || BM.gold + 'cc', borderRadius: 3,
  }));
  dbChart('db-bounceChart', 'bar', quarters, datasets, {
    scales: { y: { title: { display: true, text: 'Spread (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } },
  });
}

// S6-07: Displacement by Trade Size (clone)
async function dbBuildDisplacement() {
  const raw = await loadCSV('6783193_s6-07_price_displacement_by_trade_size.csv');
  const buckets = [...new Set(raw.map(r => r.size_bucket))].sort((a, b) => parseInt(a.match(/\d+/)?.[0]||'0') - parseInt(b.match(/\d+/)?.[0]||'0'));
  const kalshi = buckets.map(b => { const row = raw.find(r => r.size_bucket === b && r.platform === 'kalshi'); return row ? row.avg_impact_cents : 0; });
  const poly = buckets.map(b => { const row = raw.find(r => r.size_bucket === b && r.platform === 'polymarket'); return row ? row.avg_impact_cents : 0; });
  dbChart('db-displacementChart', 'bar', buckets.map(b => b.replace(/^\d+ - /, '')), [
    { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3 },
    { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3 },
  ], { scales: { y: { ticks: { callback: v => v + '¢' } } } });
}

// S6-08: Retail Bounce (NEW)
async function dbBuildRetailBounce() {
  const raw = await loadCSV('6783194_s6-08_retail_bounce_($10-$100_trades).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const colorMap = { polymarket: BM.poly + 'cc', kalshi: BM.kalshi + 'cc' };
  const datasets = platforms.map(p => ({
    label: p, data: quarters.map(q => { const row = raw.find(r => r.platform === p && r.quarter === q); return row ? row.retail_bounce_cents : null; }),
    backgroundColor: colorMap[p.toLowerCase()] || BM.gold + 'cc', borderRadius: 3,
  }));
  dbChart('db-retailBounceChart', 'bar', quarters, datasets, {
    scales: { y: { title: { display: true, text: 'Bounce (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } },
  });
}

// S6-09: Institutional Bounce (NEW)
async function dbBuildInstBounce() {
  const raw = await loadCSV('6783195_s6-09_institutional_bounce_($1k-$10k_trades).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const colorMap = { polymarket: BM.poly + 'cc', kalshi: BM.kalshi + 'cc' };
  const datasets = platforms.map(p => ({
    label: p, data: quarters.map(q => { const row = raw.find(r => r.platform === p && r.quarter === q); return row ? row.inst_bounce_cents : null; }),
    backgroundColor: colorMap[p.toLowerCase()] || BM.gold + 'cc', borderRadius: 3,
  }));
  dbChart('db-instBounceChart', 'bar', quarters, datasets, {
    scales: { y: { title: { display: true, text: 'Bounce (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } },
  });
}

// S6-10: Retail Displacement Over Time (NEW)
async function dbBuildRetailDisp() {
  const raw = await loadCSV('6783196_s6-10_retail_price_displacement_over_time_($10-$100).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const colorMap = { polymarket: BM.poly, kalshi: BM.kalshi };
  const datasets = platforms.map(p => ({
    label: p, data: quarters.map(q => { const row = raw.find(r => r.platform === p && r.quarter === q); return row ? row.retail_impact_cents : null; }),
    borderColor: colorMap[p.toLowerCase()] || BM.gold, backgroundColor: 'transparent', spanGaps: true,
  }));
  dbChart('db-retailDispChart', 'line', quarters, datasets, {
    scales: { y: { title: { display: true, text: 'Impact (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } },
  });
}

// S6-11: Institutional Displacement Over Time (NEW)
async function dbBuildInstDisp() {
  const raw = await loadCSV('6783198_s6-11_institutional_price_displacement_over_time_($1k-$10k).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const colorMap = { polymarket: BM.poly, kalshi: BM.kalshi };
  const datasets = platforms.map(p => ({
    label: p, data: quarters.map(q => { const row = raw.find(r => r.platform === p && r.quarter === q); return row ? row.inst_impact_cents : null; }),
    borderColor: colorMap[p.toLowerCase()] || BM.gold, backgroundColor: 'transparent', spanGaps: true,
  }));
  dbChart('db-instDispChart', 'line', quarters, datasets, {
    scales: { y: { title: { display: true, text: 'Impact (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } },
  });
}

// S6-13: Intraday Spread Patterns (NEW)
async function dbBuildIntraday() {
  const raw = await loadCSV('6783200_s6-13_intraday_spread_patterns_(24h).csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const hours = [...new Set(raw.map(r => r.hour_utc))].sort((a, b) => a - b);
  const colorMap = { polymarket: BM.poly, kalshi: BM.kalshi };
  const datasets = platforms.map(p => ({
    label: p, data: hours.map(h => { const row = raw.find(r => r.platform === p && r.hour_utc === h); return row ? row.avg_spread_cents : null; }),
    borderColor: colorMap[p.toLowerCase()] || BM.gold, backgroundColor: 'transparent',
  }));
  dbChart('db-intradayChart', 'line', hours.map(h => h + ':00'), datasets, {
    scales: { x: { title: { display: true, text: 'Hour (UTC)', color: BM.creamFaded } }, y: { title: { display: true, text: 'Spread (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } },
  });
}

// S6-14: Decile (clone)
async function dbBuildDecile() {
  const raw = await loadCSV('6783202_s6-14_the_execution_cliff_displacement_by_market_decile_(q4_2024_vs_2025).csv');
  const deciles = [...new Set(raw.map(r => r.decile))].sort((a, b) => {
    const rA = raw.find(r => r.decile === a); const rB = raw.find(r => r.decile === b);
    return (rA?.decile_order || 0) - (rB?.decile_order || 0);
  });
  const lookup = {};
  raw.forEach(r => { if (!lookup[r.series]) lookup[r.series] = {}; lookup[r.series][r.decile] = r.median_1k_impact_cents; });
  chartData.dbDecile = { deciles, lookup };
  const ds = (key, color) => ({ label: key, data: deciles.map(d => lookup[key]?.[d] ?? null), backgroundColor: color, borderRadius: 3 });
  charts['db-decileChart'] = new Chart(document.getElementById('db-decileChart'), {
    type: 'bar',
    data: { labels: deciles, datasets: [
      ds('kalshi Q4 2024', BM.kalshi + 'cc'), ds('kalshi Q4 2025', BM.kalshiLight + 'cc'),
      ds('polymarket Q4 2024', BM.poly + 'cc'), ds('polymarket Q4 2025', BM.polyLight + 'cc'),
    ]},
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => v + '¢' } } } },
  });
}

function toggleDbDecileChart(view) {
  const chart = charts['db-decileChart'];
  if (!chart || !chartData.dbDecile) return;
  const d = chartData.dbDecile;
  const ds = (key, color) => ({ label: key, data: d.deciles.map(dec => d.lookup[key]?.[dec] ?? null), backgroundColor: color, borderRadius: 3 });
  const views = {
    all: [ds('kalshi Q4 2024', BM.kalshi + 'cc'), ds('kalshi Q4 2025', BM.kalshiLight + 'cc'), ds('polymarket Q4 2024', BM.poly + 'cc'), ds('polymarket Q4 2025', BM.polyLight + 'cc')],
    kalshi_yoy: [ds('kalshi Q4 2024', BM.kalshi + 'cc'), ds('kalshi Q4 2025', BM.kalshiLight + 'cc')],
    poly_yoy: [ds('polymarket Q4 2024', BM.poly + 'cc'), ds('polymarket Q4 2025', BM.polyLight + 'cc')],
    '2024_platform': [ds('kalshi Q4 2024', BM.kalshi + 'cc'), ds('polymarket Q4 2024', BM.poly + 'cc')],
    '2025_platform': [ds('kalshi Q4 2025', BM.kalshi + 'cc'), ds('polymarket Q4 2025', BM.poly + 'cc')],
  };
  chart.data.datasets = views[view] || views.all;
  chart.update();
}

// S6-15: Cohort Displacement (with toggles)
async function dbBuildCohort() {
  const raw = await loadCSV('6783203_s6-15_cohort_displacement_top_10%_vs_bottom_50%_markets.csv');
  const seriesNames = [...new Set(raw.map(r => r.series))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const lookup = {};
  raw.forEach(r => { if (!lookup[r.series]) lookup[r.series] = {}; lookup[r.series][r.quarter] = r.median_1k_impact_cents; });
  chartData.dbCohort = { quarters, lookup, seriesNames };
  const colorMap = {};
  seriesNames.forEach(s => {
    const lc = s.toLowerCase();
    if (lc.includes('kalshi') && lc.includes('top')) colorMap[s] = BM.kalshi;
    else if (lc.includes('kalshi') && lc.includes('bottom')) colorMap[s] = BM.kalshiLight;
    else if (lc.includes('polymarket') && lc.includes('top')) colorMap[s] = BM.poly;
    else if (lc.includes('polymarket') && lc.includes('bottom')) colorMap[s] = BM.polyLight;
  });
  const cleanLabel = (s) => s.replace(/[^\x20-\x7E]+/g, ' → ').replace(/\s+/g, ' ').trim();
  const mkDS = (names) => names.map(s => ({
    label: cleanLabel(s), data: quarters.map(q => lookup[s]?.[q] ?? null),
    borderColor: colorMap[s] || BM.gold, backgroundColor: 'transparent', spanGaps: true,
  }));
  charts['db-cohortChart'] = new Chart(document.getElementById('db-cohortChart'), {
    type: 'line', data: { labels: quarters, datasets: mkDS(seriesNames) },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: { display: true, text: 'Impact (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } } },
  });
}

function toggleDbCohort(view) {
  const chart = charts['db-cohortChart'];
  if (!chart || !chartData.dbCohort) return;
  const d = chartData.dbCohort;
  const colorMap = {};
  d.seriesNames.forEach(s => {
    const lc = s.toLowerCase();
    if (lc.includes('kalshi') && lc.includes('top')) colorMap[s] = BM.kalshi;
    else if (lc.includes('kalshi') && lc.includes('bottom')) colorMap[s] = BM.kalshiLight;
    else if (lc.includes('polymarket') && lc.includes('top')) colorMap[s] = BM.poly;
    else if (lc.includes('polymarket') && lc.includes('bottom')) colorMap[s] = BM.polyLight;
  });
  const cleanLabel = (s) => s.replace(/[^\x20-\x7E]+/g, ' → ').replace(/\s+/g, ' ').trim();
  const mkDS = (names) => names.map(s => ({ label: cleanLabel(s), data: d.quarters.map(q => d.lookup[s]?.[q] ?? null), borderColor: colorMap[s] || BM.gold, backgroundColor: 'transparent', spanGaps: true }));
  const filters = {
    all: d.seriesNames,
    kalshi: d.seriesNames.filter(s => s.toLowerCase().includes('kalshi')),
    poly: d.seriesNames.filter(s => s.toLowerCase().includes('polymarket')),
    top10: d.seriesNames.filter(s => s.toLowerCase().includes('top')),
    bottom50: d.seriesNames.filter(s => s.toLowerCase().includes('bottom')),
  };
  chart.data.datasets = mkDS(filters[view] || filters.all);
  chart.update();
}

// S6-16: Long-Tail Tax Ratio (NEW)
async function dbBuildLongTail() {
  const raw = await loadCSV('6783205_s6-16_long-tail_tax_ratio_bottom_50%_top_10%_displacement.csv');
  const platforms = [...new Set(raw.map(r => r.platform))];
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  });
  const colorMap = { polymarket: BM.poly, kalshi: BM.kalshi };
  const datasets = platforms.map(p => ({
    label: p, data: quarters.map(q => { const row = raw.find(r => r.platform === p && r.quarter === q); return row ? row.long_tail_tax_ratio : null; }),
    borderColor: colorMap[p.toLowerCase()] || BM.gold, backgroundColor: 'transparent', spanGaps: true,
  }));
  dbChart('db-longTailChart', 'line', quarters, datasets, {
    scales: { y: { title: { display: true, text: 'Tax Ratio', color: BM.creamFaded } } },
  });
}

// S6-17: Breadth (clone)
async function dbBuildBreadth() {
  const raw = await loadCSV('6783207_s6-17_market_breadth_qualifying_markets_($1k_liquidity_threshold).csv');
  const quarters = [...new Set(raw.map(r => r.quarter))].sort((a, b) => {
    const rA = raw.find(r => r.quarter === a); const rB = raw.find(r => r.quarter === b);
    return (rA?.quarter_order || 0) - (rB?.quarter_order || 0);
  }).filter(q => q !== '2025 Q4');
  const kalshi = quarters.map(q => { const row = raw.find(r => r.quarter === q && r.platform === 'kalshi'); return row ? row.qualifying_markets : 0; });
  const poly = quarters.map(q => { const row = raw.find(r => r.quarter === q && r.platform === 'polymarket'); return row ? row.qualifying_markets : 0; });
  dbChart('db-breadthChart', 'bar', quarters, [
    { label: 'Polymarket', data: poly, backgroundColor: BM.poly + 'cc', borderRadius: 3, minBarLength: 3 },
    { label: 'Kalshi', data: kalshi, backgroundColor: BM.kalshi + 'cc', borderRadius: 3, minBarLength: 3 },
  ], { scales: { y: { type: 'logarithmic', ticks: { callback: v => [1,10,100,1000,10000].includes(v) ? v.toLocaleString() : '' } } } });
}

// S6-18: Kalshi Taker (clone)
async function dbBuildKalshiTaker() {
  const raw = await loadCSV('6783188_s6-18_kalshi_taker_yesno_ratio_by_year.csv');
  const colors = BM.kalshi + 'cc';
  dbChart('db-kalshiTakerChart', 'bar', raw.map(r => String(r.year)), [
    { label: 'YES/NO Ratio', data: raw.map(r => r.yes_no_ratio), backgroundColor: colors, borderRadius: 3 },
  ], {
    scales: { y: { title: { display: true, text: 'YES/NO Taker Ratio', color: BM.creamFaded }, ticks: { callback: v => v + 'x' } } },
    extra: { plugins: { annotation: { annotations: { line1: { type: 'line', yMin: 1, yMax: 1, borderColor: 'rgba(255,255,255,0.3)', borderDash: [5, 5] } } } } },
  });
}

// S6-19: Polymarket Taker Buy/Sell Ratio (NEW)
async function dbBuildPolyBSRatio() {
  const raw = await loadCSV('6783189_s6-19_polymarket_taker_buysell_ratio_by_year.csv');
  const colors = BM.poly + 'cc';
  dbChart('db-polyBSRatioChart', 'bar', raw.map(r => String(r.year)), [
    { label: 'Buy/Sell Ratio', data: raw.map(r => r.buy_sell_ratio), backgroundColor: colors, borderRadius: 3 },
  ], {
    scales: { y: { title: { display: true, text: 'Buy/Sell Ratio', color: BM.creamFaded }, ticks: { callback: v => v + 'x' } } },
    extra: { plugins: { annotation: { annotations: { line1: { type: 'line', yMin: 1, yMax: 1, borderColor: 'rgba(255,255,255,0.3)', borderDash: [5, 5] } } } } },
  });
}

// S6-20: Kalshi Taker PnL (NEW)
async function dbBuildKalshiPnL() {
  const raw = await loadCSV('6783190_s6-20_kalshi_taker_pnl_yes_vs_no_side.csv');
  const years = [...new Set(raw.map(r => r.year))].sort();
  const metrics = [...new Set(raw.map(r => r.metric))];
  const colors = { 'no_taker_pnl_cents': BM.kalshiLight + 'cc', 'yes_taker_pnl_cents': BM.kalshi + 'cc' };
  const datasets = metrics.map(m => ({
    label: m.replace(/_/g, ' ').toUpperCase(), data: years.map(y => { const row = raw.find(r => r.year === y && r.metric === m); return row ? row.value : null; }),
    backgroundColor: colors[m] || BM.gold + 'cc', borderRadius: 3,
  }));
  dbChart('db-kalshiPnLChart', 'bar', years.map(String), datasets, {
    scales: { y: { title: { display: true, text: 'PnL (cents)', color: BM.creamFaded }, ticks: { callback: v => '$' + v } } },
  });
}

// S6-21: Polymarket Taker Volume (clone)
async function dbBuildPolyTaker() {
  const raw = await loadCSV('6783191_s6-21_polymarket_taker_volume_buy_vs_sell.csv');
  const years = [...new Set(raw.map(r => r.year))];
  const buy = years.map(y => { const row = raw.find(r => r.year === y && r.metric === 'taker_buy_vol_b'); return row ? row.value : 0; });
  const sell = years.map(y => { const row = raw.find(r => r.year === y && r.metric === 'taker_sell_vol_b'); return row ? row.value : 0; });
  dbChart('db-polyTakerChart', 'bar', years.map(String), [
    { label: 'Taker BUY ($B)', data: buy, backgroundColor: BM.poly + 'cc', borderRadius: 3 },
    { label: 'Taker SELL ($B)', data: sell, backgroundColor: BM.polyLight + 'cc', borderRadius: 3 },
  ], { scales: { y: { title: { display: true, text: 'Volume (Billions)', color: BM.creamFaded }, ticks: { callback: v => '$' + v + 'B' } } } });
}

// S6-22: Volume Concentration (clone)
async function dbBuildConcentration() {
  const raw = await loadCSV('6783208_s6-22_volume_concentration_power_law_distribution.csv');
  const buckets = [...new Set(raw.map(r => r.percentile_bucket))];
  const platforms = [...new Set(raw.map(r => r.platform))];
  const datasets = platforms.map(p => ({
    label: p, data: buckets.map(b => { const row = raw.find(r => r.platform === p && r.percentile_bucket === b); return row ? row.pct_of_total : 0; }),
    backgroundColor: platformColor(p) + 'cc', borderRadius: 3,
  }));
  dbChart('db-concentrationChart', 'bar', buckets, datasets, {
    scales: {
      x: { title: { display: true, text: 'Market Percentile', color: BM.creamFaded } },
      y: { title: { display: true, text: '% of Total Volume', color: BM.creamFaded }, ticks: { callback: v => v + '%' } },
    },
  });
}

// S6-23: HHI (clone)
async function dbBuildHHI() {
  const raw = await loadCSV('6783209_s6-23_hhi_concentration_over_time.csv');
  const years = [...new Set(raw.map(r => r.year))].sort();
  const kalshi = years.map(y => { const row = raw.find(r => r.year === y && r.platform === 'kalshi'); return row ? row.hhi : null; });
  const poly = years.map(y => { const row = raw.find(r => r.year === y && r.platform === 'polymarket'); return row ? row.hhi : null; });
  dbChart('db-hhiChart', 'line', years.map(String), [
    { label: 'Polymarket', data: poly, borderColor: BM.poly, backgroundColor: 'transparent', spanGaps: true },
    { label: 'Kalshi', data: kalshi, borderColor: BM.kalshi, backgroundColor: 'transparent', spanGaps: true },
  ], { scales: { y: { type: 'logarithmic', title: { display: true, text: 'HHI', color: BM.creamFaded }, ticks: { callback: v => [10,100,500,1000,2000].includes(v) ? v.toLocaleString() : '' } } } });
}

// S7-2: Settlement Spread (clone)
async function dbBuildSettlementSpread() {
  const raw = await loadCSV('6823819_s7-2_settlement_curve_spread_widening_approaching_resolution.csv');
  const buckets = [...new Set(raw.map(r => r.settle_bucket))].sort((a, b) => {
    const rA = raw.find(r => r.settle_bucket === a); const rB = raw.find(r => r.settle_bucket === b);
    return (rA?.bucket_order || 0) - (rB?.bucket_order || 0);
  });
  const kalshi = buckets.map(b => { const row = raw.find(r => r.settle_bucket === b && r.platform === 'kalshi'); return row ? row.avg_spread_cents : null; });
  const poly = buckets.map(b => { const row = raw.find(r => r.settle_bucket === b && r.platform === 'polymarket'); return row ? row.avg_spread_cents : null; });
  dbChart('db-settlementSpreadChart', 'line', buckets, [
    { label: 'Polymarket', data: poly, borderColor: BM.poly, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5 },
    { label: 'Kalshi', data: kalshi, borderColor: BM.kalshi, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5 },
  ], { scales: { y: { min: 0, title: { display: true, text: 'Spread (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } } });
}

// S7-2: Settlement Impact (clone)
async function dbBuildSettlementImpact() {
  const raw = await loadCSV('6823819_s7-2_settlement_curve_spread_widening_approaching_resolution.csv');
  const buckets = [...new Set(raw.map(r => r.settle_bucket))].sort((a, b) => {
    const rA = raw.find(r => r.settle_bucket === a); const rB = raw.find(r => r.settle_bucket === b);
    return (rA?.bucket_order || 0) - (rB?.bucket_order || 0);
  });
  const kalshi = buckets.map(b => { const row = raw.find(r => r.settle_bucket === b && r.platform === 'kalshi'); return row ? row.avg_impact_cents : null; });
  const poly = buckets.map(b => { const row = raw.find(r => r.settle_bucket === b && r.platform === 'polymarket'); return row ? row.avg_impact_cents : null; });
  dbChart('db-settlementImpactChart', 'line', buckets, [
    { label: 'Polymarket', data: poly, borderColor: BM.poly, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5 },
    { label: 'Kalshi', data: kalshi, borderColor: BM.kalshi, backgroundColor: 'transparent', borderWidth: 2.5, pointRadius: 5 },
  ], { scales: { y: { min: 0, title: { display: true, text: 'Impact (¢)', color: BM.creamFaded }, ticks: { callback: v => v + '¢' } } } });
}

// ============ DASHBOARD INIT ============
const dashboardBuilders = {
  'db-volumeChart': dbBuildVolume,
  'db-volumeShareChart': dbBuildVolumeShare,
  'db-notionalChart': dbBuildNotional,
  'db-notionalShareChart': dbBuildNotionalShare,
  'db-specRatioChart': dbBuildSpecRatio,
  'db-kalshiSportsChart': dbBuildKalshiSports,
  'db-kalshiSportsDomChart': dbBuildKalshiSportsDominance,
  'db-binaryMultiChart': dbBuildBinaryMulti,
  'db-topMarketsChart': dbBuildTopMarkets,
  'db-capEffChart': dbBuildCapEff,
  'db-disputeChart': dbBuildDisputes,
  'db-disputeRateChart': dbBuildDisputeRate,
  'db-disputeMarketsChart': dbBuildDisputeMarkets,
  'db-uniqueTradersChart': dbBuildUniqueTraders,
  'db-tradersChart': dbBuildTraders,
  'db-tradeSizeChart': dbBuildTradeSize,
  'db-whaleChart': dbBuildWhale,
  'db-institutionalChart': dbBuildInstitutional,
  'db-calibrationChart': dbBuildCalibration,
  'db-calErrorBucketChart': dbBuildCalErrorBucket,
  'db-calExtremesChart': dbBuildCalExtremes,
  'db-calHorizonChart': dbBuildCalHorizon,
  'db-bounceChart': dbBuildBounce,
  'db-displacementChart': dbBuildDisplacement,
  'db-retailBounceChart': dbBuildRetailBounce,
  'db-instBounceChart': dbBuildInstBounce,
  'db-retailDispChart': dbBuildRetailDisp,
  'db-instDispChart': dbBuildInstDisp,
  'db-intradayChart': dbBuildIntraday,
  'db-decileChart': dbBuildDecile,
  'db-cohortChart': dbBuildCohort,
  'db-longTailChart': dbBuildLongTail,
  'db-breadthChart': dbBuildBreadth,
  'db-kalshiTakerChart': dbBuildKalshiTaker,
  'db-polyBSRatioChart': dbBuildPolyBSRatio,
  'db-kalshiPnLChart': dbBuildKalshiPnL,
  'db-polyTakerChart': dbBuildPolyTaker,
  'db-concentrationChart': dbBuildConcentration,
  'db-hhiChart': dbBuildHHI,
  'db-settlementSpreadChart': dbBuildSettlementSpread,
  'db-settlementImpactChart': dbBuildSettlementImpact,
};

function initDashboard() {
  // Build all dashboard charts immediately (animation=false makes this fast)
  Object.entries(dashboardBuilders).forEach(([id, builder]) => {
    const canvas = document.getElementById(id);
    if (canvas) {
      builder().catch(e => console.error(`Dashboard chart error (${id}):`, e));
    }
  });
  // Build non-chart dashboard elements
  dbBuildDisputeTable();
}

// 18. Decile Chart 2 (duplicate for outlook section)
async function buildDecileChart2() {
  const raw = await loadCSV('6783202_s6-14_the_execution_cliff_displacement_by_market_decile_(q4_2024_vs_2025).csv');

  const deciles = [...new Set(raw.map(r => r.decile))].sort((a, b) => {
    const rowA = raw.find(r => r.decile === a);
    const rowB = raw.find(r => r.decile === b);
    return (rowA?.decile_order || 0) - (rowB?.decile_order || 0);
  });

  const lookup = {};
  raw.forEach(r => { if (!lookup[r.series]) lookup[r.series] = {}; lookup[r.series][r.decile] = r.median_1k_impact_cents; });

  chartData.decile2 = { deciles, lookup };

  function mkDS(key, color) {
    return { label: key, data: deciles.map(d => lookup[key]?.[d] ?? null), backgroundColor: color + 'cc', borderRadius: 3 };
  }

  charts.decileChart2 = new Chart(document.getElementById('decileChart2'), {
    type: 'bar',
    data: { labels: deciles, datasets: [
      mkDS('kalshi Q4 2024', BM.kalshi),
      mkDS('kalshi Q4 2025', BM.kalshiLight),
      mkDS('polymarket Q4 2024', BM.poly),
      mkDS('polymarket Q4 2025', BM.polyLight),
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw?.toFixed(2) ?? 'N/A'}¢ impact` },
        },
      },
      scales: {
        y: {
          title: { display: true, text: 'Median $1K Impact (cents)', color: BM.creamFaded },
          ticks: { callback: (v) => v + '¢' },
        },
      },
    },
  });
}

function toggleDecileChart2(view) {
  const chart = charts.decileChart2;
  if (!chart || !chartData.decile2) return;
  const { deciles, lookup } = chartData.decile2;
  const ds = (key, color) => ({ label: key, data: deciles.map(d => lookup[key]?.[d] ?? null), backgroundColor: color + 'cc', borderRadius: 3 });
  const views = {
    all: [ds('kalshi Q4 2024', BM.kalshi), ds('kalshi Q4 2025', BM.kalshiLight), ds('polymarket Q4 2024', BM.poly), ds('polymarket Q4 2025', BM.polyLight)],
    kalshi_yoy: [ds('kalshi Q4 2024', BM.kalshi), ds('kalshi Q4 2025', BM.kalshiLight)],
    poly_yoy: [ds('polymarket Q4 2024', BM.poly), ds('polymarket Q4 2025', BM.polyLight)],
    '2024_platform': [ds('kalshi Q4 2024', BM.kalshi), ds('polymarket Q4 2024', BM.poly)],
    '2025_platform': [ds('kalshi Q4 2025', BM.kalshi), ds('polymarket Q4 2025', BM.poly)],
  };
  chart.data.datasets = views[view] || views.all;
  chart.update();
}

// ============ TINKERING WIDGETS ============

let execData = null;

async function initTinkering() {
  // Load execution data
  const [displacementRaw, bounceRaw, decileRaw] = await Promise.all([
    loadCSV('6783193_s6-07_price_displacement_by_trade_size.csv'),
    loadCSV('6783192_s6-06_bounce_over_time_(quarterly).csv'),
    loadCSV('6783202_s6-14_the_execution_cliff_displacement_by_market_decile_(q4_2024_vs_2025).csv'),
  ]);
  execData = { displacement: {}, bounce: {}, decile: {} };
  displacementRaw.forEach(r => {
    if (!execData.displacement[r.platform]) execData.displacement[r.platform] = {};
    execData.displacement[r.platform][r.size_bucket] = r.avg_impact_cents;
  });
  const latestQ = bounceRaw.reduce((a, b) => (b.quarter_order || 0) > (a.quarter_order || 0) ? b : a, bounceRaw[0]);
  bounceRaw.forEach(r => {
    if (r.quarter === latestQ.quarter) execData.bounce[r.platform] = r.realized_spread_cents;
  });
  // Build decile lookup from Q4 2025 data
  decileRaw.filter(r => r.series && r.series.includes('Q4 2025')).forEach(r => {
    const plat = r.series.includes('kalshi') ? 'kalshi' : 'polymarket';
    if (!execData.decile[plat]) execData.decile[plat] = {};
    execData.decile[plat][r.decile_order] = r.median_1k_impact_cents;
  });
  updateExecCalc('polymarket');
  initHHI();
  drawSankey();
}

// --- 1. Execution Cost Calculator ---
window.updateExecCalc = function(platform) {
  document.getElementById('exec-poly').classList.toggle('active', platform === 'polymarket');
  document.getElementById('exec-kalshi').classList.toggle('active', platform === 'kalshi');
  const sizeIdx = parseInt(document.getElementById('exec-size').value);
  const decileIdx = parseInt(document.getElementById('exec-decile').value);
  const sizeBuckets = ['1 - <$1', '2 - $1-$10', '3 - $10-$100', '4 - $100-$1K', '5 - $1K-$10K', '6 - >$10K'];
  const sizeLabel = sizeBuckets[sizeIdx] || sizeBuckets[2];
  // Displacement from trade-size data (baseline)
  let dispBySize = 0.5;
  if (execData?.displacement?.[platform]) dispBySize = execData.displacement[platform][sizeLabel] || 0.5;
  // Displacement from real decile data (Q4 2025, $1K trades)
  const decileOrder = decileIdx + 1; // 1-indexed
  let dispByDecile = execData?.decile?.[platform]?.[decileOrder] || dispBySize;
  // Blend: use decile as the base, scale by trade-size ratio vs $1K bucket
  const baselineSize = execData?.displacement?.[platform]?.['5 - $1K-$10K'] || 1;
  const sizeRatio = dispBySize / (baselineSize || 1);
  let disp = dispByDecile * sizeRatio;
  let spread = execData?.bounce?.[platform] || 0.8;
  // Spread also scales with decile (use ratio of decile displacement to top-10%)
  const topDecileDisp = execData?.decile?.[platform]?.[1] || 0.5;
  spread *= (dispByDecile / topDecileDisp);
  const midSizes = [0.5, 5, 50, 500, 5000, 50000];
  const sizeLabelsDisplay = ['$0.50', '$5', '$50', '$500', '$5K', '$50K'];
  const tradeAmt = midSizes[sizeIdx] || 50;
  // Round-trip: (displacement + spread) in cents, convert to dollars, x2 for entry+exit
  const costPerDollar = (disp + spread) / 100; // cents → fraction of $1 contract
  const roundTrip = costPerDollar * tradeAmt * 2;
  document.getElementById('exec-displacement').textContent = disp.toFixed(2) + '¢';
  document.getElementById('exec-spread').textContent = spread.toFixed(2) + '¢';
  document.getElementById('exec-total').textContent = '$' + roundTrip.toFixed(2);
  const tradeLabel = document.getElementById('exec-trade-label');
  if (tradeLabel) tradeLabel.textContent = sizeLabelsDisplay[sizeIdx] || '$50';
  window._execPlatform = platform;
};

document.addEventListener('DOMContentLoaded', () => {
  const sz = document.getElementById('exec-size');
  const dc = document.getElementById('exec-decile');
  if (sz) sz.addEventListener('input', () => updateExecCalc(window._execPlatform || 'polymarket'));
  if (dc) dc.addEventListener('input', () => updateExecCalc(window._execPlatform || 'polymarket'));
});

// --- 2. HHI Playground (draggable bars) ---
let hhiShares = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
let hhiDragging = -1;

function initHHI() {
  renderHHI();
  const canvas = document.getElementById('hhiPlayground');
  if (!canvas || canvas._hhiBound) return;
  canvas._hhiBound = true;
  const getIdx = (e) => { const r = canvas.getBoundingClientRect(); const x = (e.clientX || e.touches?.[0]?.clientX) - r.left; const bw = canvas.offsetWidth; return Math.floor((x - 4) / ((bw - 8) / 10)); };
  const getVal = (e) => { const r = canvas.getBoundingClientRect(); const y = (e.clientY || e.touches?.[0]?.clientY) - r.top; return Math.max(1, Math.min(80, Math.round((1 - (y - 20) / (canvas.height - 50)) * 80))); };
  canvas.addEventListener('mousedown', (e) => { const i = getIdx(e); if (i >= 0 && i < 10) { hhiDragging = i; hhiShares[i] = getVal(e); renderHHI(); } });
  canvas.addEventListener('mousemove', (e) => { if (hhiDragging >= 0) { hhiShares[hhiDragging] = getVal(e); renderHHI(); } });
  canvas.addEventListener('mouseup', () => { hhiDragging = -1; });
  canvas.addEventListener('mouseleave', () => { hhiDragging = -1; });
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const i = getIdx(e.touches[0]); if (i >= 0 && i < 10) { hhiDragging = i; hhiShares[i] = getVal(e.touches[0]); renderHHI(); } }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { if (hhiDragging >= 0) { e.preventDefault(); hhiShares[hhiDragging] = getVal(e.touches[0]); renderHHI(); } }, { passive: false });
  canvas.addEventListener('touchend', () => { hhiDragging = -1; });
}

function renderHHI() {
  const total = hhiShares.reduce((a, b) => a + b, 0) || 1;
  const hhi = hhiShares.reduce((sum, s) => sum + ((s / total) * 100) ** 2, 0);
  const hhiEl = document.getElementById('hhi-value');
  if (hhiEl) hhiEl.textContent = Math.round(hhi).toLocaleString();
  const verdict = document.getElementById('hhi-verdict');
  if (verdict) {
    if (hhi < 1500) { verdict.textContent = 'Competitive'; verdict.style.color = '#00de95'; }
    else if (hhi < 2500) { verdict.textContent = 'Moderately Concentrated'; verdict.style.color = '#e6a93e'; }
    else { verdict.textContent = 'Highly Concentrated'; verdict.style.color = '#fe4a49'; }
  }
  const canvas = document.getElementById('hhiPlayground');
  if (!canvas) return;
  const { ctx, w, h } = setupHiDPICanvas(canvas, canvas.offsetWidth, 280);
  ctx.clearRect(0, 0, w, h);
  const barW = (w - 8) / 10;
  hhiShares.forEach((s, i) => {
    const barH = (s / 80) * (h - 50);
    const x = 4 + i * barW;
    const y = h - 16 - barH;
    const pct = (s / total) * 100;
    const alpha = hhiDragging === i ? 1 : Math.min(0.3 + pct / 40, 1);
    ctx.fillStyle = `rgba(230, 169, 62, ${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x + 3, y, barW - 6, barH, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(237,230,221,0.6)';
    ctx.font = '600 12px Poppins';
    ctx.textAlign = 'center';
    ctx.fillText(pct.toFixed(0) + '%', x + barW / 2, y - 6);
    ctx.fillStyle = 'rgba(237,230,221,0.25)';
    ctx.font = '10px Inter';
    ctx.fillText('Mkt ' + (i + 1), x + barW / 2, h - 2);
  });
}

window.setHHIPreset = function(preset) {
  const presets = {
    equal: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
    election: [55, 15, 8, 5, 4, 3, 3, 3, 2, 2],
    duopoly: [35, 35, 6, 5, 4, 4, 3, 3, 3, 2],
    monopoly: [70, 8, 5, 4, 3, 3, 3, 2, 1, 1],
  };
  hhiShares = [...(presets[preset] || presets.equal)];
  renderHHI();
};

// --- 3. Trade Lifecycle Animator ---
window.animateLifecycle = function() {
  resetLifecycle();
  ['lifecycle-kalshi', 'lifecycle-poly'].forEach(trackId => {
    const steps = document.querySelectorAll(`#${trackId} .lifecycle-step`);
    const delays = trackId.includes('kalshi') ? [0, 400, 800, 1200, 1800] : [0, 500, 1000, 1600, 2400];
    delays.forEach((d, i) => {
      setTimeout(() => {
        steps.forEach((s, j) => {
          if (j < i) s.classList.add('done');
          else s.classList.remove('done');
          s.classList.toggle('active', j === i);
        });
      }, d);
      if (i === steps.length - 1) setTimeout(() => { steps[i].classList.remove('active'); steps[i].classList.add('done'); }, d + 600);
    });
  });
};

window.resetLifecycle = function() {
  document.querySelectorAll('.lifecycle-step').forEach(s => s.classList.remove('active', 'done'));
};

// --- 4. Parlay Builder ---
function initParlay() {
  document.querySelectorAll('.parlay-prob').forEach(slider => {
    slider.addEventListener('input', function() {
      this.parentElement.querySelector('.parlay-prob-label').textContent = this.value + '%';
      updateParlay();
    });
  });
  updateParlay();
}

window.addParlayLeg = function() {
  const container = document.getElementById('parlay-legs');
  const legs = container.querySelectorAll('.parlay-leg');
  if (legs.length >= 4) return;
  const n = legs.length + 1;
  const div = document.createElement('div');
  div.className = 'parlay-leg';
  div.innerHTML = `<input type="text" class="parlay-name" placeholder="Event ${n}" value="Event ${String.fromCharCode(64 + n)}"><div style="display:flex;align-items:center;gap:8px"><input type="range" class="parlay-prob" min="1" max="99" value="50" style="flex:1;accent-color:#2f5cff"><span class="parlay-prob-label">50%</span></div>`;
  container.appendChild(div);
  div.querySelector('.parlay-prob').addEventListener('input', function() {
    this.parentElement.querySelector('.parlay-prob-label').textContent = this.value + '%';
    updateParlay();
  });
  updateParlay();
};

window.removeParlayLeg = function() {
  const container = document.getElementById('parlay-legs');
  const legs = container.querySelectorAll('.parlay-leg');
  if (legs.length <= 2) return;
  legs[legs.length - 1].remove();
  updateParlay();
};

function updateParlay() {
  const probs = [...document.querySelectorAll('.parlay-prob')].map(s => parseInt(s.value) / 100);
  const combined = probs.reduce((a, b) => a * b, 1);
  const betSize = 10;
  document.getElementById('parlay-combined').textContent = (combined * 100).toFixed(1) + '%';
  document.getElementById('parlay-payout').textContent = '$' + (betSize / combined).toFixed(2);
  document.getElementById('parlay-separate').textContent = '$' + probs.reduce((sum, p) => sum + betSize * (1 / p - 1) * p, 0).toFixed(2);
  document.getElementById('parlay-premium').textContent = probs.length <= 2 ? '~3-5%' : probs.length === 3 ? '~5-8%' : '~8-12%';
}

// --- 4. Revenue Waterfall (Canvas Sankey with hover) ---
let sankeyNodes, sankeyFlows, sankeyHover = -1;

function drawSankey(highlightNode) {
  const canvas = document.getElementById('sankeyCanvas');
  if (!canvas) return;
  const { ctx, w, h } = setupHiDPICanvas(canvas, canvas.offsetWidth, 380);
  ctx.clearRect(0, 0, w, h);

  const cols = [w * 0.05, w * 0.28, w * 0.52, w * 0.78];
  const nodeW = 14;

  // Define flows first, then compute node heights
  sankeyFlows = [
    // Users → Rails [from, to, value]
    [0,3,30],[0,4,20],[0,5,5],     // Retail: mostly Poly+Kalshi
    [1,5,20],[1,4,16],[1,3,6],     // Institutions: mostly TradFi+Kalshi
    [2,3,16],[2,4,4],              // Bots: mostly Polymarket
    // Rails → Revenue
    [3,6,20],[3,7,14],[3,8,8],[3,9,6],  // Poly → fees, data, routing, cross-sell
    [4,6,18],[4,7,6],[4,9,10],          // Kalshi → fees, data, cross-sell
    [5,6,14],[5,8,6],                    // TradFi → fees, routing
    // Revenue → Capture
    [6,10,30],[6,13,6],             // Fees → Rail operators + Tooling
    [7,12,16],                      // Data → Media/Data
    [8,11,14],                      // Routing → Brokers
    [9,11,10],[9,13,4],             // Cross-sell → Brokers + Tooling
  ];

  // Node definitions with colors matching platform brands
  const nodeDefs = [
    // Col 0: Users
    { label: 'Retail Users', col: 0, color: 'rgba(237,230,221,0.6)' },   // 0
    { label: 'Institutions', col: 0, color: 'rgba(237,230,221,0.45)' },  // 1
    { label: 'Bots / Agents', col: 0, color: 'rgba(237,230,221,0.35)' }, // 2
    // Col 1: Rails
    { label: 'Polymarket', col: 1, color: '#2f5cff' },   // 3
    { label: 'Kalshi', col: 1, color: '#00de95' },        // 4
    { label: 'TradFi Rails', col: 1, color: '#c46560' },  // 5
    // Col 2: Revenue streams
    { label: 'Trading Fees', col: 2, color: 'rgba(237,230,221,0.5)' },  // 6
    { label: 'Data Licensing', col: 2, color: '#fe5915' },               // 7
    { label: 'Flow / Routing', col: 2, color: '#e6a93e' },               // 8
    { label: 'Cross-sell', col: 2, color: '#e6a93e' },                   // 9
    // Col 3: Value capture
    { label: 'Rail Operators', col: 3, color: 'rgba(237,230,221,0.5)' }, // 10
    { label: 'Brokers / Apps', col: 3, color: '#e6a93e' },               // 11
    { label: 'Media / Data', col: 3, color: '#fe5915' },                 // 12
    { label: 'Tooling', col: 3, color: '#9cc085' },                      // 13
  ];

  // Compute node heights proportional to max(inflow, outflow)
  const inflow = new Array(nodeDefs.length).fill(0);
  const outflow = new Array(nodeDefs.length).fill(0);
  sankeyFlows.forEach(([fi, ti, v]) => { outflow[fi] += v; inflow[ti] += v; });
  const nodeMaxFlow = nodeDefs.map((_, i) => Math.max(inflow[i], outflow[i], 1));
  const globalMax = Math.max(...nodeMaxFlow);
  const maxNodeH = 90, minNodeH = 16;

  // Layout nodes by column
  const colNodes = [[], [], [], []];
  nodeDefs.forEach((nd, i) => colNodes[nd.col].push(i));
  sankeyNodes = nodeDefs.map((nd, i) => ({
    ...nd, idx: i,
    h: Math.max(minNodeH, (nodeMaxFlow[i] / globalMax) * maxNodeH),
    x: cols[nd.col], y: 0,
  }));
  // Position vertically within each column
  colNodes.forEach(indices => {
    const totalH = indices.reduce((s, i) => s + sankeyNodes[i].h, 0);
    const gap = Math.min(16, (h - 40 - totalH) / Math.max(indices.length - 1, 1));
    let cy = 20;
    indices.forEach(i => { sankeyNodes[i].y = cy; cy += sankeyNodes[i].h + gap; });
  });

  const hn = highlightNode ?? -1;
  // Build adjacency for full-path tracing (forward + backward)
  const connectedFlows = new Set();
  const connectedNodes = new Set();
  if (hn >= 0) {
    connectedNodes.add(hn);
    // Trace forward (downstream)
    const queue = [hn];
    const visited = new Set([hn]);
    while (queue.length) {
      const cur = queue.shift();
      sankeyFlows.forEach(([fi, ti], idx) => {
        if (fi === cur && !visited.has(ti)) { visited.add(ti); connectedNodes.add(ti); connectedFlows.add(idx); queue.push(ti); }
      });
    }
    // Trace backward (upstream)
    const queueB = [hn];
    const visitedB = new Set([hn]);
    while (queueB.length) {
      const cur = queueB.shift();
      sankeyFlows.forEach(([fi, ti], idx) => {
        if (ti === cur && !visitedB.has(fi)) { visitedB.add(fi); connectedNodes.add(fi); connectedFlows.add(idx); queueB.push(fi); }
      });
    }
  }

  // Draw flows — use destination color for better visibility
  sankeyFlows.forEach(([fi, ti, thickness], idx) => {
    const f = sankeyNodes[fi], t = sankeyNodes[ti];
    const x1 = f.x + nodeW, y1 = f.y + f.h / 2, x2 = t.x, y2 = t.y + t.h / 2;
    const cp1x = x1 + (x2 - x1) * 0.4, cp2x = x2 - (x2 - x1) * 0.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1 - thickness / 2);
    ctx.bezierCurveTo(cp1x, y1 - thickness / 2, cp2x, y2 - thickness / 2, x2, y2 - thickness / 2);
    ctx.lineTo(x2, y2 + thickness / 2);
    ctx.bezierCurveTo(cp2x, y2 + thickness / 2, cp1x, y1 + thickness / 2, x1, y1 + thickness / 2);
    ctx.closePath();
    // Pick the more colorful of source/dest (avoid grey user nodes)
    const flowColor = (f.color.startsWith('rgba') && !t.color.startsWith('rgba')) ? t.color :
                      (!f.color.startsWith('rgba') ? f.color : t.color);
    const isRelevant = hn < 0 || connectedFlows.has(idx);
    ctx.fillStyle = isRelevant ? (flowColor + '35') : (flowColor + '08');
    ctx.fill();
  });

  // Draw nodes
  sankeyNodes.forEach((n, i) => {
    const dim = hn >= 0 && !connectedNodes.has(i);
    ctx.fillStyle = dim ? (n.color.startsWith('rgba') ? 'rgba(237,230,221,0.08)' : n.color + '20') : n.color;
    ctx.beginPath();
    ctx.roundRect(n.x, n.y, nodeW, n.h, 4);
    ctx.fill();
    ctx.fillStyle = dim ? 'rgba(237,230,221,0.12)' : 'rgba(237,230,221,0.8)';
    ctx.font = '12px Poppins';
    ctx.textAlign = 'left';
    ctx.fillText(n.label, n.x + nodeW + 6, n.y + n.h / 2 + 4);
  });

  // Column headers
  ctx.fillStyle = 'rgba(237,230,221,0.35)';
  ctx.font = '11px Poppins';
  ctx.textAlign = 'center';
  ['Users', 'Rails', 'Revenue Streams', 'Value Capture'].forEach((l, i) => {
    ctx.fillText(l.toUpperCase(), cols[i] + nodeW / 2, h - 5);
  });

  // Bind hover once
  if (!canvas._sankeyBound) {
    canvas._sankeyBound = true;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let hit = -1;
      let bestDist = Infinity;
      // Check nodes — find closest node by center distance, within hit bounds
      sankeyNodes.forEach((n, i) => {
        const inX = mx >= n.x - 4 && mx <= n.x + nodeW + 100;
        const inY = my >= n.y - 4 && my <= n.y + n.h + 4;
        if (inX && inY) {
          const dist = Math.abs(my - (n.y + n.h / 2));
          if (dist < bestDist) { bestDist = dist; hit = i; }
        }
      });
      if (hit !== sankeyHover) { sankeyHover = hit; drawSankey(hit); }
    });
    canvas.addEventListener('mouseleave', () => { sankeyHover = -1; drawSankey(-1); });
  }
}

// ============ REPORT-EMBEDDED WIDGETS ============

function drawSankeyOnCanvas(canvasId, highlightNode, onHoverCb) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { ctx, w, h } = setupHiDPICanvas(canvas, canvas.offsetWidth, 380);
  ctx.clearRect(0, 0, w, h);
  const cols = [w*0.05, w*0.28, w*0.52, w*0.78], nodeW = 14;
  const flows = [[0,3,30],[0,4,20],[0,5,5],[1,5,20],[1,4,16],[1,3,6],[2,3,16],[2,4,4],[3,6,20],[3,7,14],[3,8,8],[3,9,6],[4,6,18],[4,7,6],[4,9,10],[5,6,14],[5,8,6],[6,10,30],[6,13,6],[7,12,16],[8,11,14],[9,11,10],[9,13,4]];
  const nd = [
    {l:'Retail Users',c:0,co:'rgba(237,230,221,0.6)'},{l:'Institutions',c:0,co:'rgba(237,230,221,0.45)'},{l:'Bots / Agents',c:0,co:'rgba(237,230,221,0.35)'},
    {l:'Polymarket',c:1,co:'#2f5cff'},{l:'Kalshi',c:1,co:'#00de95'},{l:'TradFi Rails',c:1,co:'#c46560'},
    {l:'Trading Fees',c:2,co:'rgba(237,230,221,0.5)'},{l:'Data Licensing',c:2,co:'#fe5915'},{l:'Flow / Routing',c:2,co:'#e6a93e'},{l:'Cross-sell',c:2,co:'#e6a93e'},
    {l:'Rail Operators',c:3,co:'rgba(237,230,221,0.5)'},{l:'Brokers / Apps',c:3,co:'#e6a93e'},{l:'Media / Data',c:3,co:'#fe5915'},{l:'Tooling',c:3,co:'#9cc085'}
  ];
  const inf=new Array(14).fill(0),outf=new Array(14).fill(0);
  flows.forEach(([fi,ti,v])=>{outf[fi]+=v;inf[ti]+=v;});
  const mxF=nd.map((_,i)=>Math.max(inf[i],outf[i],1)),gM=Math.max(...mxF);
  const cN=[[],[],[],[]];nd.forEach((n,i)=>cN[n.c].push(i));
  const nodes=nd.map((n,i)=>({label:n.l,color:n.co,h:Math.max(16,(mxF[i]/gM)*90),x:cols[n.c],y:0}));
  cN.forEach(ids=>{const tH=ids.reduce((s,i)=>s+nodes[i].h,0);const g=Math.min(16,(h-40-tH)/Math.max(ids.length-1,1));let cy=20;ids.forEach(i=>{nodes[i].y=cy;cy+=nodes[i].h+g;});});
  const hn=highlightNode??-1,cFl=new Set(),cNo=new Set();
  if(hn>=0){cNo.add(hn);const q=[hn],v=new Set([hn]);while(q.length){const c=q.shift();flows.forEach(([fi,ti],idx)=>{if(fi===c&&!v.has(ti)){v.add(ti);cNo.add(ti);cFl.add(idx);q.push(ti);}});}const qB=[hn],vB=new Set([hn]);while(qB.length){const c=qB.shift();flows.forEach(([fi,ti],idx)=>{if(ti===c&&!vB.has(fi)){vB.add(fi);cNo.add(fi);cFl.add(idx);qB.push(fi);}});}}
  flows.forEach(([fi,ti,th],idx)=>{const f=nodes[fi],t=nodes[ti];const x1=f.x+nodeW,y1=f.y+f.h/2,x2=t.x,y2=t.y+t.h/2;const c1=x1+(x2-x1)*0.4,c2=x2-(x2-x1)*0.4;ctx.beginPath();ctx.moveTo(x1,y1-th/2);ctx.bezierCurveTo(c1,y1-th/2,c2,y2-th/2,x2,y2-th/2);ctx.lineTo(x2,y2+th/2);ctx.bezierCurveTo(c2,y2+th/2,c1,y1+th/2,x1,y1+th/2);ctx.closePath();const fc=(f.color.startsWith('rgba')&&!t.color.startsWith('rgba'))?t.color:(!f.color.startsWith('rgba')?f.color:t.color);ctx.fillStyle=(hn<0||cFl.has(idx))?(fc+'35'):(fc+'08');ctx.fill();});
  nodes.forEach((n,i)=>{const dim=hn>=0&&!cNo.has(i);ctx.fillStyle=dim?(n.color.startsWith('rgba')?'rgba(237,230,221,0.08)':n.color+'20'):n.color;ctx.beginPath();ctx.roundRect(n.x,n.y,nodeW,n.h,4);ctx.fill();ctx.fillStyle=dim?'rgba(237,230,221,0.12)':'rgba(237,230,221,0.8)';ctx.font='12px Poppins';ctx.textAlign='left';ctx.fillText(n.label,n.x+nodeW+6,n.y+n.h/2+4);});
  ctx.fillStyle='rgba(237,230,221,0.35)';ctx.font='11px Poppins';ctx.textAlign='center';['Users','Rails','Revenue Streams','Value Capture'].forEach((l,i)=>{ctx.fillText(l.toUpperCase(),cols[i]+nodeW/2,h-5);});
  if(!canvas._bound){canvas._bound=true;canvas.style.cursor='pointer';canvas.addEventListener('mousemove',(e)=>{const r=canvas.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;let hit=-1,best=999;nodes.forEach((n,i)=>{if(mx>=n.x-4&&mx<=n.x+nodeW+100&&my>=n.y-4&&my<=n.y+n.h+4){const d=Math.abs(my-(n.y+n.h/2));if(d<best){best=d;hit=i;}}});if(hit!==canvas._hover){canvas._hover=hit;onHoverCb(hit);}});canvas.addEventListener('mouseleave',()=>{canvas._hover=-1;onHoverCb(-1);});}
}

// Report HHI
let rptHhiShares = [10,10,10,10,10,10,10,10,10,10];
let rptHhiDrag = -1;

function initRptHHI() {
  renderRptHHI();
  const canvas = document.getElementById('rptHhiPlayground');
  if (!canvas || canvas._bound) return;
  canvas._bound = true;
  const getIdx=(e)=>{const r=canvas.getBoundingClientRect();const x=(e.clientX||e.touches?.[0]?.clientX)-r.left;return Math.floor((x-4)/((canvas.offsetWidth-8)/10));};
  const getVal=(e)=>{const r=canvas.getBoundingClientRect();const y=(e.clientY||e.touches?.[0]?.clientY)-r.top;return Math.max(1,Math.min(80,Math.round((1-(y-20)/(canvas.height-50))*80)));};
  canvas.addEventListener('mousedown',(e)=>{const i=getIdx(e);if(i>=0&&i<10){rptHhiDrag=i;rptHhiShares[i]=getVal(e);renderRptHHI();}});
  canvas.addEventListener('mousemove',(e)=>{if(rptHhiDrag>=0){rptHhiShares[rptHhiDrag]=getVal(e);renderRptHHI();}});
  canvas.addEventListener('mouseup',()=>{rptHhiDrag=-1;});
  canvas.addEventListener('mouseleave',()=>{rptHhiDrag=-1;});
}

function renderRptHHI() {
  const total=rptHhiShares.reduce((a,b)=>a+b,0)||1;
  const hhi=rptHhiShares.reduce((s,v)=>s+((v/total)*100)**2,0);
  const el=document.getElementById('rpt-hhi-value');if(el)el.textContent=Math.round(hhi).toLocaleString();
  const vd=document.getElementById('rpt-hhi-verdict');
  if(vd){if(hhi<1500){vd.textContent='Competitive';vd.style.color='#00de95';}else if(hhi<2500){vd.textContent='Moderately Concentrated';vd.style.color='#e6a93e';}else{vd.textContent='Highly Concentrated';vd.style.color='#fe4a49';}}
  const canvas=document.getElementById('rptHhiPlayground');if(!canvas)return;
  const {ctx,w,h}=setupHiDPICanvas(canvas,canvas.offsetWidth,240);ctx.clearRect(0,0,w,h);
  const barW=(w-8)/10;
  rptHhiShares.forEach((s,i)=>{const barH=(s/80)*(h-50);const x=4+i*barW;const y=h-16-barH;const pct=(s/total)*100;
    ctx.fillStyle=rptHhiDrag===i?'rgba(230,169,62,1)':`rgba(230,169,62,${Math.min(0.3+pct/40,1)})`;ctx.beginPath();ctx.roundRect(x+2,y,barW-4,barH,4);ctx.fill();
    ctx.fillStyle='rgba(237,230,221,0.6)';ctx.font='600 11px Poppins';ctx.textAlign='center';ctx.fillText(pct.toFixed(0)+'%',x+barW/2,y-5);
    ctx.fillStyle='rgba(237,230,221,0.22)';ctx.font='9px Inter';ctx.fillText('Mkt '+(i+1),x+barW/2,h-2);
  });
}

window.setRptHHIPreset = function(p) {
  const presets={equal:[10,10,10,10,10,10,10,10,10,10],election:[55,15,8,5,4,3,3,3,2,2],duopoly:[35,35,6,5,4,4,3,3,3,2],monopoly:[70,8,5,4,3,3,3,2,1,1]};
  rptHhiShares=[...(presets[p]||presets.equal)];renderRptHHI();
};

// Report Exec Calculator
window.updateRptExecCalc = function(platform) {
  document.getElementById('rpt-exec-poly').classList.toggle('active', platform === 'polymarket');
  document.getElementById('rpt-exec-kalshi').classList.toggle('active', platform === 'kalshi');
  const sizeIdx=parseInt(document.getElementById('rpt-exec-size').value);
  const decileIdx=parseInt(document.getElementById('rpt-exec-decile').value);
  const sizeBuckets=['1 - <$1','2 - $1-$10','3 - $10-$100','4 - $100-$1K','5 - $1K-$10K','6 - >$10K'];
  const sizeLabel=sizeBuckets[sizeIdx]||sizeBuckets[2];
  let dispBySize=0.5;if(execData?.displacement?.[platform])dispBySize=execData.displacement[platform][sizeLabel]||0.5;
  const decileOrder=decileIdx+1;let dispByDecile=execData?.decile?.[platform]?.[decileOrder]||dispBySize;
  const baselineSize=execData?.displacement?.[platform]?.['5 - $1K-$10K']||1;
  const sizeRatio=dispBySize/(baselineSize||1);let disp=dispByDecile*sizeRatio;
  let spread=execData?.bounce?.[platform]||0.8;const topDecile=execData?.decile?.[platform]?.[1]||0.5;spread*=(dispByDecile/topDecile);
  const midSizes=[0.5,5,50,500,5000,50000];const sizeLabelsD=['$0.50','$5','$50','$500','$5K','$50K'];
  const tradeAmt=midSizes[sizeIdx]||50;const roundTrip=((disp+spread)/100)*tradeAmt*2;
  document.getElementById('rpt-exec-displacement').textContent=disp.toFixed(2)+'¢';
  document.getElementById('rpt-exec-spread').textContent=spread.toFixed(2)+'¢';
  document.getElementById('rpt-exec-total').textContent='$'+roundTrip.toFixed(2);
  const tl=document.getElementById('rpt-exec-trade-label');if(tl)tl.textContent=sizeLabelsD[sizeIdx]||'$50';
  window._rptExecPlatform=platform;
};

async function initReportWidgets() {
  if (!execData) {
    const [dRaw,bRaw,decRaw] = await Promise.all([
      loadCSV('6783193_s6-07_price_displacement_by_trade_size.csv'),
      loadCSV('6783192_s6-06_bounce_over_time_(quarterly).csv'),
      loadCSV('6783202_s6-14_the_execution_cliff_displacement_by_market_decile_(q4_2024_vs_2025).csv'),
    ]);
    execData={displacement:{},bounce:{},decile:{}};
    dRaw.forEach(r=>{if(!execData.displacement[r.platform])execData.displacement[r.platform]={};execData.displacement[r.platform][r.size_bucket]=r.avg_impact_cents;});
    const lQ=bRaw.reduce((a,b)=>(b.quarter_order||0)>(a.quarter_order||0)?b:a,bRaw[0]);
    bRaw.forEach(r=>{if(r.quarter===lQ.quarter)execData.bounce[r.platform]=r.realized_spread_cents;});
    decRaw.filter(r=>r.series&&r.series.includes('Q4 2025')).forEach(r=>{const p=r.series.includes('kalshi')?'kalshi':'polymarket';if(!execData.decile[p])execData.decile[p]={};execData.decile[p][r.decile_order]=r.median_1k_impact_cents;});
  }
  if(document.getElementById('rpt-exec-size')){
    updateRptExecCalc('polymarket');
    document.getElementById('rpt-exec-size').addEventListener('input',()=>updateRptExecCalc(window._rptExecPlatform||'polymarket'));
    document.getElementById('rpt-exec-decile').addEventListener('input',()=>updateRptExecCalc(window._rptExecPlatform||'polymarket'));
  }
  initRptHHI();
  if(document.getElementById('rptSankeyCanvas')){
    const draw=(hn)=>drawSankeyOnCanvas('rptSankeyCanvas',hn,draw);
    draw(-1);
  }
  buildRptFeeChart();
}

// ============ STACK DIAGRAM (Option A) ============
const stackDetails = {
  discovery: { title: 'Discovery & Aggregation', desc: 'The "search engine" layer. These tools help users find the best price across platforms, spot paired markets, and compare odds. They don\'t execute trades — they route attention. Value capture: lead-gen, affiliate, and the long game of becoming the default starting point.' },
  tooling: { title: 'Tooling & Analytics', desc: 'Power-user terminals for portfolio tracking, flow analysis, and advanced order execution. Think Bloomberg but for prediction markets. Value capture: subscriptions, premium features, and "flow intelligence" (who\'s buying what).' },
  data: { title: 'Data Distribution', desc: 'Enterprise feeds that pipe prediction market probabilities into existing media and financial workflows. This is the "probability-as-data" business line. Value capture: licensing fees, commercial partnerships, and embedded probability modules.' },
  brokers: { title: 'Broker / App Distribution', desc: 'The distribution surface where most users actually trade. Brokers and super-apps wrap rails with their own UX, retention loops, and cross-sell mechanics. They control the funnel. Value capture: order flow, cross-sell rent, and routing leverage over rails.' },
  crypto: { title: 'Crypto-Native Rails', desc: 'On-chain order books with trustless settlement. Polymarket runs a CLOB on Polygon with UMA\'s optimistic oracle for resolution. Permissionless market creation, global access, but requires crypto onboarding. Value capture: trading fees, liquidity network effects, and the "reference" probability surface.' },
  regulated: { title: 'Regulated Rails', desc: 'CFTC-regulated exchanges with off-chain matching and centralized settlement. Kalshi pioneered this — enabling broker distribution (Coinbase, Robinhood) because the compliance layer is already built. Value capture: trading fees, settlement enforceability, and compliance credibility.' },
  tradfi: { title: 'TradFi Rails', desc: 'Traditional finance incumbents filing to list "outcome-related options" under existing clearing regimes. Standardized specs that fit into existing risk frameworks. Value capture: standardized contracts under existing options/clearing regimes, institutional-grade trust.' },
};

document.querySelectorAll('.stack-sublayer').forEach(el => {
  el.addEventListener('mouseenter', () => {
    const sub = el.dataset.sub;
    const detail = stackDetails[sub];
    if (!detail) return;
    document.querySelectorAll('.stack-sublayer').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('stack-detail').innerHTML = `<strong style="color:var(--bm-cream)">${detail.title}</strong><br><span style="margin-top:6px;display:inline-block">${detail.desc}</span>`;
  });
});

// ============ PLATFORM MAPPER (Option B) ============
const platformStacks = {
  polymarket: {
    name: 'Polymarket', color: '#2f5cff', type: 'Rail + Own Wrapper',
    desc: 'Vertically integrated: owns both the rail (on-chain CLOB + UMA settlement) and the primary wrapper (polymarket.com). Also powers third-party wrappers through data partnerships (Dow Jones, ICE). The "reference market" for narrative events.',
    layers: { 'Execution Rail': 100, 'Settlement': 100, 'Market Creation': 100, 'Primary UX': 90, 'Data Distribution': 70, 'Broker Distribution': 20, 'Analytics': 10 }
  },
  kalshi: {
    name: 'Kalshi', color: '#00de95', type: 'Rail + Distribution Focus',
    desc: 'Owns the regulated rail (CFTC DCM) and aggressively distributes through wrappers. Coinbase and Robinhood both route order flow to Kalshi\'s rails. Sports + combos drive cadence. The "broker-friendly" rail.',
    layers: { 'Execution Rail': 100, 'Settlement': 100, 'Market Creation': 80, 'Primary UX': 70, 'Data Distribution': 50, 'Broker Distribution': 90, 'Analytics': 20 }
  },
  coinbase: {
    name: 'Coinbase', color: '#e6a93e', type: 'Pure Wrapper',
    desc: 'Does not own a rail — routes to Kalshi for execution and settlement. Captures order flow rent, cross-sell opportunities (crypto ↔ prediction markets), and retention through its existing 100M+ user base. Classic wrapper play.',
    layers: { 'Execution Rail': 0, 'Settlement': 0, 'Market Creation': 0, 'Primary UX': 95, 'Data Distribution': 10, 'Broker Distribution': 100, 'Analytics': 30 }
  },
  fanduel: {
    name: 'FanDuel Predicts', color: '#c46560', type: 'Gaming Wrapper + TradFi Rail',
    desc: 'Built on CME rails. Optimized for mobile-first, high-frequency engagement (sports + economic indicators). Leverages existing DFS/sportsbook user base for distribution. The "cadence market" archetype.',
    layers: { 'Execution Rail': 0, 'Settlement': 0, 'Market Creation': 0, 'Primary UX': 100, 'Data Distribution': 5, 'Broker Distribution': 80, 'Analytics': 15 }
  },
  nasdaq: {
    name: 'Nasdaq', color: '#9cc085', type: 'TradFi Rail (Emerging)',
    desc: 'Filed to list binary options on its Flagship 100 index. Operating under existing options/clearing frameworks. Targeting institutional adoption through standardized specs and existing compliance infrastructure. The "hedging market" rail.',
    layers: { 'Execution Rail': 100, 'Settlement': 100, 'Market Creation': 40, 'Primary UX': 20, 'Data Distribution': 60, 'Broker Distribution': 30, 'Analytics': 10 }
  },
};

window.showPlatformStack = function(key) {
  const p = platformStacks[key];
  if (!p) return;
  document.querySelectorAll('#widget-mapper .chart-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('mapper-' + key)?.classList.add('active');
  document.getElementById('mapper-title').textContent = p.name;
  document.getElementById('mapper-title').style.color = p.color;
  document.getElementById('mapper-type').textContent = p.type;
  document.getElementById('mapper-desc').textContent = p.desc;

  const container = document.getElementById('mapper-stack');
  container.innerHTML = '';
  const maxVal = Math.max(...Object.values(p.layers));
  Object.entries(p.layers).forEach(([layer, val]) => {
    const bar = document.createElement('div');
    bar.className = 'mapper-bar' + (val === 0 ? ' dimmed' : '');
    const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
    bar.innerHTML = `<span class="bar-label">${layer}</span><div class="bar-fill" style="width:${pct}%;background:${p.color};opacity:${val > 0 ? 0.3 + (val/100)*0.7 : 0.1}"></div><span style="font-size:0.72rem;color:rgba(237,230,221,0.4);min-width:30px;text-align:right">${val > 0 ? val + '%' : '—'}</span>`;
    container.appendChild(bar);
  });
};

// ============ PIPELINE ANIMATION ============
const pipeDetails = {
  0: { title: 'User Intent', body: 'Everything starts here. A user sees a market, forms a view, and decides to trade. The quality of the wrapper determines whether this moment converts into an order.' },
  1: { title: 'App / Interface (Wrapper)', body: 'The distribution surface. Could be Polymarket.com, Coinbase, Robinhood, or a third-party terminal. This layer captures attention rent and controls the user relationship.' },
  2: { title: 'Risk & Packaging (Wrapper)', body: 'Position sizing, margin checks, combo/parlay bundling. This is where RFQ mechanics live for multi-leg trades. Wrappers that package well retain users through expressiveness.' },
  3: { title: 'Order Routing (Wrapper)', body: 'Where the order gets directed. A broker might route to Kalshi, Polymarket, or even split across rails. This layer captures flow rent — whoever controls routing has leverage over rails.' },
  4: { title: 'Order Matching (Rail)', body: 'The order hits the book. Could be an on-chain CLOB (Polymarket) or an off-chain matching engine (Kalshi). Speed, fairness, and depth are determined here. This is where trading fees are earned.' },
  5: { title: 'Clearing & Custody (Rail)', body: 'Funds are locked, positions are recorded, counterparty risk is managed. On-chain this is automatic (smart contracts). Off-chain it requires a clearinghouse or CFTC-regulated custodian.' },
  6: { title: 'Settlement & Resolution (Rail)', body: 'The endgame. An oracle (UMA for Polymarket) or a regulated authority confirms the outcome and triggers payouts. Trust in this layer is existential — it\'s why UMA disputes matter. You now own the contract.' },
};

let pipeCurrentStep = -1;

function pipeRender() {
  const nodes = document.querySelectorAll('#pipeline-track .pipe-node');
  const maxStep = nodes.length - 1;
  nodes.forEach((n, j) => {
    n.classList.remove('active', 'done');
    if (j < pipeCurrentStep) n.classList.add('done');
    else if (j === pipeCurrentStep) n.classList.add('active');
  });
  const counter = document.getElementById('pipe-step-counter');
  const backBtn = document.getElementById('pipe-back-btn');
  const nextBtn = document.getElementById('pipe-next-btn');

  if (pipeCurrentStep < 0) {
    if (counter) counter.textContent = 'Click a step or press Next';
    document.getElementById('pipe-info-title').textContent = 'The Prediction Market Stack';
    document.getElementById('pipe-info-body').textContent = 'Click any step above to learn what happens at each layer. Wrappers handle everything the user sees; rails handle everything under the hood.';
  } else {
    if (counter) counter.textContent = `Step ${pipeCurrentStep + 1} of ${maxStep + 1}`;
    const detail = pipeDetails[pipeCurrentStep];
    if (detail) {
      document.getElementById('pipe-info-title').textContent = detail.title;
      document.getElementById('pipe-info-body').textContent = detail.body;
    }
  }

  // Update button states
  if (backBtn) {
    backBtn.style.display = pipeCurrentStep <= 0 ? 'none' : '';
  }
  if (nextBtn) {
    if (pipeCurrentStep >= maxStep) {
      nextBtn.innerHTML = '&#8634; Start Over';
      nextBtn.onclick = () => { pipeCurrentStep = -1; pipeRender(); };
    } else {
      nextBtn.innerHTML = 'Next &#9654;';
      nextBtn.onclick = () => pipeStep(1);
    }
  }
}

window.pipeStep = function(dir) {
  const nodes = document.querySelectorAll('#pipeline-track .pipe-node');
  pipeCurrentStep = Math.max(-1, Math.min(nodes.length - 1, pipeCurrentStep + dir));
  pipeRender();
};

window.pipeGoTo = function(step) {
  pipeCurrentStep = step;
  pipeRender();
};

// ============ MARKET ARCHETYPES INFOGRAPHIC ============
const archetypeData = {
  cadence: {
    color: '#80a76a',
    desc: 'High-frequency, entertainment-driven markets designed for repeat engagement. Users come back daily or hourly — think sports betting cadence applied to event contracts.',
    rows: [
      ['Users', 'Gamblers, sports bettors, retail entertainment flow', 'High volume, small-to-medium size, frequent'],
      ['Rail Revenue', 'Trading fees funded by retail entertainment flow', 'High transaction count compensates for smaller ticket sizes'],
      ['Wrapper Revenue', 'Retention loops and cross-sell', 'Combo/parlay packaging, gamification, push notifications, deposit bonuses'],
      ['Key Rails', 'Kalshi (CFTC), CME', 'Regulated rails enable broker distribution (Coinbase, Robinhood, FanDuel)'],
      ['Key Wrappers', 'FanDuel, Robinhood, Coinbase', 'Mobile-first apps with existing user bases and cross-sell funnels'],
      ['Moat', 'Distribution surface + cadence mechanics', 'Whoever owns the daily habit wins — combos are the retention superweapon'],
    ]
  },
  narrative: {
    color: '#2f5cff',
    desc: 'Attention-driven markets where users express and contest narratives in real time. Volume spikes around news cycles, and the market price itself becomes the signal.',
    rows: [
      ['Users', 'Narrative commentators, information traders, media consumers', 'Directional views on crypto, politics, culture, geopolitics'],
      ['Rail Revenue', 'Trading fees funded by attention-driven trading', 'Volume correlates with news cycles and social virality'],
      ['Wrapper Revenue', 'Probability-as-data distribution + power-user tooling', 'Publisher embeds (Dow Jones, CNBC), institutional data feeds (ICE), analytics terminals'],
      ['Key Rails', 'Polymarket (on-chain CLOB)', 'Permissionless market creation, speed-to-list, global access'],
      ['Key Wrappers', 'Dow Jones, ICE, PredictFolio, media embeds', 'The probability surface becomes a media product — embedded everywhere'],
      ['Moat', 'Breadth + speed-to-list + reference surface', 'Being the market everyone quotes creates a self-reinforcing data moat'],
    ]
  },
  hedging: {
    color: '#e6a93e',
    desc: 'Risk-transfer markets where informed traders and hedgers express precise economic views. Deep liquidity and clear resolution criteria are non-negotiable.',
    rows: [
      ['Users', 'Hedgers, macro traders, institutional desks', 'De-risking specific tail exposures (rates, policy, macro releases)'],
      ['Rail Revenue', 'Trading fees funded by hedgers and informed traders', 'Fewer but larger trades; value comes from precision and depth'],
      ['Wrapper Revenue', 'Workflow embedding + trust/permissioning', 'Broker/terminal integration (Tradeweb), institutional portals, compliance layers'],
      ['Key Rails', 'Nasdaq, Cboe, CME (emerging)', 'Standardized specs under existing options/clearing regimes'],
      ['Key Wrappers', 'Tradeweb, Bloomberg-style terminals', 'Embedding event contracts into existing macro/risk workflows'],
      ['Moat', 'Standardization + institutional trust', 'Spec standardization enables cross-platform distribution; trust enables size'],
    ]
  },
};

window.selectArchetype = function(arch) {
  const data = archetypeData[arch];
  if (!data) return;

  document.querySelectorAll('.archetype-card').forEach(card => {
    const isActive = card.dataset.arch === arch;
    card.classList.toggle('active', isActive);
    // Dim non-active cards
    card.style.opacity = isActive ? '1' : '0.4';
    // Highlight the entire box with a colored border + subtle glow
    card.style.borderColor = isActive ? data.color : 'rgba(237,230,221,0.08)';
    card.style.boxShadow = isActive ? `0 0 16px ${data.color}25, inset 0 0 0 1px ${data.color}40` : 'none';
    card.style.background = isActive ? `${data.color}08` : 'rgba(237,230,221,0.02)';
    // Color the active card's name
    const name = card.querySelector('.arch-name');
    if (name) name.style.color = isActive ? data.color : '';
  });

  const c = data.color;
  const headers = ['', 'What', 'Why it matters'];
  let html = `<div style="padding:14px 16px;background:${c}10;border-bottom:1px solid ${c}30"><span style="font-family:'Poppins',sans-serif;font-weight:700;font-size:0.95rem;color:${c}">${data.desc}</span></div>`;
  html += `<div class="arch-detail-row" style="background:rgba(237,230,221,0.02)">`;
  headers.forEach(h => { html += `<div class="arch-detail-header">${h}</div>`; });
  html += `</div>`;

  const rowIcons = ['&#128101;', '&#9881;', '&#128230;', '&#128737;', '&#127760;', '&#128170;'];
  data.rows.forEach(([label, what, why], i) => {
    html += `<div class="arch-detail-row" style="border-left:3px solid ${c}60">`;
    html += `<div class="arch-detail-cell"><span style="margin-right:4px">${rowIcons[i]}</span> ${label}</div>`;
    html += `<div class="arch-detail-cell">${what}</div>`;
    html += `<div class="arch-detail-cell" style="color:rgba(237,230,221,0.5)">${why}</div>`;
    html += `</div>`;
  });

  document.getElementById('arch-detail-inner').innerHTML = html;
};

// ============ FEE COMPARISON WIDGET ============
const polyFeeCategories = {
  crypto:      { rate: 0.072, exp: 1,   makerRebate: 0.20 },
  sports:      { rate: 0.03,  exp: 1,   makerRebate: 0.25 },
  finance:     { rate: 0.04,  exp: 1,   makerRebate: 0.50 },
  politics:    { rate: 0.04,  exp: 1,   makerRebate: 0.25 },
  economics:   { rate: 0.03,  exp: 0.5, makerRebate: 0.25 },
  culture:     { rate: 0.05,  exp: 1,   makerRebate: 0.25 },
  weather:     { rate: 0.025, exp: 0.5, makerRebate: 0.25 },
  other:       { rate: 0.2,   exp: 2,   makerRebate: 0.25 },
  mentions:    { rate: 0.25,  exp: 2,   makerRebate: 0.25 },
  tech:        { rate: 0.04,  exp: 1,   makerRebate: 0.25 },
  geopolitical:{ rate: 0,     exp: 1,   makerRebate: 0 },
};

// Effective fee rate (%) — fee as % of notional (cost of shares)
// Polymarket: fee = C × p × feeRate × (p(1-p))^exp
//   effective rate = fee/(C×p) = feeRate × (p(1-p))^exp → symmetric bell curves
// Kalshi: fee = rate × C × P × (1-P)
//   effective rate = fee/(C×P) = rate × (1-P) → linear decline
//   This is correct: Kalshi charges proportional to potential payout, not share price

function polyEffRate(p, category) {
  const cat = polyFeeCategories[category];
  if (!cat || cat.rate === 0) return 0;
  return cat.rate * Math.pow(p * (1 - p), cat.exp) * 100;
}

function kalshiEffRate(p, type) {
  const rate = type === 'index' ? 0.035 : 0.07;
  return rate * (1 - p) * 100;
}

// Also provide dollar fee for stat cards
function polyDollarFee(p, category, C) {
  const cat = polyFeeCategories[category];
  if (!cat || cat.rate === 0) return 0;
  return C * p * cat.rate * Math.pow(p * (1 - p), cat.exp);
}
function kalshiDollarFee(p, type, C) {
  const rate = type === 'index' ? 0.035 : 0.07;
  return rate * C * p * (1 - p);
}

function buildFeeChart() {
  const canvas = document.getElementById('feeCompChart');
  if (!canvas) return;

  const probs = [];
  for (let i = 1; i <= 99; i++) probs.push(i / 100);

  // Grouped by exponent: exp=0.5 (wide curve), exp=1 (standard bell), exp=2 (narrow spike)
  const catGroups = [
    // exp = 0.5 (wide/flat curves)
    { label: 'Economics (exp=0.5)', cat: 'economics', color: '#a78bfa', width: 2 },
    { label: 'Weather (exp=0.5)', cat: 'weather', color: '#f97316', width: 2 },
    // exp = 1 (standard bell)
    { label: 'Crypto', cat: 'crypto', color: '#2f5cff', width: 2.5 },
    { label: 'Sports', cat: 'sports', color: '#e6a93e', width: 2 },
    { label: 'Finance / Politics / Tech', cat: 'finance', color: '#93aaff', width: 2 },
    { label: 'Culture', cat: 'culture', color: '#c46560', width: 2 },
    // exp = 2 (narrow spike)
    { label: 'Other / General (exp=2)', cat: 'other', color: '#e879a8', width: 2 },
    { label: 'Mentions (exp=2)', cat: 'mentions', color: '#38bdf8', width: 2 },
    // Free
    { label: 'Geopolitical (free)', cat: 'geopolitical', color: '#ef4444', width: 1.5 },
  ];

  // 9 Polymarket + 2 Kalshi = 11 datasets
  const datasets = [];
  catGroups.forEach(g => {
    datasets.push({
      label: g.label, data: probs.map(p => +(polyEffRate(p, g.cat)).toFixed(4)),
      borderColor: g.color, backgroundColor: 'transparent', borderWidth: g.width,
      borderDash: g.borderDash || [], pointRadius: 0, pointHoverRadius: 3,
    });
  });
  datasets.push({
    label: 'Kalshi (Standard)', data: probs.map(p => +(kalshiEffRate(p, 'standard')).toFixed(4)),
    borderColor: BM.kalshi, backgroundColor: 'transparent', borderWidth: 3,
    borderDash: [8, 4], pointRadius: 0, pointHoverRadius: 3,
  });
  datasets.push({
    label: 'Kalshi (S&P/Nasdaq)', data: probs.map(p => +(kalshiEffRate(p, 'index')).toFixed(4)),
    borderColor: 'rgba(0,222,149,0.5)', backgroundColor: 'transparent', borderWidth: 2,
    borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 3,
  });

  // Stat cards (Politics vs Kalshi Standard)
  const p50poly = polyEffRate(0.5, 'politics'), p50kalshi = kalshiEffRate(0.5, 'standard');
  const p80poly = polyEffRate(0.8, 'politics'), p80kalshi = kalshiEffRate(0.8, 'standard');
  document.getElementById('feePoly50').textContent = p50poly.toFixed(2) + '% ($' + polyDollarFee(0.5, 'politics', 100).toFixed(2) + ')';
  document.getElementById('feeKalshi50').textContent = p50kalshi.toFixed(2) + '% ($' + kalshiDollarFee(0.5, 'standard', 100).toFixed(2) + ')';
  document.getElementById('feePoly80').textContent = p80poly.toFixed(2) + '% ($' + polyDollarFee(0.8, 'politics', 100).toFixed(2) + ')';
  document.getElementById('feeKalshi80').textContent = p80kalshi.toFixed(2) + '% ($' + kalshiDollarFee(0.8, 'standard', 100).toFixed(2) + ')';

  charts.feeCompChart = new Chart(canvas, {
    type: 'line',
    data: { labels: probs.map(p => p.toFixed(2)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx) => `Share price: ${ctx[0].label}`,
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(3)}%`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Share Price', color: BM.creamFaded },
          ticks: {
            callback: (v, i) => {
              const p = probs[i];
              if (p !== undefined && [0.01, 0.25, 0.50, 0.75, 0.99].includes(Math.round(p * 100) / 100)) return p.toFixed(2);
              return '';
            },
            autoSkip: false,
            maxRotation: 0,
          },
        },
        y: {
          min: 0,
          title: { display: true, text: 'Effective Fee Rate (%)', color: BM.creamFaded },
          ticks: { callback: (v) => v.toFixed(1) + '%' },
        },
      },
    },
  });

  // Legend toggle: click items to show/hide datasets
  document.querySelectorAll('.fee-legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      const meta = charts.feeCompChart.getDatasetMeta(idx);
      meta.hidden = !meta.hidden;
      item.style.opacity = meta.hidden ? '0.3' : '1';
      charts.feeCompChart.update();
    });
  });
}

// Init fee chart when tinkering view is shown
const feeObserver = new MutationObserver(() => {
  const el = document.getElementById('tinkeringView');
  if (el && !el.classList.contains('hidden') && !charts.feeCompChart) {
    buildFeeChart();
  }
});
feeObserver.observe(document.getElementById('tinkeringView') || document.body, { attributes: true, attributeFilter: ['class'] });
// Also try on view tab click
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.view-tab');
  if (tab && tab.dataset.view === 'tinkering') {
    setTimeout(buildFeeChart, 100);
  }
});

// Report-inline fee chart (separate canvas)
function buildRptFeeChart() {
  const canvas = document.getElementById('rptFeeCompChart');
  if (!canvas || charts.rptFeeCompChart) return;

  const probs = [];
  for (let i = 1; i <= 99; i++) probs.push(i / 100);

  const catGroups = [
    { label: 'Economics (exp=0.5)', cat: 'economics', color: '#a78bfa', width: 2 },
    { label: 'Weather (exp=0.5)', cat: 'weather', color: '#f97316', width: 2 },
    { label: 'Crypto', cat: 'crypto', color: '#2f5cff', width: 2.5 },
    { label: 'Sports', cat: 'sports', color: '#e6a93e', width: 2 },
    { label: 'Finance / Politics / Tech', cat: 'finance', color: '#93aaff', width: 2 },
    { label: 'Culture', cat: 'culture', color: '#c46560', width: 2 },
    { label: 'Other / General (exp=2)', cat: 'other', color: '#e879a8', width: 2 },
    { label: 'Mentions (exp=2)', cat: 'mentions', color: '#38bdf8', width: 2 },
    { label: 'Geopolitical (free)', cat: 'geopolitical', color: '#ef4444', width: 1.5 },
  ];

  // Default to dollar view
  const datasets = [];
  catGroups.forEach(g => {
    datasets.push({
      label: g.label, data: probs.map(p => +(polyDollarFee(p, g.cat, 100)).toFixed(4)),
      borderColor: g.color, backgroundColor: 'transparent', borderWidth: g.width,
      borderDash: [], pointRadius: 0, pointHoverRadius: 3,
    });
  });
  datasets.push({
    label: 'Kalshi (Standard)', data: probs.map(p => +(kalshiDollarFee(p, 'standard', 100)).toFixed(4)),
    borderColor: BM.kalshi, backgroundColor: 'transparent', borderWidth: 3,
    borderDash: [8, 4], pointRadius: 0, pointHoverRadius: 3,
  });
  datasets.push({
    label: 'Kalshi (S&P/Nasdaq)', data: probs.map(p => +(kalshiDollarFee(p, 'index', 100)).toFixed(4)),
    borderColor: 'rgba(0,222,149,0.5)', backgroundColor: 'transparent', borderWidth: 2,
    borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 3,
  });

  charts.rptFeeCompChart = new Chart(canvas, {
    type: 'line',
    data: { labels: probs.map(p => p.toFixed(2)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx) => `Share price: ${ctx[0].label}`,
            label: (ctx) => `${ctx.dataset.label}: $${ctx.raw.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Share Price', color: BM.creamFaded },
          ticks: {
            callback: (v, i) => {
              const p = probs[i];
              if (p !== undefined && [0.01, 0.25, 0.50, 0.75, 0.99].includes(Math.round(p * 100) / 100)) return p.toFixed(2);
              return '';
            },
            autoSkip: false, maxRotation: 0,
          },
        },
        y: {
          min: 0,
          title: { display: true, text: 'Fee for 100 Contracts ($)', color: BM.creamFaded },
          ticks: { callback: (v) => '$' + v.toFixed(2) },
        },
      },
    },
  });

  // Legend toggle
  document.querySelectorAll('.rpt-fee-legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      const meta = charts.rptFeeCompChart.getDatasetMeta(idx);
      meta.hidden = !meta.hidden;
      item.style.opacity = meta.hidden ? '0.3' : '1';
      charts.rptFeeCompChart.update();
    });
  });

  // Store data for toggling between rate and dollar views
  chartData.rptFee = { probs, catGroups };
}

function toggleRptFeeChart(view) {
  const chart = charts.rptFeeCompChart;
  if (!chart || !chartData.rptFee) return;
  const { probs, catGroups } = chartData.rptFee;
  const isDollar = view === 'dollar';

  // Update Polymarket datasets (indices 0-8)
  catGroups.forEach((g, i) => {
    chart.data.datasets[i].data = probs.map(p =>
      +(isDollar ? polyDollarFee(p, g.cat, 100) : polyEffRate(p, g.cat)).toFixed(4)
    );
  });
  // Kalshi Standard (index 9)
  chart.data.datasets[9].data = probs.map(p =>
    +(isDollar ? kalshiDollarFee(p, 'standard', 100) : kalshiEffRate(p, 'standard')).toFixed(4)
  );
  // Kalshi S&P/Nasdaq (index 10)
  chart.data.datasets[10].data = probs.map(p =>
    +(isDollar ? kalshiDollarFee(p, 'index', 100) : kalshiEffRate(p, 'index')).toFixed(4)
  );

  // Update Y axis
  chart.options.scales.y.title.text = isDollar ? 'Fee for 100 Contracts ($)' : 'Effective Fee Rate (%)';
  chart.options.scales.y.ticks.callback = isDollar ? (v) => '$' + v.toFixed(2) : (v) => v.toFixed(1) + '%';
  chart.options.plugins.tooltip.callbacks.label = isDollar
    ? (ctx) => `${ctx.dataset.label}: $${ctx.raw.toFixed(2)}`
    : (ctx) => `${ctx.dataset.label}: ${ctx.raw.toFixed(3)}%`;

  // Update caption
  const cap = document.getElementById('rptFeeCaption');
  if (cap) {
    cap.innerHTML = isDollar
      ? 'Fee in dollars for 100 contracts. Kalshi\'s curve is symmetric around 50&cent;; Polymarket\'s curves skew right (higher-priced contracts cost more). Sources: <a href="https://docs.polymarket.com/trading/fees" target="_blank">Polymarket docs</a>, <a href="https://help.kalshi.com/trading/fees" target="_blank">Kalshi help center</a>.'
      : 'Effective fee rate = fee &divide; cost of shares. Polymarket\'s curves are symmetric; Kalshi\'s declines linearly because its formula taxes potential payout, not share price. Sources: <a href="https://docs.polymarket.com/trading/fees" target="_blank">Polymarket docs</a>, <a href="https://help.kalshi.com/trading/fees" target="_blank">Kalshi help center</a>.';
  }
  chart.update();
}
