# FundLens© Portfolio Analyser

A single-file HTML portfolio analysis tool built for Singapore financial advisors. No server, no installation — open in any browser.

## Features

- **2,000+ instruments** — 1,700 iFAST unit trusts (with real risk ratings), 300+ stocks (US, SG, China/HK), ETFs, REITs, bonds, CPF
- **Smart autocomplete** — type-filtered search (stocks only show stocks, funds only show funds)
- **Live risk metrics** — FMP API (US stocks) + Yahoo Finance fallback (SG/HK) for real-time beta, D/E, volatility, market cap
- **Quantitative risk model** — 40% Beta + 25% Volatility + 20% D/E + 15% Qualitative, scaled 1–10
- **Portfolio-level risk** — Markowitz covariance model with correlation, concentration penalty, diversification benefit
- **6 analysis pages** — Overview, Holdings, Returns, Projection, Health, Simulate
- **PDF report generation** — 4-page PB-grade report with charts
- **ILP container system** — ILP holdings with sub-fund allocations, IRR solver
- **Save/Load** — saves all data into the HTML file itself
- **Mobile-first** — designed for iPad/phone use in client meetings

## Quick Start

1. Open `index.html` in Chrome or Safari
2. Tap **Sample** to load a demo profile
3. Tap **+ Add Holding** to build a portfolio

## Hosting (recommended)

Host on GitHub Pages for full API functionality:

1. Upload `index.html` to this repo
2. Go to **Settings → Pages → Branch: main → Save**
3. Visit `https://yourusername.github.io/FundLens/`
4. Add to Home Screen for app-like experience

## Data Sources

| Data | Source |
|------|--------|
| Fund risk ratings (1–10) | iFAST Fund Selector export |
| Fund inception dates | iFAST Fund Selector export |
| Stock risk metrics | Financial Modeling Prep API (free tier, 250 calls/day) |
| SG/HK stock fallback | Yahoo Finance chart endpoint |
| Efficient frontier | Vanguard 1926–2024 stock/bond models |

## Risk Rating Methodology

**Stocks:** R = 40%×Beta + 25%×Volatility + 20%×Debt-to-Equity + 15%×Qualitative (market cap)

**Unit Trusts:** iFAST's proprietary 1–10 scale based on mandate breadth, asset class, and geography

**Portfolio-level:** Markowitz σ²_p = Σ wi·wj·ρij·σi·σj with concentration penalty (HHI) and diversification benefit

## License

Proprietary — for authorised use only.

---

*Built for Singapore MAS/LIA advisory framework. Not investment advice.*
