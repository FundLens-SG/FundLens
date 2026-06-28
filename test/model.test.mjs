// FundLens model unit tests.
//
// FundLens is a single deployable HTML file, so there is no module to import.
// This harness extracts the pure-math functions + their constant tables
// directly from index.html (brace-matched, string/comment aware) and exercises
// them in isolation. It locks the behaviour the 2026-06-29 security pass
// depends on — above all C2: the portfolio-variance helper must NEVER emit NaN,
// even when the hand-calibrated correlation matrix is not positive semi-definite.
//
// Run: node test/model.test.mjs   (no dependencies)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

// ── Brace/bracket matcher that skips strings, regex-ish, and comments ──
function matchBalanced(src, openIdx, open, close) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && src[i + 1] === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && src[i + 1] === '/') { inLine = true; i++; continue; }
    if (c === '/' && src[i + 1] === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  throw new Error('unbalanced from ' + openIdx);
}

function extractFn(name) {
  const sig = 'function ' + name + '(';
  const s = SRC.indexOf(sig);
  if (s < 0) throw new Error('function not found: ' + name);
  const brace = SRC.indexOf('{', s);
  return SRC.slice(s, matchBalanced(SRC, brace, '{', '}') + 1);
}

function extractVar(name) {
  const sig = 'var ' + name + ' =';
  const s = SRC.indexOf(sig);
  if (s < 0) throw new Error('var not found: ' + name);
  let i = SRC.indexOf('=', s) + 1;
  while (/\s/.test(SRC[i])) i++;
  const open = SRC[i];
  const close = open === '{' ? '}' : ']';
  const end = matchBalanced(SRC, i, open, close);
  return 'var ' + name + ' = ' + SRC.slice(i, end + 1) + ';';
}

const prelude = [
  extractVar('SECTOR_SIGMA'),
  extractVar('ASSET_SIGMA'),
  extractVar('REGION_VOL_MULT'),
  extractVar('RISK_SIGMA'),
  extractVar('CORR_MATRIX'),
  'var _cachedFrontier = null, _frontierCacheTime = 0;',
  extractFn('getAssetBucket'),
  extractFn('getPairCorrelation'),
  extractFn('getHoldingSigma'),
  extractFn('_diversifiedVolPct'),
  extractFn('calcResampledFrontier'),
  'return { getAssetBucket, getPairCorrelation, getHoldingSigma, _diversifiedVolPct, calcResampledFrontier };'
].join('\n\n');

const M = new Function(prelude)();

// ── tiny assert harness ──
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
function group(name, fn) { console.log('• ' + name); fn(); }

// ── getAssetBucket (M3 classification) ──
group('getAssetBucket classification', () => {
  ok(M.getAssetBucket({ assetClass: 'cash' }) === 'cash', 'cash');
  ok(M.getAssetBucket({ assetClass: 'commodities' }) === 'commodities', 'commodities');
  ok(M.getAssetBucket({ assetClass: 'bond_govt' }) === 'bond_govt', 'govt bond');
  ok(M.getAssetBucket({ assetClass: 'bond', sector: 'bonds_fi', risk: 3 }) === 'bond_ig', 'low-risk bond → IG');
  // Documents the known M3 heuristic: a bonds_fi fund with risk>=5 is treated as HY.
  ok(M.getAssetBucket({ assetClass: 'bond', sector: 'bonds_fi', risk: 7 }) === 'bond_hy', 'risk>=5 bonds_fi → HY');
  ok(M.getAssetBucket({ assetClass: 'reit' }) === 'reit', 'reit');
  ok(M.getAssetBucket({ assetClass: 'equity', region: 'em' }) === 'eq_em', 'EM equity');
  ok(M.getAssetBucket({ assetClass: 'equity', region: 'sg' }) === 'eq_sg', 'SG equity');
  ok(M.getAssetBucket({ assetClass: 'equity', region: 'us' }) === 'eq_dev', 'US → developed');
});

// ── getPairCorrelation ──
group('getPairCorrelation bounds + sign', () => {
  const eqA = { assetClass: 'equity', region: 'us', sector: 'tech' };
  const govt = { assetClass: 'bond_govt', region: 'sg', sector: 'bonds_fi' };
  const cEqEq = M.getPairCorrelation(eqA, eqA);
  const cEqBond = M.getPairCorrelation(eqA, govt);
  ok(cEqEq >= -0.30 && cEqEq <= 0.98, 'eq-eq within clamp');
  ok(cEqBond >= -0.30 && cEqBond <= 0.98, 'eq-bond within clamp');
  ok(cEqBond < cEqEq, 'equity↔govt-bond less correlated than equity↔equity');
});

// ── getHoldingSigma ──
group('getHoldingSigma', () => {
  const cases = [
    { sector: 'tech', region: 'us', risk: 6 },
    { assetClass: 'bond', region: 'sg', risk: 2 },
    { region: 'em', risk: 9 },           // no sector/asset → risk fallback path
    { sector: 'money_mkt', region: 'sg', risk: 1 },
    {}                                    // empty → defaults
  ];
  for (const h of cases) {
    const s = M.getHoldingSigma(h);
    ok(Number.isFinite(s) && s >= 1, 'sigma finite & >=1 for ' + JSON.stringify(h));
  }
});

// ── _diversifiedVolPct (C2 core) ──
group('_diversifiedVolPct properties', () => {
  const h = { sector: 'tech', region: 'us', risk: 7 };
  const single = M._diversifiedVolPct([h], [1]);
  ok(Math.abs(single - M.getHoldingSigma(h)) < 1e-6, 'single holding == its sigma');

  // Diversified vol must not exceed the weighted-average (undiversified) vol.
  const list = [
    { sector: 'tech', region: 'us', risk: 7 },
    { assetClass: 'bond_govt', region: 'sg', risk: 2 },
    { assetClass: 'reit', region: 'sg', risk: 5 }
  ];
  const w = [0.5, 0.3, 0.2];
  const undiv = list.reduce((s, hh, i) => s + w[i] * M.getHoldingSigma(hh), 0);
  const div = M._diversifiedVolPct(list, w);
  ok(Number.isFinite(div) && div >= 0, 'diversified vol finite & >=0');
  ok(div <= undiv + 1e-9, 'diversified <= undiversified (no negative diversification)');

  // Malformed weights must not produce NaN.
  ok(Number.isFinite(M._diversifiedVolPct(list, [NaN, 1, undefined])), 'NaN/undefined weights → finite');
  ok(M._diversifiedVolPct([], []) === 0, 'empty list → 0');
});

// ── _diversifiedVolPct fuzz (the C2 guarantee) ──
group('_diversifiedVolPct fuzz: NEVER NaN/negative (2000 random portfolios)', () => {
  const ACS = ['equity', 'bond', 'bond_govt', 'bond_corp', 'reit', 'mixed', 'cash', 'commodities', 'etf'];
  const SECS = ['tech', 'bonds_fi', 'realestate', 'money_mkt', 'gold', 'multi_sector', 'financials', 'healthcare'];
  const REGS = ['us', 'sg', 'em', 'eu', 'jp', 'global', 'cn', 'asia'];
  let worst = null;
  for (let t = 0; t < 2000; t++) {
    const n = 1 + Math.floor(Math.random() * 8);
    const list = [], raw = [];
    for (let i = 0; i < n; i++) {
      list.push({
        assetClass: ACS[(Math.random() * ACS.length) | 0],
        sector: SECS[(Math.random() * SECS.length) | 0],
        region: REGS[(Math.random() * REGS.length) | 0],
        risk: 1 + ((Math.random() * 10) | 0)
      });
      raw.push(Math.random());
    }
    const sum = raw.reduce((a, b) => a + b, 0) || 1;
    const w = raw.map(x => x / sum);
    const v = M._diversifiedVolPct(list, w);
    if (!(Number.isFinite(v) && v >= 0)) { worst = { v, list, w }; break; }
  }
  ok(worst === null, 'all 2000 random portfolios produced a finite, non-negative σ' +
    (worst ? ' (got ' + worst.v + ')' : ''));
});

// ── calcResampledFrontier ──
group('calcResampledFrontier', () => {
  const ef = M.calcResampledFrontier();
  ok(ef && Array.isArray(ef.mean) && ef.mean.length === 10, 'returns 10 mean points');
  ok(ef.mean.every(Number.isFinite) && ef.lo.every(Number.isFinite) && ef.hi.every(Number.isFinite), 'all points finite');
  ok(ef.mean.every(v => v > 0), 'all mean returns > 0');
  let mono = true;
  for (let i = 1; i < 10; i++) if (ef.mean[i] < ef.mean[i - 1] - 1e-9) mono = false;
  ok(mono, 'mean glidepath is monotonic non-decreasing');
});

console.log('\n' + (fail === 0 ? '✓ PASS' : '✗ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
