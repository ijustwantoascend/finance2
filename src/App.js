import React from "react";
import "./style.css";

import { useState, useEffect, useCallback } from "react";

// ── Historical data from spreadsheet ──────────────────────────────────────────
const HISTORICAL = {
  "2025-04": { earningsUSD: 4684, costUSD: 2416.15, btcAtTime: null,
    spend: { family: 388.64, health: 242.63, personal: 232.24, transport: 94.19, food: 216.08, gym: 1.45, debt: 0, other: 37.87 } },
  "2025-05": { earningsUSD: 5533.35, costUSD: 3075.17, btcAtTime: null,
    spend: { family: 699.83, health: 395.35, personal: 761.80, transport: 81.40, food: 7.97, gym: 1.16, debt: 0, other: 145.35 } },
  "2025-06": { earningsUSD: 6446, costUSD: 1617.49, btcAtTime: null,
    spend: { family: 441.34, health: 363.22, personal: 347.55, transport: 61.66, food: 44.84, gym: 26.90, debt: 0, other: 140.13 } },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_KEYS = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const SPEND_CATS = [
  { id: "family",    label: "Family",           icon: "ti-users" },
  { id: "food",      label: "Food / Dining",     icon: "ti-tools-kitchen-2" },
  { id: "health",    label: "Health / Gear",     icon: "ti-heart-rate-monitor" },
  { id: "transport", label: "Transport / Fuel",  icon: "ti-car" },
  { id: "personal",  label: "Personal / Dating", icon: "ti-user" },
  { id: "gym",       label: "Gym",               icon: "ti-barbell" },
  { id: "debt",      label: "Debt Repayment",    icon: "ti-credit-card" },
  { id: "other",     label: "Other",             icon: "ti-dots" },
];
const INC_STREAMS = [
  { id: "dropshipping", label: "Dropshipping (HXN)", currency: "BTC" },
  { id: "middleman",    label: "Middleman / Group Buy", currency: "USDT/BTC" },
  { id: "resell_online",label: "Online Reselling", currency: "BTC/USDT" },
  { id: "resell_person",label: "In-Person Reselling", currency: "IDR/USD" },
  { id: "misc",         label: "Miscellaneous", currency: "Mixed" },
];

const INIT = {
  btcPrice: null, lastBtcFetch: null,
  rates: { USDSGD: 1.3540, USDIDR: 16200 },
  wallets: {
    coinbase_btc: 0.07610612,
    coinbase_usdt: 641.79,
    metamask_btc: 0.0569,
    uob_sgd: 0,
    revolut_sgd: 0,
    bca_idr: 0,
  },
  ledger: [],   // all journal entries
};

function load() {
  try { const s = localStorage.getItem("hxn_v3"); return s ? JSON.parse(s) : INIT; } catch { return INIT; }
}
function save(s) { try { localStorage.setItem("hxn_v3", JSON.stringify(s)); } catch {} }

const fmt = (n, dec=2) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtUSD = n => "$" + fmt(n);
const fmtSGD = n => "S$" + fmt(n);
const fmtIDR = n => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtBTC = n => Number(n || 0).toFixed(6) + " ₿";
const fmtPct = n => (Number(n || 0) * 100).toFixed(1) + "%";

function totalBtc(wallets) { return (wallets.coinbase_btc || 0) + (wallets.metamask_btc || 0); }
function netWorthUSD(wallets, btcPrice, rates) {
  const btcVal = totalBtc(wallets) * (btcPrice || 0);
  const usdtVal = wallets.coinbase_usdt || 0;
  const uobVal = (wallets.uob_sgd || 0) / (rates.USDSGD || 1.35);
  const revolVal = (wallets.revolut_sgd || 0) / (rates.USDSGD || 1.35);
  const bcaVal = (wallets.bca_idr || 0) / (rates.USDIDR || 16200);
  return btcVal + usdtVal + uobVal + revolVal + bcaVal;
}
function toUSD(entry, rates, btcPrice) {
  if (!entry) return 0;
  const btc = btcPrice || 0;
  const sgd = rates.USDSGD || 1.35;
  const idr = rates.USDIDR || 16200;
  if (entry.currency === "BTC") return (entry.amount || 0) * btc;
  if (entry.currency === "SGD") return (entry.amount || 0) / sgd;
  if (entry.currency === "IDR") return (entry.amount || 0) / idr;
  if (entry.currency === "USDT" || entry.currency === "USD") return entry.amount || 0;
  return entry.amountUSD || 0;
}

// ── Month data builder (historical + live ledger) ─────────────────────────────
function buildMonthData(yearMonth, ledger, btcPrice, rates) {
  const hist = HISTORICAL[yearMonth];
  const entries = ledger.filter(e => e.date && e.date.startsWith(yearMonth));
  const incEntries = entries.filter(e => e.type === "income");
  const expEntries = entries.filter(e => e.type === "expense");
  const liveIncome = incEntries.reduce((s, e) => s + toUSD(e, rates, btcPrice), 0);
  const liveSpend  = expEntries.reduce((s, e) => s + toUSD(e, rates, btcPrice), 0);

  // spend by category from live ledger
  const liveCats = {};
  SPEND_CATS.forEach(c => { liveCats[c.id] = 0; });
  expEntries.forEach(e => { if (e.category) liveCats[e.category] = (liveCats[e.category] || 0) + toUSD(e, rates, btcPrice); });

  if (hist) {
    const totalInc = hist.earningsUSD + liveIncome;
    const totalSpend = hist.costUSD + liveSpend;
    const cats = {};
    SPEND_CATS.forEach(c => { cats[c.id] = (hist.spend[c.id] || 0) + (liveCats[c.id] || 0); });
    return { earningsUSD: totalInc, costUSD: totalSpend, netUSD: totalInc - totalSpend, margin: totalInc > 0 ? (totalInc - totalSpend) / totalInc : 0, cats, hasHistory: true, liveEntries: entries.length };
  }
  return { earningsUSD: liveIncome, costUSD: liveSpend, netUSD: liveIncome - liveSpend, margin: liveIncome > 0 ? (liveIncome - liveSpend) / liveIncome : 0, cats: liveCats, hasHistory: false, liveEntries: entries.length };
}

export default function App() {
  const [st, setSt] = useState(load);
  const [view, setView] = useState("dashboard"); // dashboard | journal | ledger | calendar | wallets
  const [btcLoading, setBtcLoading] = useState(false);
  const [journalForm, setJournalForm] = useState(null);
  const [filterMonth, setFilterMonth] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [walletEdit, setWalletEdit] = useState(false);
  const [walletDraft, setWalletDraft] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOut, setAiOut] = useState("");
  const [calYear, setCalYear] = useState(2025);

  useEffect(() => { save(st); }, [st]);

  const bp = st.btcPrice;
  const rates = st.rates;
  const wallets = st.wallets;
  const ledger = st.ledger;

  // ── BTC fetch ────────────────────────────────────────────────────────────────
  async function fetchBTC() {
    setBtcLoading(true);
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 300,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: "Current Bitcoin price in USD right now. Reply with ONLY the number, no symbols." }],
        }),
      });
      const d = await r.json();
      const txt = d.content?.filter(b => b.type === "text").map(b => b.text).join("");
      const m = txt.match(/([\d,]+(?:\.\d+)?)/);
      if (m) { const p = parseFloat(m[1].replace(/,/g,"")); if (p > 1000) setSt(s => ({ ...s, btcPrice: p, lastBtcFetch: new Date().toISOString() })); }
    } catch {}
    setBtcLoading(false);
  }

  // ── AI briefing ──────────────────────────────────────────────────────────────
  async function runAI() {
    setAiLoading(true); setAiOut("");
    const nw = netWorthUSD(wallets, bp, rates);
    const totalBTC = totalBtc(wallets);
    const thisM = new Date().toISOString().slice(0,7);
    const md = buildMonthData(thisM, ledger, bp, rates);
    const recentLedger = [...ledger].reverse().slice(0,10).map(e => `${e.date} [${e.type}] ${e.label || e.category} ${e.amount} ${e.currency} (≈$${toUSD(e, rates, bp).toFixed(2)})`).join("\n");
    const prompt = `You are a sharp personal finance advisor for a 22-year-old entrepreneur (Jakarta/Singapore-based). Analyze current financial state and give an actionable briefing.

CURRENT BALANCES (BTC-anchored):
- BTC price: ${bp ? fmtUSD(bp) : "unknown"}
- Coinbase BTC: ${fmtBTC(wallets.coinbase_btc)} = ${bp ? fmtUSD(wallets.coinbase_btc * bp) : "?"}
- MetaMask BTC: ${fmtBTC(wallets.metamask_btc)} = ${bp ? fmtUSD(wallets.metamask_btc * bp) : "?"}
- Total BTC: ${fmtBTC(totalBTC)} = ${bp ? fmtUSD(totalBTC * bp) : "?"}
- Coinbase USDT: ${fmtUSD(wallets.coinbase_usdt)}
- UOB SGD: ${fmtSGD(wallets.uob_sgd)} = ${fmtUSD((wallets.uob_sgd||0)/rates.USDSGD)}
- BCA IDR: ${fmtIDR(wallets.bca_idr)} = ${fmtUSD((wallets.bca_idr||0)/rates.USDIDR)}
- NET WORTH (USD): ${fmtUSD(nw)}

THIS MONTH (${thisM}):
- Earnings: ${fmtUSD(md.earningsUSD)}
- Costs: ${fmtUSD(md.costUSD)}
- Net: ${fmtUSD(md.netUSD)}
- Margin: ${fmtPct(md.margin)}

HISTORICAL (from Excel):
- April 2025: $4,684 income / $2,416 cost → $2,268 profit
- May 2025: $5,533 income / $3,075 cost → $2,458 profit
- June 2025: $6,446 income / $1,617 cost → $4,829 profit

RECENT LEDGER (last 10):
${recentLedger || "No entries yet"}

Give: 1) Net worth status & BTC exposure risk 2) This month performance vs trend 3) Spend category flags 4) 3 sharp action items. Be direct, data-driven, no fluff.`;
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const d = await r.json();
      setAiOut(d.content?.filter(b => b.type === "text").map(b => b.text).join("") || "No response");
    } catch (e) { setAiOut("Error: " + e.message); }
    setAiLoading(false);
  }

  // ── Journal entry ─────────────────────────────────────────────────────────────
  function openJournal(type) {
    setJournalForm({
      type, date: new Date().toISOString().slice(0,10),
      label: "", amount: "", currency: type === "income" ? "BTC" : "IDR",
      category: type === "expense" ? "food" : "",
      stream: type === "income" ? "dropshipping" : "",
      note: "",
    });
    setView("journal");
    setAiOut("");
  }

  function saveJournal() {
    if (!journalForm.amount || parseFloat(journalForm.amount) <= 0) return;
    const entry = { ...journalForm, id: Date.now(), amount: parseFloat(journalForm.amount) };
    setSt(s => ({ ...s, ledger: [entry, ...s.ledger] }));
    setJournalForm(null);
    setView("ledger");
  }

  // ── Wallet save ───────────────────────────────────────────────────────────────
  function saveWallets() {
    const merged = {};
    Object.keys(walletDraft).forEach(k => { merged[k] = parseFloat(walletDraft[k]) || 0; });
    setSt(s => ({ ...s, wallets: { ...s.wallets, ...merged } }));
    setWalletEdit(false);
  }

  // ── Derived numbers ───────────────────────────────────────────────────────────
  const nw = netWorthUSD(wallets, bp, rates);
  const totalBTC_ = totalBtc(wallets);
  const btcValUSD = totalBTC_ * (bp || 0);
  const thisM = new Date().toISOString().slice(0,7);
  const thisMonthData = buildMonthData(thisM, ledger, bp, rates);

  // ledger filtered
  const filteredLedger = ledger.filter(e => {
    const mOk = !filterMonth || (e.date && e.date.startsWith(filterMonth));
    const tOk = filterType === "all" || e.type === filterType;
    return mOk && tOk;
  });

  // ── Styles ────────────────────────────────────────────────────────────────────
  const card = { background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 };
  const metricCard = { background: "var(--surface-1)", borderRadius: "var(--radius)", padding: "0.75rem 1rem" };
  const navBtn = (v) => ({
    fontSize: 13, fontWeight: view === v ? 500 : 400,
    color: view === v ? "var(--text-accent)" : "var(--text-secondary)",
    borderBottom: view === v ? "2px solid var(--border-accent)" : "2px solid transparent",
    borderRadius: 0, padding: "8px 12px",
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--text-primary)", maxWidth: 700, margin: "0 auto", padding: "1rem 0" }}>
      <h2 style={{ display: "none" }}>HXN Finance Tracker</h2>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>net worth · BTC-anchored</div>
          <div style={{ fontSize: 30, fontWeight: 500, lineHeight: 1 }}>{fmtUSD(nw)}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {fmtBTC(totalBTC_)} · {bp ? fmtUSD(btcValUSD) + " BTC value" : "fetch price →"}
            {bp && <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>@ {fmtUSD(bp)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={fetchBTC} disabled={btcLoading} style={{ fontSize: 12 }}>
            <i className="ti ti-refresh" aria-hidden style={{ marginRight: 4 }} />{btcLoading ? "..." : "BTC price"}
          </button>
          <button onClick={() => openJournal("income")} style={{ fontSize: 12 }}>
            <i className="ti ti-plus" aria-hidden /> Income
          </button>
          <button onClick={() => openJournal("expense")} style={{ fontSize: 12 }}>
            <i className="ti ti-minus" aria-hidden /> Expense
          </button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--border)", marginBottom: 16, overflowX: "auto" }}>
        {[["dashboard","Dashboard"],["calendar","Annual Calendar"],["ledger","Ledger"],["wallets","Wallets"]].map(([v,l]) => (
          <button key={v} onClick={() => setView(v)} style={navBtn(v)}>{l}</button>
        ))}
      </div>

      {/* ── DASHBOARD ── */}
      {view === "dashboard" && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
          {[
            { label: "BTC holdings", val: fmtBTC(totalBTC_), sub: bp ? fmtUSD(btcValUSD) : "—" },
            { label: "this month income", val: fmtUSD(thisMonthData.earningsUSD) },
            { label: "this month spend", val: fmtUSD(thisMonthData.costUSD) },
            { label: "margin %", val: fmtPct(thisMonthData.margin) },
          ].map(m => (
            <div key={m.label} style={metricCard}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontSize: 17, fontWeight: 500 }}>{m.val}</div>
              {m.sub && <div style={{ fontSize: 11, color: "var(--text-accent)" }}>{m.sub}</div>}
            </div>
          ))}
        </div>

        {/* Historical summary */}
        <div style={card}>
          <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 10 }}>2025 history (from spreadsheet + live)</div>
          {["2025-04","2025-05","2025-06", thisM].filter((v,i,a)=>a.indexOf(v)===i).map(ym => {
            const md = buildMonthData(ym, ledger, bp, rates);
            const [y,m] = ym.split("-");
            return (
              <div key={ym} style={{ display:"flex", gap:12, padding:"6px 0", borderBottom:"0.5px solid var(--border)", fontSize:13, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ minWidth:60, color:"var(--text-muted)", fontWeight:500 }}>{MONTHS[parseInt(m)-1]} {y}</span>
                <span style={{ color:"var(--text-success)", minWidth:80 }}>+{fmtUSD(md.earningsUSD)}</span>
                <span style={{ color:"var(--text-danger)", minWidth:80 }}>-{fmtUSD(md.costUSD)}</span>
                <span style={{ fontWeight:500, color: md.netUSD >= 0 ? "var(--text-success)" : "var(--text-danger)", minWidth:80 }}>{fmtUSD(md.netUSD)} net</span>
                <span style={{ color:"var(--text-muted)" }}>{fmtPct(md.margin)} margin</span>
                {md.liveEntries > 0 && <span style={{ fontSize:11, background:"var(--bg-accent)", color:"var(--text-accent)", padding:"2px 6px", borderRadius:"var(--radius)" }}>{md.liveEntries} entries</span>}
              </div>
            );
          })}
        </div>

        {/* Spend breakdown this month */}
        {Object.values(thisMonthData.cats).some(v => v > 0) && (
          <div style={card}>
            <div style={{ fontWeight:500, fontSize:13, marginBottom:10 }}>spend breakdown · {MONTHS[parseInt(thisM.split("-")[1])-1]}</div>
            {SPEND_CATS.map(c => {
              const val = thisMonthData.cats[c.id] || 0;
              if (!val) return null;
              const pct = thisMonthData.costUSD > 0 ? val / thisMonthData.costUSD : 0;
              return (
                <div key={c.id} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:3 }}>
                    <span><i className={`ti ${c.icon}`} aria-hidden style={{ marginRight:6, fontSize:14 }} />{c.label}</span>
                    <span>{fmtUSD(val)} <span style={{ color:"var(--text-muted)" }}>{fmtPct(pct)}</span></span>
                  </div>
                  <div style={{ height:4, background:"var(--surface-1)", borderRadius:2 }}>
                    <div style={{ height:4, background:"var(--fill-accent)", borderRadius:2, width: Math.min(100, pct*100) + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* AI briefing */}
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: aiOut ? 12 : 0 }}>
            <span style={{ fontWeight:500, fontSize:13 }}>AI briefing</span>
            <button onClick={runAI} disabled={aiLoading} style={{ fontSize:12 }}>{aiLoading ? "analyzing..." : "run briefing ↗"}</button>
          </div>
          {aiOut && <div style={{ fontSize:13, lineHeight:1.7, whiteSpace:"pre-wrap", color:"var(--text-secondary)", maxHeight:300, overflowY:"auto", paddingTop:8, borderTop:"0.5px solid var(--border)" }}>{aiOut}</div>}
        </div>
      </>}

      {/* ── ANNUAL CALENDAR ── */}
      {view === "calendar" && <>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontWeight:500 }}>Annual earnings calendar</div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <button onClick={() => setCalYear(y => y - 1)} style={{ fontSize:12 }}>‹</button>
            <span style={{ fontSize:13, fontWeight:500 }}>{calYear}</span>
            <button onClick={() => setCalYear(y => y + 1)} style={{ fontSize:12 }}>›</button>
          </div>
        </div>
        {!bp && <div style={{ background:"var(--bg-warning)", color:"var(--text-warning)", border:"0.5px solid var(--border-warning)", borderRadius:"var(--radius)", padding:"8px 12px", fontSize:13, marginBottom:12 }}>Fetch BTC price for accurate SGD/USD values in historic months</div>}

        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", fontSize:12, borderCollapse:"collapse", tableLayout:"fixed" }}>
            <thead>
              <tr style={{ borderBottom:"0.5px solid var(--border)" }}>
                <th style={{ textAlign:"left", padding:"6px 8px", color:"var(--text-muted)", fontWeight:500, width:80 }}>Month</th>
                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--text-muted)", fontWeight:500 }}>Income (USD)</th>
                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--text-muted)", fontWeight:500 }}>Costs (USD)</th>
                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--text-muted)", fontWeight:500 }}>Net</th>
                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--text-muted)", fontWeight:500 }}>Margin</th>
                <th style={{ textAlign:"right", padding:"6px 8px", color:"var(--text-muted)", fontWeight:500 }}>SGD equiv</th>
              </tr>
            </thead>
            <tbody>
              {MONTH_KEYS.map((mk, i) => {
                const ym = `${calYear}-${mk}`;
                const md = buildMonthData(ym, ledger, bp, rates);
                const hasAny = md.earningsUSD > 0 || md.costUSD > 0 || md.liveEntries > 0;
                const sgdNet = md.netUSD * rates.USDSGD;
                const isCurrent = ym === thisM;
                return (
                  <tr key={ym} style={{ borderBottom:"0.5px solid var(--border)", background: isCurrent ? "var(--bg-accent)" : "transparent", opacity: hasAny ? 1 : 0.4 }}>
                    <td style={{ padding:"7px 8px", fontWeight: isCurrent ? 500 : 400 }}>{MONTHS[i]}{isCurrent ? " ●" : ""}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color: hasAny ? "var(--text-success)" : "var(--text-muted)" }}>{hasAny ? fmtUSD(md.earningsUSD) : "—"}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color: md.costUSD > 0 ? "var(--text-danger)" : "var(--text-muted)" }}>{md.costUSD > 0 ? fmtUSD(md.costUSD) : "—"}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", fontWeight:500, color: md.netUSD > 0 ? "var(--text-success)" : md.netUSD < 0 ? "var(--text-danger)" : "var(--text-muted)" }}>{hasAny ? fmtUSD(md.netUSD) : "—"}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color: md.margin > 0.5 ? "var(--text-success)" : "var(--text-secondary)" }}>{hasAny ? fmtPct(md.margin) : "—"}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color:"var(--text-secondary)" }}>{hasAny ? fmtSGD(sgdNet) : "—"}</td>
                  </tr>
                );
              })}
              {/* Totals */}
              {(() => {
                const totals = MONTH_KEYS.reduce((acc, mk) => {
                  const md = buildMonthData(`${calYear}-${mk}`, ledger, bp, rates);
                  acc.inc += md.earningsUSD; acc.cost += md.costUSD;
                  return acc;
                }, { inc: 0, cost: 0 });
                return (
                  <tr style={{ borderTop:"1px solid var(--border-strong)", fontWeight:500 }}>
                    <td style={{ padding:"7px 8px" }}>Total {calYear}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color:"var(--text-success)" }}>{fmtUSD(totals.inc)}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color:"var(--text-danger)" }}>{fmtUSD(totals.cost)}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color: totals.inc - totals.cost >= 0 ? "var(--text-success)" : "var(--text-danger)" }}>{fmtUSD(totals.inc - totals.cost)}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px" }}>{fmtPct(totals.inc > 0 ? (totals.inc - totals.cost) / totals.inc : 0)}</td>
                    <td style={{ textAlign:"right", padding:"7px 8px", color:"var(--text-secondary)" }}>{fmtSGD((totals.inc - totals.cost) * rates.USDSGD)}</td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>

        {/* Spend cat breakdown per month */}
        <div style={{ ...card, marginTop:16 }}>
          <div style={{ fontWeight:500, fontSize:13, marginBottom:10 }}>Category spend · {calYear}</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse", minWidth:500 }}>
              <thead>
                <tr style={{ borderBottom:"0.5px solid var(--border)" }}>
                  <th style={{ textAlign:"left", padding:"4px 6px", color:"var(--text-muted)", fontWeight:500 }}>Category</th>
                  {MONTHS.map((m,i) => <th key={m} style={{ textAlign:"right", padding:"4px 6px", color:"var(--text-muted)", fontWeight:500, minWidth:60 }}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {SPEND_CATS.map(c => (
                  <tr key={c.id} style={{ borderBottom:"0.5px solid var(--border)" }}>
                    <td style={{ padding:"4px 6px" }}>{c.label}</td>
                    {MONTH_KEYS.map((mk,i) => {
                      const md = buildMonthData(`${calYear}-${mk}`, ledger, bp, rates);
                      const val = md.cats[c.id] || 0;
                      return <td key={mk} style={{ textAlign:"right", padding:"4px 6px", color: val > 0 ? "var(--text-danger)" : "var(--text-muted)" }}>{val > 0 ? fmtUSD(val) : "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>}

      {/* ── LEDGER ── */}
      {view === "ledger" && <>
        <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize:12 }}>
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select value={filterMonth || ""} onChange={e => setFilterMonth(e.target.value || null)} style={{ fontSize:12 }}>
            <option value="">All months</option>
            {MONTH_KEYS.map((mk,i) => <option key={mk} value={`2025-${mk}`}>{MONTHS[i]} 2025</option>)}
          </select>
          <button onClick={() => openJournal("income")} style={{ fontSize:12 }}>+ Income</button>
          <button onClick={() => openJournal("expense")} style={{ fontSize:12 }}>+ Expense</button>
        </div>

        {filteredLedger.length === 0 && (
          <div style={{ ...card, textAlign:"center", color:"var(--text-muted)", padding:"2rem" }}>
            No entries yet. Start journaling income and expenses above.
          </div>
        )}

        {filteredLedger.map(entry => {
          const usd = toUSD(entry, rates, bp);
          const cat = SPEND_CATS.find(c => c.id === entry.category);
          const stream = INC_STREAMS.find(s => s.id === entry.stream);
          return (
            <div key={entry.id} style={{ ...card, padding:"0.75rem 1rem", display:"flex", gap:12, alignItems:"flex-start" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background: entry.type === "income" ? "var(--fill-success)" : "var(--fill-danger)", marginTop:6, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <span style={{ fontSize:13, fontWeight:500 }}>{entry.label || (entry.type === "income" ? (stream?.label || "Income") : (cat?.label || "Expense"))}</span>
                  <span style={{ fontSize:13, fontWeight:500, color: entry.type === "income" ? "var(--text-success)" : "var(--text-danger)", flexShrink:0, marginLeft:8 }}>
                    {entry.type === "income" ? "+" : "-"}{fmtUSD(usd)}
                  </span>
                </div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>
                  {entry.date} · {entry.amount} {entry.currency}
                  {entry.currency === "BTC" && bp && <span style={{ marginLeft:4 }}>@ {fmtUSD(bp)}</span>}
                  {entry.note && <span style={{ marginLeft:8 }}>· {entry.note}</span>}
                </div>
              </div>
              <button onClick={() => setSt(s => ({ ...s, ledger: s.ledger.filter(e => e.id !== entry.id) }))} style={{ fontSize:11, color:"var(--text-muted)", padding:"2px 6px" }}>
                <i className="ti ti-x" aria-hidden />
              </button>
            </div>
          );
        })}
      </>}

      {/* ── WALLETS ── */}
      {view === "wallets" && <>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontWeight:500 }}>Wallet balances</div>
          <button onClick={() => { setWalletEdit(!walletEdit); setWalletDraft({ ...wallets }); }} style={{ fontSize:12 }}>
            {walletEdit ? "cancel" : "edit balances"}
          </button>
        </div>

        <div style={card}>
          {[
            { key:"coinbase_btc",  label:"Coinbase BTC",   type:"BTC" },
            { key:"metamask_btc",  label:"MetaMask BTC",   type:"BTC" },
            { key:"coinbase_usdt", label:"Coinbase USDT",  type:"USDT" },
            { key:"uob_sgd",       label:"UOB",            type:"SGD" },
            { key:"revolut_sgd",   label:"Revolut",        type:"SGD" },
            { key:"bca_idr",       label:"BCA",            type:"IDR" },
          ].map(w => {
            const v = wallets[w.key] || 0;
            const usdEq = w.type === "BTC" ? v * (bp || 0) : w.type === "SGD" ? v / rates.USDSGD : w.type === "IDR" ? v / rates.USDIDR : v;
            return (
              <div key={w.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"0.5px solid var(--border)" }}>
                <span style={{ fontSize:13, color:"var(--text-secondary)" }}>{w.label} ({w.type})</span>
                <div style={{ textAlign:"right" }}>
                  {walletEdit
                    ? <input type="number" step="any" value={walletDraft[w.key] ?? v} onChange={e => setWalletDraft(d => ({ ...d, [w.key]: e.target.value }))} style={{ width:130, fontSize:13, textAlign:"right" }} />
                    : <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>
                          {w.type === "BTC" ? fmtBTC(v) : w.type === "SGD" ? fmtSGD(v) : w.type === "IDR" ? fmtIDR(v) : fmtUSD(v)}
                        </div>
                        {w.type !== "USD" && w.type !== "USDT" && bp && <div style={{ fontSize:11, color:"var(--text-muted)" }}>≈ {fmtUSD(usdEq)}</div>}
                      </div>
                  }
                </div>
              </div>
            );
          })}
          {walletEdit && <button onClick={saveWallets} style={{ marginTop:10, width:"100%", fontWeight:500 }}>Save balances</button>}
        </div>

        <div style={card}>
          <div style={{ fontWeight:500, fontSize:13, marginBottom:10 }}>FX rates (editable)</div>
          {[["USDSGD","USD/SGD"],["USDIDR","USD/IDR"]].map(([k,l]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"0.5px solid var(--border)" }}>
              <span style={{ fontSize:13, color:"var(--text-secondary)" }}>{l}</span>
              <input type="number" step="0.0001" value={rates[k]} onChange={e => setSt(s => ({ ...s, rates: { ...s.rates, [k]: parseFloat(e.target.value) || s.rates[k] }}))} style={{ width:120, fontSize:13, textAlign:"right" }} />
            </div>
          ))}
        </div>

        {/* Net worth breakdown */}
        <div style={card}>
          <div style={{ fontWeight:500, fontSize:13, marginBottom:10 }}>Net worth breakdown</div>
          {[
            { label:"BTC (Coinbase + MetaMask)", val: totalBTC_ * (bp||0), sub: fmtBTC(totalBTC_) },
            { label:"USDT (Coinbase)", val: wallets.coinbase_usdt },
            { label:"SGD accounts (UOB + Revolut)", val: ((wallets.uob_sgd||0) + (wallets.revolut_sgd||0)) / rates.USDSGD, sub: fmtSGD((wallets.uob_sgd||0)+(wallets.revolut_sgd||0)) },
            { label:"IDR (BCA)", val: (wallets.bca_idr||0) / rates.USDIDR, sub: fmtIDR(wallets.bca_idr) },
          ].map(row => (
            <div key={row.label} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"0.5px solid var(--border)", fontSize:13 }}>
              <span style={{ color:"var(--text-secondary)" }}>{row.label}{row.sub && <span style={{ color:"var(--text-muted)", marginLeft:6, fontSize:11 }}>{row.sub}</span>}</span>
              <span style={{ fontWeight:500 }}>{fmtUSD(row.val)}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", fontSize:14, fontWeight:500 }}>
            <span>Total (USD)</span><span>{fmtUSD(nw)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-muted)" }}>
            <span>in SGD</span><span>{fmtSGD(nw * rates.USDSGD)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-muted)" }}>
            <span>in IDR</span><span>{fmtIDR(nw * rates.USDIDR)}</span>
          </div>
        </div>
      </>}

      {/* ── JOURNAL FORM ── */}
      {view === "journal" && journalForm && (
        <div style={card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:500 }}>Log {journalForm.type}</div>
            <button onClick={() => { setJournalForm(null); setView("ledger"); }} style={{ fontSize:12 }}><i className="ti ti-x" aria-hidden /></button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
            <div>
              <label style={{ fontSize:12, color:"var(--text-muted)", display:"block", marginBottom:4 }}>Date</label>
              <input type="date" value={journalForm.date} onChange={e => setJournalForm(f => ({ ...f, date: e.target.value }))} style={{ width:"100%", fontSize:13 }} />
            </div>
            <div>
              <label style={{ fontSize:12, color:"var(--text-muted)", display:"block", marginBottom:4 }}>Currency</label>
              <select value={journalForm.currency} onChange={e => setJournalForm(f => ({ ...f, currency: e.target.value }))} style={{ width:"100%", fontSize:13 }}>
                {journalForm.type === "income"
                  ? ["BTC","USDT","USD","SGD","IDR"].map(c => <option key={c}>{c}</option>)
                  : ["IDR","USD","SGD","USDT","BTC"].map(c => <option key={c}>{c}</option>)
                }
              </select>
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:"var(--text-muted)", display:"block", marginBottom:4 }}>Amount ({journalForm.currency})</label>
            <input type="number" step="any" placeholder={journalForm.currency === "BTC" ? "e.g. 0.0023" : "e.g. 250000"} value={journalForm.amount} onChange={e => setJournalForm(f => ({ ...f, amount: e.target.value }))} style={{ width:"100%", fontSize:14, fontWeight:500 }} />
            {journalForm.currency === "BTC" && bp && journalForm.amount &&
              <div style={{ fontSize:12, color:"var(--text-accent)", marginTop:4 }}>≈ {fmtUSD(parseFloat(journalForm.amount) * bp)} at {fmtUSD(bp)}/BTC</div>
            }
            {journalForm.currency === "IDR" && journalForm.amount &&
              <div style={{ fontSize:12, color:"var(--text-accent)", marginTop:4 }}>≈ {fmtUSD(parseFloat(journalForm.amount) / rates.USDIDR)}</div>
            }
            {journalForm.currency === "SGD" && journalForm.amount &&
              <div style={{ fontSize:12, color:"var(--text-accent)", marginTop:4 }}>≈ {fmtUSD(parseFloat(journalForm.amount) / rates.USDSGD)}</div>
            }
          </div>

          {journalForm.type === "expense" && (
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:"var(--text-muted)", display:"block", marginBottom:4 }}>Category</label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:6 }}>
                {SPEND_CATS.map(c => (
                  <button key={c.id} onClick={() => setJournalForm(f => ({ ...f, category: c.id }))}
                    style={{ fontSize:12, textAlign:"left", background: journalForm.category === c.id ? "var(--bg-accent)" : "var(--surface-1)", color: journalForm.category === c.id ? "var(--text-accent)" : "var(--text-secondary)", border: journalForm.category === c.id ? "0.5px solid var(--border-accent)" : "0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"6px 10px" }}>
                    <i className={`ti ${c.icon}`} aria-hidden style={{ marginRight:5 }} />{c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {journalForm.type === "income" && (
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:12, color:"var(--text-muted)", display:"block", marginBottom:4 }}>Income stream</label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px,1fr))", gap:6 }}>
                {INC_STREAMS.map(s => (
                  <button key={s.id} onClick={() => setJournalForm(f => ({ ...f, stream: s.id }))}
                    style={{ fontSize:12, textAlign:"left", background: journalForm.stream === s.id ? "var(--bg-success)" : "var(--surface-1)", color: journalForm.stream === s.id ? "var(--text-success)" : "var(--text-secondary)", border: journalForm.stream === s.id ? "0.5px solid var(--border-success)" : "0.5px solid var(--border)", borderRadius:"var(--radius)", padding:"6px 10px" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:12, color:"var(--text-muted)", display:"block", marginBottom:4 }}>Label / note</label>
            <input placeholder={journalForm.type === "income" ? "e.g. Sale to James Reynold" : "e.g. Vitamin stack"} value={journalForm.label} onChange={e => setJournalForm(f => ({ ...f, label: e.target.value }))} style={{ width:"100%", fontSize:13 }} />
          </div>

          <button onClick={saveJournal} disabled={!journalForm.amount || parseFloat(journalForm.amount) <= 0} style={{ width:"100%", fontWeight:500, padding:"10px 0", fontSize:14 }}>
            Save entry → updates ledger & calendar
          </button>
        </div>
      )}

      <div style={{ fontSize:11, color:"var(--text-muted)", textAlign:"center", marginTop:20 }}>
        {ledger.length} entries · data in browser · 1 USD = {rates.USDSGD} SGD = {rates.USDIDR.toLocaleString()} IDR
      </div>
    </div>
  );
}

