import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & SEED DATA
// ─────────────────────────────────────────────────────────────────────────────
const EXPENSE_CATS = ["Dad","Mom","Sam","Glenn","Personal","Dating","Gas","Gear","Miscellaneous","Family","Debt Repayment"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_KEYS   = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const NAV_ITEMS    = ["Dashboard","Ledger","Calendar","Orders","Analytics","Wallets","AI Chat"];
const NAV_ICONS    = ["◈","≡","▦","⊞","∿","◎","✦"];

const HISTORICAL = {
  "2025-04": { inc: 4684.00, cost: 2416.15, cats: { Dad:315.07,Mom:62.21,Sam:30.23,Glenn:0,Personal:232.24,Dating:188.05,Gas:94.19,Gear:242.63,Miscellaneous:37.87,Family:216.08,"Debt Repayment":0 } },
  "2025-05": { inc: 5533.35, cost: 3075.17, cats: { Dad:1034.88,Mom:87.21,Sam:612.62,Glenn:0,Personal:563.49,Dating:198.31,Gas:81.40,Gear:395.35,Miscellaneous:145.35,Family:7.97,"Debt Repayment":0 } },
  "2025-06": { inc: 6446.00, cost: 1617.49, cats: { Dad:309.40,Mom:130.95,Sam:130.95,Glenn:0,Personal:205.71,Dating:231.85,Gas:61.66,Gear:363.22,Miscellaneous:140.13,Family:44.84,"Debt Repayment":0 } },
};

const SEED_ORDERS = [
  { id:"ORD-001", client:"James R.", item:"Nike Dunk Low x Off-White", cost:280, salePrice:620, status:"delivered", btcAmount:0.0089, date:"2025-06-12", deliveryDays:4 },
  { id:"ORD-002", client:"Marcus T.", item:"Supreme Box Logo Tee FW25", cost:95,  salePrice:310, status:"in_transit", btcAmount:0.0044, date:"2025-06-18", deliveryDays:null },
  { id:"ORD-003", client:"Priya K.", item:"Balenciaga Triple S Grey", cost:420, salePrice:790, status:"pending", btcAmount:0.0113, date:"2025-06-25", deliveryDays:null },
];

const INIT_STATE = {
  btcPrice: null, lastBtcFetch: null, btcCostBasis: 58200,
  rates: { USDSGD: 1.3540, USDIDR: 16200 },
  wallets: { coinbase_btc:0.07610612, metamask_btc:0.0569, coinbase_usdt:641.79, uob_sgd:4439, revolut_sgd:23, bca_idr:2981000 },
  ledger: [],
  orders: SEED_ORDERS,
  chatHistory: [],
  btcSnapshots: [],
  budgets: { Dad:400,Mom:200,Sam:200,Glenn:0,Personal:300,Dating:250,Gas:100,Gear:400,Miscellaneous:200,Family:150,"Debt Repayment":0 },
};

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
const load = () => { try { const s = localStorage.getItem("hxn_os_v1"); return s ? { ...INIT_STATE, ...JSON.parse(s) } : INIT_STATE; } catch { return INIT_STATE; } };
const persist = s => { try { localStorage.setItem("hxn_os_v1", JSON.stringify(s)); } catch {} };

const cu  = (n,d=2) => "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const csg = n => "S$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const cid = n => "Rp "+Math.round(n||0).toLocaleString("id-ID");
const cbt = n => Number(n||0).toFixed(6)+" ₿";
const cp  = n => (Number(n||0)*100).toFixed(1)+"%";
const pct = (a,b) => b ? ((a-b)/b*100).toFixed(1) : "0.0";

function toUSD(amount, currency, rates, btcPrice) {
  const a = parseFloat(amount||0);
  if (currency==="BTC")  return a*(btcPrice||0);
  if (currency==="SGD")  return a/(rates.USDSGD||1.354);
  if (currency==="IDR")  return a/(rates.USDIDR||16200);
  return a;
}
function totalBTC(w) { return (w.coinbase_btc||0)+(w.metamask_btc||0); }
function netWorth(w, bp, rates) {
  return totalBTC(w)*(bp||0)+(w.coinbase_usdt||0)+(w.uob_sgd||0)/(rates.USDSGD||1.354)+(w.revolut_sgd||0)/(rates.USDSGD||1.354)+(w.bca_idr||0)/(rates.USDIDR||16200);
}
function buildMonth(ym, ledger, bp, rates) {
  const hist = HISTORICAL[ym];
  const entries = ledger.filter(e=>e.date?.startsWith(ym));
  const incE = entries.filter(e=>e.type==="income");
  const expE = entries.filter(e=>e.type==="expense");
  const liveInc  = incE.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const liveExp  = expE.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const liveCats = {};
  EXPENSE_CATS.forEach(c=>liveCats[c]=0);
  expE.forEach(e=>{ if(e.category) liveCats[e.category]=(liveCats[e.category]||0)+toUSD(e.amount,e.currency,rates,bp); });
  const inc  = (hist?.inc||0)+liveInc;
  const cost = (hist?.cost||0)+liveExp;
  const cats = {};
  EXPENSE_CATS.forEach(c=>cats[c]=(hist?.cats[c]||0)+(liveCats[c]||0));
  return { inc, cost, net:inc-cost, margin:inc>0?(inc-cost)/inc:0, cats, liveEntries:entries.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ENGINE
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(messages, system, tools=[]) {
  const body = { model:"claude-sonnet-4-6", max_tokens:1500, system, messages };
  if (tools.length) body.tools = tools;
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers:{
      "Content-Type":"application/json",
      "x-api-key": process.env.REACT_APP_ANTHROPIC_API_KEY,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true",
    }, body:JSON.stringify(body),
  });
  const d = await r.json();
  return d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
}

async function parseTransaction(text, rates, bp) {
  const today = new Date().toISOString().slice(0,10);
  const sys = `You are a financial transaction parser for a crypto entrepreneur in Singapore/Jakarta.
Parse natural language into structured JSON ledger entries.

ACCOUNTS: coinbase_btc (BTC income), metamask_btc (BTC), coinbase_usdt (USDT), uob_sgd (SGD), revolut_sgd (SGD), bca_idr (IDR cash)
EXPENSE CATEGORIES: ${EXPENSE_CATS.join(", ")}
CURRENCY RULES:
- "revolut" → account:revolut_sgd, currency:SGD
- "UOB" → account:uob_sgd, currency:SGD  
- "BCA","cash","tunai" → account:bca_idr, currency:IDR
- BTC income → account:coinbase_btc, currency:BTC
- USDT income → account:coinbase_usdt, currency:USDT
- IDR "juta" = ×1,000,000 | "ribu" = ×1,000
- Infer category from context. Personal names Dad/Mom/Sam/Glenn = their category.
- Today: ${today}

Return ONLY valid JSON array. No markdown, no explanation.
[{"type":"income|expense","category":"...","amount":0,"currency":"BTC|USDT|USD|SGD|IDR","account":"...","label":"...","date":"YYYY-MM-DD"}]`;
  const txt = await callClaude([{role:"user",content:text}], sys);
  const clean = txt.replace(/```json|```/g,"").trim();
  return JSON.parse(clean);
}

async function aiChat(userMsg, state, bp) {
  const nw = netWorth(state.wallets, bp, state.rates);
  const thisM = new Date().toISOString().slice(0,7);
  const md = buildMonth(thisM, state.ledger, bp, state.rates);
  const btcTotal = totalBTC(state.wallets);
  const btcPnL = bp && state.btcCostBasis ? (bp - state.btcCostBasis)*btcTotal : 0;
  const recentTx = state.ledger.slice(0,5).map(e=>`${e.date} [${e.type}] ${e.label||e.category} ${e.amount} ${e.currency}`).join("\n")||"none";
  const openOrders = state.orders.filter(o=>o.status!=="delivered").length;

  const sys = `You are Jo's personal finance AI — sharp, direct, data-driven. You know everything about his financial state.

LIVE STATE:
- BTC price: ${bp?cu(bp):"unknown"} | Cost basis: ${cu(state.btcCostBasis)} | BTC PnL: ${cu(btcPnL)}
- Total BTC: ${cbt(btcTotal)} = ${bp?cu(btcTotal*bp):"?"}
- Net worth (USD): ${cu(nw)} = ${csg(nw*state.rates.USDSGD)}
- Coinbase USDT: ${cu(state.wallets.coinbase_usdt)} | UOB: ${csg(state.wallets.uob_sgd)} | Revolut: ${csg(state.wallets.revolut_sgd)} | BCA: ${cid(state.wallets.bca_idr)}
- This month: ${cu(md.inc)} income | ${cu(md.cost)} costs | ${cu(md.net)} net | ${cp(md.margin)} margin
- Open orders: ${openOrders}
- Recent tx: ${recentTx}
- Historical: Apr $4,684 inc/$2,416 cost | May $5,533/$3,075 | Jun $6,446/$1,617

You can also detect if the user is logging a transaction (not just asking). If they describe income/expenses, respond with analysis AND a JSON block at the end:
<TRANSACTIONS>[...]</TRANSACTIONS>

Be concise, insightful. Use $ values. Give real advice, not platitudes.`;

  return await callClaude([...state.chatHistory.slice(-8), {role:"user",content:userMsg}], sys);
}

async function fetchBTCPrice() {
  const txt = await callClaude(
    [{role:"user",content:"Current Bitcoin BTC/USD price right now. Reply with ONLY the number."}],
    "You fetch financial data. Return only the requested number, nothing else.",
    [{type:"web_search_20250305",name:"web_search"}]
  );
  const m = txt.match(/([\d,]+(?:\.\d+)?)/);
  if (m) { const p = parseFloat(m[1].replace(/,/g,"")); if(p>10000) return p; }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Metric({ label, value, sub, color="#F5F5F0", trend, small }) {
  return (
    <div style={{ padding:"20px 24px", borderRight:"1px solid #1C1C1C", borderBottom:"1px solid #1C1C1C" }}>
      <div style={{ fontSize:10, color:"#4A4A4A", letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:10, fontFamily:"'SF Mono',monospace" }}>{label}</div>
      <div style={{ fontSize: small?18:24, fontWeight:700, color, lineHeight:1, letterSpacing:"-0.02em", fontFamily:"'Inter',sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#3A3A3A", marginTop:6, fontFamily:"'SF Mono',monospace" }}>{sub}</div>}
      {trend !== undefined && <div style={{ fontSize:11, color: trend>=0?"#4ADE80":"#F87171", marginTop:4 }}>{trend>=0?"↑":"↓"} {Math.abs(trend).toFixed(1)}%</div>}
    </div>
  );
}

function Badge({ children, color="#4ADE80" }) {
  return <span style={{ display:"inline-block", background:color+"18", color, border:`1px solid ${color}30`, borderRadius:3, padding:"2px 7px", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600, fontFamily:"'SF Mono',monospace" }}>{children}</span>;
}

function Card({ children, style={} }) {
  return <div style={{ background:"#0F0F0F", border:"1px solid #1C1C1C", borderRadius:10, overflow:"hidden", ...style }}>{children}</div>;
}

function CardHeader({ title, action }) {
  return (
    <div style={{ padding:"16px 20px", borderBottom:"1px solid #1C1C1C", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ fontSize:10, color:"#4A4A4A", letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:"'SF Mono',monospace" }}>{title}</span>
      {action}
    </div>
  );
}

function Pill({ label, value, color="#4ADE80" }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", padding:"11px 20px", borderBottom:"1px solid #111" }}>
      <span style={{ fontSize:13, color:"#666", fontFamily:"'SF Mono',monospace" }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:600, color, fontFamily:"'SF Mono',monospace" }}>{value}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:"#151515", border:"1px solid #2A2A2A", borderRadius:6, padding:"10px 14px" }}>
      <div style={{ fontSize:11, color:"#666", marginBottom:4 }}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{ fontSize:13, color:p.color, fontWeight:600 }}>{p.name}: {p.name?.includes("BTC")?p.value?.toFixed(4):cu(p.value)}</div>)}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEWS
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ st, bp }) {
  const { wallets:w, rates, ledger, orders, btcCostBasis } = st;
  const nw = netWorth(w, bp, rates);
  const btcTotal = totalBTC(w);
  const btcVal = btcTotal*(bp||0);
  const btcPnL = bp && btcCostBasis ? (bp-btcCostBasis)*btcTotal : 0;
  const btcPnLPct = btcCostBasis ? (bp-btcCostBasis)/btcCostBasis*100 : 0;
  const thisM = new Date().toISOString().slice(0,7);
  const md = buildMonth(thisM, ledger, bp, rates);

  const chartData = ["2025-04","2025-05","2025-06",thisM].filter((v,i,a)=>a.indexOf(v)===i).map(ym=>{
    const m = buildMonth(ym, ledger, bp, rates);
    const mo = MONTHS_SHORT[parseInt(ym.split("-")[1])-1];
    return { month:mo, income:Math.round(m.inc), costs:Math.round(m.cost), net:Math.round(m.net), btc:(totalBTC(w)*(bp||0)).toFixed(0) };
  });

  const pieData = EXPENSE_CATS.map(c=>({ name:c, value:md.cats[c]||0 })).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,6);
  const COLORS = ["#F87171","#FB923C","#FBBF24","#4ADE80","#60A5FA","#A78BFA"];

  const openOrders = orders.filter(o=>o.status!=="delivered");
  const totalOrderPnL = orders.reduce((s,o)=>s+(o.salePrice-o.cost),0);

  return (
    <div style={{ padding:"0 0 24px" }}>
      {/* Net worth hero */}
      <div style={{ padding:"32px 28px 0", marginBottom:1 }}>
        <div style={{ fontSize:11, color:"#4A4A4A", letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:8, fontFamily:"'SF Mono',monospace" }}>Total net worth</div>
        <div style={{ display:"flex", alignItems:"baseline", gap:16, flexWrap:"wrap" }}>
          <div style={{ fontSize:48, fontWeight:800, letterSpacing:"-0.04em", color:"#F5F5F0", lineHeight:1 }}>{bp?cu(nw):"—"}</div>
          {bp && <div style={{ fontSize:14, color: btcPnL>=0?"#4ADE80":"#F87171", fontFamily:"'SF Mono',monospace" }}>{btcPnL>=0?"▲":"▼"} {cu(Math.abs(btcPnL))} BTC PnL ({btcPnLPct.toFixed(1)}%)</div>}
        </div>
        <div style={{ display:"flex", gap:16, marginTop:8, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:"#3A3A3A", fontFamily:"'SF Mono',monospace" }}>{cbt(btcTotal)} @ {bp?cu(bp):"—"}/BTC</span>
          {bp && <span style={{ fontSize:12, color:"#3A3A3A", fontFamily:"'SF Mono',monospace" }}>{csg(nw*rates.USDSGD)} SGD</span>}
        </div>
      </div>

      {/* Metrics strip */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", marginTop:24 }}>
        <Metric label="Income (mo)" value={cu(md.inc)} color="#4ADE80" trend={parseFloat(pct(md.inc,5533))} />
        <Metric label="Expenses (mo)" value={cu(md.cost)} color="#F87171" />
        <Metric label="Net (mo)" value={cu(md.net)} color={md.net>=0?"#4ADE80":"#F87171"} />
        <Metric label="Margin" value={cp(md.margin)} color={md.margin>0.5?"#4ADE80":"#FBBF24"} />
        <Metric label="Open Orders" value={openOrders.length} color="#60A5FA" sub={`${cu(openOrders.reduce((s,o)=>s+(o.salePrice-o.cost),0))} pending profit`} />
        <Metric label="Total Order P&L" value={cu(totalOrderPnL)} color="#A78BFA" />
      </div>

      {/* Charts row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"16px 16px 0", marginTop:4 }}>
        <Card>
          <CardHeader title="Monthly P&L" />
          <div style={{ padding:"16px 0 8px" }}>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barGap={2}>
                <XAxis dataKey="month" tick={{ fill:"#3A3A3A", fontSize:10, fontFamily:"SF Mono" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="income" fill="#4ADE8040" stroke="#4ADE80" strokeWidth={1} radius={[3,3,0,0]} name="Income" />
                <Bar dataKey="costs"  fill="#F8717140" stroke="#F87171" strokeWidth={1} radius={[3,3,0,0]} name="Costs" />
                <Bar dataKey="net"    fill="#60A5FA40" stroke="#60A5FA" strokeWidth={1} radius={[3,3,0,0]} name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Spend by Category" />
          <div style={{ padding:"8px 0", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                  {pieData.map((e,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v)=>cu(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ padding:"0 16px 12px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
            {pieData.slice(0,4).map((d,i)=>(
              <div key={d.name} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#555" }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:COLORS[i],flexShrink:0 }} />
                <span style={{ fontFamily:"'SF Mono',monospace" }}>{d.name} {cu(d.value,0)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Accounts + Open Orders */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"12px 16px 0" }}>
        <Card>
          <CardHeader title="Accounts" />
          <Pill label="Coinbase BTC" value={cbt(w.coinbase_btc)} color="#FBBF24" />
          <Pill label="MetaMask BTC" value={cbt(w.metamask_btc)} color="#FBBF24" />
          <Pill label="Coinbase USDT" value={cu(w.coinbase_usdt)} color="#4ADE80" />
          <Pill label="UOB SGD" value={csg(w.uob_sgd)} />
          <Pill label="Revolut SGD" value={csg(w.revolut_sgd)} />
          <Pill label="BCA IDR" value={cid(w.bca_idr)} />
        </Card>

        <Card>
          <CardHeader title="Open Orders" />
          {openOrders.length === 0 && <div style={{ padding:"24px 20px", color:"#333", fontSize:13, fontFamily:"'SF Mono',monospace" }}>No open orders.</div>}
          {openOrders.map(o=>(
            <div key={o.id} style={{ padding:"12px 20px", borderBottom:"1px solid #111" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontSize:13, color:"#F5F5F0", fontWeight:500, marginBottom:3 }}>{o.item}</div>
                  <div style={{ fontSize:11, color:"#444", fontFamily:"'SF Mono',monospace" }}>{o.client} · {o.date}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:13, color:"#4ADE80", fontWeight:700, fontFamily:"'SF Mono',monospace" }}>{cu(o.salePrice-o.cost)}</div>
                  <Badge color={o.status==="in_transit"?"#60A5FA":"#FBBF24"}>{o.status.replace("_"," ")}</Badge>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Ledger({ st, bp, onDelete }) {
  const [typeF, setTypeF] = useState("all");
  const [catF,  setCatF]  = useState("all");
  const [monthF,setMonthF]= useState("all");
  const { ledger, rates } = st;

  const filtered = ledger.filter(e=>{
    const tOk = typeF==="all"||e.type===typeF;
    const cOk = catF==="all"||e.category===catF;
    const mOk = monthF==="all"||e.date?.startsWith(monthF);
    return tOk&&cOk&&mOk;
  });

  const sel = { background:"#111", border:"1px solid #222", color:"#999", borderRadius:5, padding:"6px 10px", fontSize:11, fontFamily:"'SF Mono',monospace", outline:"none", cursor:"pointer" };

  return (
    <div style={{ padding:"20px 16px" }}>
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={sel}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select value={catF} onChange={e=>setCatF(e.target.value)} style={sel}>
          <option value="all">All categories</option>
          {EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={monthF} onChange={e=>setMonthF(e.target.value)} style={sel}>
          <option value="all">All months</option>
          {MONTH_KEYS.map((mk,i)=><option key={mk} value={`2025-${mk}`}>{MONTHS_SHORT[i]} 2025</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card style={{ padding:"48px 24px", textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>≡</div>
          <div style={{ color:"#333", fontSize:13, fontFamily:"'SF Mono',monospace" }}>No entries yet.</div>
          <div style={{ color:"#282828", fontSize:12, marginTop:6, fontFamily:"'SF Mono',monospace" }}>Use the AI chat to log income & expenses.</div>
        </Card>
      ) : (
        <Card>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:"'SF Mono',monospace" }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1C1C1C" }}>
                {["Date","Description","Category","Amount","USD Equiv","Account","Type",""].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"10px 16px", color:"#333", fontSize:10, letterSpacing:"0.14em", textTransform:"uppercase", fontWeight:500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e=>{
                const usd = toUSD(e.amount, e.currency, rates, bp);
                return (
                  <tr key={e.id} style={{ borderBottom:"1px solid #0D0D0D" }}>
                    <td style={{ padding:"11px 16px", color:"#444" }}>{e.date}</td>
                    <td style={{ padding:"11px 16px", color:"#C0C0C0", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.label||"—"}</td>
                    <td style={{ padding:"11px 16px", color:"#555" }}>{e.category||"—"}</td>
                    <td style={{ padding:"11px 16px", color:e.type==="income"?"#4ADE80":"#F87171", fontWeight:700 }}>{e.type==="income"?"+":"-"}{e.amount} {e.currency}</td>
                    <td style={{ padding:"11px 16px", color:"#444" }}>{cu(usd)}</td>
                    <td style={{ padding:"11px 16px", color:"#333" }}>{e.account||"—"}</td>
                    <td style={{ padding:"11px 16px" }}><Badge color={e.type==="income"?"#4ADE80":"#F87171"}>{e.type}</Badge></td>
                    <td style={{ padding:"11px 16px" }}>
                      <button onClick={()=>onDelete(e.id)} style={{ background:"none", border:"none", color:"#2A2A2A", cursor:"pointer", fontSize:13, padding:"0 4px" }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function CalendarView({ st, bp }) {
  const [year, setYear] = useState(2025);
  const { ledger, rates, budgets } = st;
  const nw = netWorth(st.wallets, bp, rates);

  const yearData = MONTH_KEYS.map((mk,i)=>{
    const ym = `${year}-${mk}`;
    const md = buildMonth(ym, ledger, bp, rates);
    const prevMd = i>0 ? buildMonth(`${year}-${MONTH_KEYS[i-1]}`, ledger, bp, rates) : null;
    const lastBal = i===0 ? 8900 : (prevMd?.net||0);
    return { ...md, month:MONTHS_SHORT[i], ym, lastBal, endBal:lastBal+md.net, hasData:md.inc>0||md.cost>0 };
  });

  const totals = yearData.reduce((acc,m)=>({ inc:acc.inc+m.inc, cost:acc.cost+m.cost }),{ inc:0,cost:0 });
  const thisM = new Date().toISOString().slice(0,7);

  return (
    <div style={{ padding:"20px 16px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontSize:10, color:"#4A4A4A", letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:"'SF Mono',monospace" }}>Annual Earnings Calendar</div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <button onClick={()=>setYear(y=>y-1)} style={{ background:"#111",border:"1px solid #222",color:"#666",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:13 }}>‹</button>
          <span style={{ fontSize:13,fontWeight:700,color:"#F5F5F0",fontFamily:"'SF Mono',monospace",padding:"0 8px" }}>{year}</span>
          <button onClick={()=>setYear(y=>y+1)} style={{ background:"#111",border:"1px solid #222",color:"#666",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:13 }}>›</button>
        </div>
      </div>

      <Card style={{ marginBottom:16, overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:"'SF Mono',monospace", minWidth:700 }}>
          <thead>
            <tr style={{ borderBottom:"1px solid #1C1C1C" }}>
              {["Month","Last Bal","Earnings","Costs","Net","End Balance","Margin","SGD Net"].map(h=>(
                <th key={h} style={{ textAlign:h==="Month"?"left":"right", padding:"10px 14px", color:"#333", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yearData.map(m=>{
              const isCur = m.ym===thisM;
              return (
                <tr key={m.ym} style={{ borderBottom:"1px solid #0D0D0D", background:isCur?"#111":"transparent", opacity:m.hasData?1:0.25 }}>
                  <td style={{ padding:"11px 14px", color:isCur?"#FBBF24":"#999", fontWeight:isCur?700:400 }}>{m.month}{isCur?" ●":""}</td>
                  <td style={{ padding:"11px 14px", color:"#444", textAlign:"right" }}>{m.hasData?cu(m.lastBal):"—"}</td>
                  <td style={{ padding:"11px 14px", color:"#4ADE80", textAlign:"right", fontWeight:600 }}>{m.hasData?cu(m.inc):"—"}</td>
                  <td style={{ padding:"11px 14px", color:"#F87171", textAlign:"right" }}>{m.cost>0?cu(m.cost):"—"}</td>
                  <td style={{ padding:"11px 14px", color:m.net>=0?"#4ADE80":"#F87171", textAlign:"right", fontWeight:600 }}>{m.hasData?cu(m.net):"—"}</td>
                  <td style={{ padding:"11px 14px", color:m.endBal>=0?"#60A5FA":"#F87171", textAlign:"right", fontWeight:700 }}>{m.hasData?cu(m.endBal):"—"}</td>
                  <td style={{ padding:"11px 14px", color:m.margin>0.5?"#4ADE80":"#888", textAlign:"right" }}>{m.hasData?cp(m.margin):"—"}</td>
                  <td style={{ padding:"11px 14px", color:"#555", textAlign:"right" }}>{m.hasData?csg(m.net*rates.USDSGD):"—"}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop:"1px solid #2A2A2A" }}>
              <td style={{ padding:"12px 14px", fontWeight:700, color:"#F5F5F0" }}>TOTAL {year}</td>
              <td style={{ padding:"12px 14px", textAlign:"right", color:"#444" }}>—</td>
              <td style={{ padding:"12px 14px", color:"#4ADE80", textAlign:"right", fontWeight:700 }}>{cu(totals.inc)}</td>
              <td style={{ padding:"12px 14px", color:"#F87171", textAlign:"right", fontWeight:700 }}>{cu(totals.cost)}</td>
              <td style={{ padding:"12px 14px", color:totals.inc-totals.cost>=0?"#4ADE80":"#F87171", textAlign:"right", fontWeight:700 }}>{cu(totals.inc-totals.cost)}</td>
              <td style={{ padding:"12px 14px", textAlign:"right", color:"#666" }}>—</td>
              <td style={{ padding:"12px 14px", color:"#4ADE80", textAlign:"right", fontWeight:700 }}>{cp(totals.inc>0?(totals.inc-totals.cost)/totals.inc:0)}</td>
              <td style={{ padding:"12px 14px", color:"#555", textAlign:"right" }}>{csg((totals.inc-totals.cost)*rates.USDSGD)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Category breakdown */}
      <Card style={{ overflowX:"auto" }}>
        <CardHeader title={`Expense Categories · ${year}`} />
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"'SF Mono',monospace", minWidth:900 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid #1C1C1C" }}>
                <th style={{ textAlign:"left", padding:"8px 14px", color:"#333", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:500, width:130 }}>Category</th>
                {MONTHS_SHORT.map(m=><th key={m} style={{ textAlign:"right", padding:"8px 8px", color:"#333", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:500, minWidth:55 }}>{m}</th>)}
                <th style={{ textAlign:"right", padding:"8px 14px", color:"#555", fontSize:10, letterSpacing:"0.1em", fontWeight:600 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {EXPENSE_CATS.map(cat=>{
                const vals = MONTH_KEYS.map(mk=>buildMonth(`${year}-${mk}`,ledger,bp,rates).cats[cat]||0);
                const total = vals.reduce((a,b)=>a+b,0);
                const bud = budgets?.[cat]||0;
                return (
                  <tr key={cat} style={{ borderBottom:"1px solid #0D0D0D" }}>
                    <td style={{ padding:"9px 14px", color:"#666" }}>{cat}</td>
                    {vals.map((v,i)=>(
                      <td key={i} style={{ padding:"9px 8px", textAlign:"right", color:v>0?"#F87171":"#222" }}>
                        {v>0?cu(v,0):"—"}
                      </td>
                    ))}
                    <td style={{ padding:"9px 14px", textAlign:"right", color:"#F87171", fontWeight:700 }}>{total>0?cu(total):"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Orders({ st, bp, onUpdateOrder }) {
  const { orders, rates } = st;
  const STATUS_COLOR = { delivered:"#4ADE80", in_transit:"#60A5FA", pending:"#FBBF24", cancelled:"#F87171" };

  const totalRevenue = orders.reduce((s,o)=>s+o.salePrice,0);
  const totalCost    = orders.reduce((s,o)=>s+o.cost,0);
  const totalPnL     = totalRevenue-totalCost;
  const avgMargin    = totalRevenue>0?totalPnL/totalRevenue:0;

  return (
    <div style={{ padding:"20px 16px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:1, marginBottom:16, border:"1px solid #1C1C1C", borderRadius:10, overflow:"hidden" }}>
        <Metric label="Total Revenue" value={cu(totalRevenue)} color="#4ADE80" />
        <Metric label="Total Cost" value={cu(totalCost)} color="#F87171" />
        <Metric label="Total P&L" value={cu(totalPnL)} color="#60A5FA" />
        <Metric label="Avg Margin" value={cp(avgMargin)} color="#FBBF24" />
      </div>

      <Card>
        <CardHeader title="Order Book" />
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, fontFamily:"'SF Mono',monospace" }}>
          <thead>
            <tr style={{ borderBottom:"1px solid #1C1C1C" }}>
              {["Order ID","Item","Client","Cost","Sale","P&L","BTC","Status","Date","Days"].map(h=>(
                <th key={h} style={{ textAlign:"left", padding:"10px 14px", color:"#333", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:500, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map(o=>(
              <tr key={o.id} style={{ borderBottom:"1px solid #0D0D0D" }}>
                <td style={{ padding:"12px 14px", color:"#555" }}>{o.id}</td>
                <td style={{ padding:"12px 14px", color:"#C0C0C0", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{o.item}</td>
                <td style={{ padding:"12px 14px", color:"#666" }}>{o.client}</td>
                <td style={{ padding:"12px 14px", color:"#F87171" }}>{cu(o.cost)}</td>
                <td style={{ padding:"12px 14px", color:"#4ADE80", fontWeight:600 }}>{cu(o.salePrice)}</td>
                <td style={{ padding:"12px 14px", color:"#60A5FA", fontWeight:700 }}>{cu(o.salePrice-o.cost)}</td>
                <td style={{ padding:"12px 14px", color:"#FBBF24" }}>{cbt(o.btcAmount)}</td>
                <td style={{ padding:"12px 14px" }}>
                  <select value={o.status} onChange={e=>onUpdateOrder(o.id,{status:e.target.value})}
                    style={{ background:"#111",border:`1px solid ${STATUS_COLOR[o.status]||"#333"}30`,color:STATUS_COLOR[o.status]||"#666",borderRadius:4,padding:"3px 7px",fontSize:10,fontFamily:"inherit",cursor:"pointer",outline:"none",textTransform:"uppercase",letterSpacing:"0.08em" }}>
                    {["pending","in_transit","delivered","cancelled"].map(s=><option key={s} value={s}>{s.replace("_"," ")}</option>)}
                  </select>
                </td>
                <td style={{ padding:"12px 14px", color:"#444" }}>{o.date}</td>
                <td style={{ padding:"12px 14px", color:"#555" }}>{o.deliveryDays?`${o.deliveryDays}d`:"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Analytics({ st, bp }) {
  const { ledger, rates, orders } = st;
  const nw = netWorth(st.wallets, bp, rates);

  const chartData = ["2025-04","2025-05","2025-06"].map((ym,i)=>{
    const md = buildMonth(ym, ledger, bp, rates);
    return { month:MONTHS_SHORT[parseInt(ym.split("-")[1])-1], income:Math.round(md.inc), cost:Math.round(md.cost), net:Math.round(md.net), margin:Math.round(md.margin*100) };
  });

  const catTotals = EXPENSE_CATS.map(c=>{
    const val = ["2025-04","2025-05","2025-06"].reduce((s,ym)=>s+(buildMonth(ym,ledger,bp,rates).cats[c]||0),0);
    return { name:c, value:Math.round(val) };
  }).filter(d=>d.value>0).sort((a,b)=>b.value-a.value);

  const COLORS = ["#F87171","#FB923C","#FBBF24","#4ADE80","#60A5FA","#A78BFA","#F472B6","#34D399","#818CF8","#FCD34D","#6EE7B7"];

  return (
    <div style={{ padding:"20px 16px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
        <Card>
          <CardHeader title="Income vs Costs vs Net" />
          <div style={{ padding:"12px 0 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{ fill:"#3A3A3A",fontSize:11,fontFamily:"SF Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#3A3A3A",fontSize:10,fontFamily:"SF Mono" }} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="income" fill="#4ADE8030" stroke="#4ADE80" strokeWidth={1} radius={[3,3,0,0]} name="Income" />
                <Bar dataKey="cost"   fill="#F8717130" stroke="#F87171" strokeWidth={1} radius={[3,3,0,0]} name="Cost" />
                <Bar dataKey="net"    fill="#60A5FA30" stroke="#60A5FA" strokeWidth={1} radius={[3,3,0,0]} name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Margin % Trend" />
          <div style={{ padding:"12px 0 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ADE80" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4ADE80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill:"#3A3A3A",fontSize:11,fontFamily:"SF Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:"#3A3A3A",fontSize:10,fontFamily:"SF Mono" }} axisLine={false} tickLine={false} tickFormatter={v=>v+"%"} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="margin" stroke="#4ADE80" strokeWidth={2} fill="url(#mg)" name="Margin %" dot={{ fill:"#4ADE80",strokeWidth:0,r:4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Cumulative Spend by Category (Apr–Jun 2025)" />
        <div style={{ padding:"16px 20px" }}>
          {catTotals.map((c,i)=>{
            const pctVal = catTotals[0]?.value>0?c.value/catTotals[0].value:0;
            return (
              <div key={c.name} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5, fontFamily:"'SF Mono',monospace" }}>
                  <span style={{ color:"#666" }}>{c.name}</span>
                  <span style={{ color:COLORS[i%COLORS.length], fontWeight:600 }}>{cu(c.value)}</span>
                </div>
                <div style={{ height:3, background:"#151515", borderRadius:2 }}>
                  <div style={{ height:3, background:COLORS[i%COLORS.length], borderRadius:2, width:Math.min(100,pctVal*100)+"%" }} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:12 }}>
        {[
          { label:"Best Month", val:"Jun 2025", sub:"$6,446 income · 74.9% margin" },
          { label:"Total 3-Month P&L", val:cu(16663.35-7108.81), sub:"Apr+May+Jun combined" },
          { label:"Avg Monthly Income", val:cu((4684+5533.35+6446)/3), sub:"3-month trailing avg" },
        ].map(s=>(
          <Card key={s.label} style={{ padding:"20px" }}>
            <div style={{ fontSize:10, color:"#444", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:10, fontFamily:"'SF Mono',monospace" }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:"#F5F5F0" }}>{s.val}</div>
            <div style={{ fontSize:11, color:"#333", marginTop:6, fontFamily:"'SF Mono',monospace" }}>{s.sub}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Wallets({ st, bp, onUpdate }) {
  const { wallets:w, rates, btcCostBasis } = st;
  const nw = netWorth(w, bp, rates);
  const btcTotal = totalBTC(w);
  const btcPnL = bp && btcCostBasis ? (bp-btcCostBasis)*btcTotal : 0;
  const inp = { background:"#111",border:"1px solid #222",color:"#F5F5F0",borderRadius:5,padding:"7px 10px",fontSize:12,width:160,textAlign:"right",fontFamily:"'SF Mono',monospace",outline:"none" };

  return (
    <div style={{ padding:"20px 16px" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:1, marginBottom:16, border:"1px solid #1C1C1C", borderRadius:10, overflow:"hidden" }}>
        <Metric label="Net Worth USD" value={bp?cu(nw):"—"} color="#F5F5F0" sub={bp?csg(nw*rates.USDSGD)+" SGD":undefined} />
        <Metric label="BTC Holdings" value={cbt(btcTotal)} color="#FBBF24" sub={bp?cu(btcTotal*bp):undefined} />
        <Metric label="BTC P&L" value={bp?cu(btcPnL):"—"} color={btcPnL>=0?"#4ADE80":"#F87171"} sub={bp&&btcCostBasis?`basis ${cu(btcCostBasis)}/BTC`:undefined} />
        <Metric label="Liquid (Non-BTC)" value={cu((w.coinbase_usdt||0)+(w.uob_sgd||0)/rates.USDSGD+(w.revolut_sgd||0)/rates.USDSGD+(w.bca_idr||0)/rates.USDIDR)} color="#60A5FA" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card>
          <CardHeader title="Crypto Wallets" />
          {[
            { key:"coinbase_btc",  label:"Coinbase BTC",  step:"0.000001", type:"BTC" },
            { key:"metamask_btc",  label:"MetaMask BTC",  step:"0.000001", type:"BTC" },
            { key:"coinbase_usdt", label:"Coinbase USDT", step:"0.01",     type:"USDT" },
          ].map(a=>(
            <div key={a.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px", borderBottom:"1px solid #111" }}>
              <div>
                <div style={{ fontSize:13, color:"#888", fontFamily:"'SF Mono',monospace" }}>{a.label}</div>
                {a.type==="BTC"&&bp&&<div style={{ fontSize:11, color:"#3A3A3A", marginTop:2, fontFamily:"'SF Mono',monospace" }}>≈ {cu(w[a.key]*bp)}</div>}
              </div>
              <input type="number" step={a.step} value={w[a.key]||0}
                onChange={e=>onUpdate("wallets",{ ...w,[a.key]:parseFloat(e.target.value)||0 })} style={inp} />
            </div>
          ))}
        </Card>

        <Card>
          <CardHeader title="Bank Accounts" />
          {[
            { key:"uob_sgd",    label:"UOB (SGD)",     step:"0.01",  type:"SGD" },
            { key:"revolut_sgd",label:"Revolut (SGD)", step:"0.01",  type:"SGD" },
            { key:"bca_idr",    label:"BCA (IDR)",     step:"1000",  type:"IDR" },
          ].map(a=>(
            <div key={a.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px", borderBottom:"1px solid #111" }}>
              <div>
                <div style={{ fontSize:13, color:"#888", fontFamily:"'SF Mono',monospace" }}>{a.label}</div>
                <div style={{ fontSize:11, color:"#3A3A3A", marginTop:2, fontFamily:"'SF Mono',monospace" }}>≈ {cu(toUSD(w[a.key],a.type,rates,bp))}</div>
              </div>
              <input type="number" step={a.step} value={w[a.key]||0}
                onChange={e=>onUpdate("wallets",{ ...w,[a.key]:parseFloat(e.target.value)||0 })} style={inp} />
            </div>
          ))}
        </Card>
      </div>

      <Card style={{ marginTop:12 }}>
        <CardHeader title="FX Rates & Settings" />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0 }}>
          {[["USDSGD","USD/SGD","0.0001"],["USDIDR","USD/IDR","1"]].map(([k,l,step])=>(
            <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px", borderRight:"1px solid #111" }}>
              <span style={{ fontSize:12, color:"#666", fontFamily:"'SF Mono',monospace" }}>{l}</span>
              <input type="number" step={step} value={rates[k]}
                onChange={e=>onUpdate("rates",{ ...rates,[k]:parseFloat(e.target.value)||rates[k] })} style={{ ...inp,width:110 }} />
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px" }}>
            <span style={{ fontSize:12, color:"#666", fontFamily:"'SF Mono',monospace" }}>BTC Cost Basis</span>
            <input type="number" step="1" value={st.btcCostBasis||0}
              onChange={e=>onUpdate("btcCostBasis",parseFloat(e.target.value)||0)} style={{ ...inp,width:120 }} />
          </div>
        </div>
      </Card>

      <Card style={{ marginTop:12 }}>
        <CardHeader title="Net Worth Breakdown" />
        {[
          { label:"BTC (Coinbase + MetaMask)", val:btcTotal*(bp||0), display:cbt(btcTotal), color:"#FBBF24" },
          { label:"Coinbase USDT", val:w.coinbase_usdt||0, display:cu(w.coinbase_usdt), color:"#4ADE80" },
          { label:"UOB + Revolut (SGD)", val:((w.uob_sgd||0)+(w.revolut_sgd||0))/rates.USDSGD, display:csg((w.uob_sgd||0)+(w.revolut_sgd||0)), color:"#60A5FA" },
          { label:"BCA (IDR)", val:(w.bca_idr||0)/rates.USDIDR, display:cid(w.bca_idr), color:"#A78BFA" },
        ].map(r=>(
          <div key={r.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 20px", borderBottom:"1px solid #111" }}>
            <div>
              <div style={{ fontSize:13, color:"#888", fontFamily:"'SF Mono',monospace" }}>{r.label}</div>
              <div style={{ fontSize:11, color:"#333", marginTop:2, fontFamily:"'SF Mono',monospace" }}>{r.display}</div>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:r.color, fontFamily:"'SF Mono',monospace" }}>{cu(r.val)}</div>
          </div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", padding:"16px 20px" }}>
          <span style={{ fontSize:14, fontWeight:700, color:"#F5F5F0" }}>Total</span>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:18, fontWeight:800, color:"#F5F5F0", fontFamily:"'SF Mono',monospace" }}>{cu(nw)}</div>
            <div style={{ fontSize:11, color:"#3A3A3A", marginTop:3, fontFamily:"'SF Mono',monospace" }}>{csg(nw*rates.USDSGD)} · {cid(nw*rates.USDIDR)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AIChat({ st, bp, onTransactions, onBTCFetch, btcLoading }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs]   = useState([
    { role:"assistant", content:"I'm your financial OS. Tell me what happened today, ask for analysis, or just log a transaction naturally.\n\nExamples:\n• \"revolut $30 dinner last night\"\n• \"made 0.004 BTC from dropshipping today\"\n• \"BCA 500 ribu for gas\"\n• \"how's my margin trending?\"" }
  ]);
  const [loading, setLoading] = useState(false);
  const [pendingTx, setPendingTx] = useState(null);
  const scrollRef = useRef(null);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[msgs,loading]);

  async function send() {
    if (!input.trim()||loading) return;
    const userMsg = input.trim();
    setInput("");
    setMsgs(m=>[...m,{role:"user",content:userMsg}]);
    setLoading(true);

    try {
      const reply = await aiChat(userMsg, { ...st, chatHistory: msgs }, bp);
      // Extract transaction JSON if present
      const txMatch = reply.match(/<TRANSACTIONS>([\s\S]*?)<\/TRANSACTIONS>/);
      let cleanReply = reply.replace(/<TRANSACTIONS>[\s\S]*?<\/TRANSACTIONS>/g,"").trim();
      if (txMatch) {
        try {
          const txs = JSON.parse(txMatch[1].trim());
          setPendingTx(txs);
          cleanReply += "\n\n*I've parsed transactions above — confirm to save them.*";
        } catch {}
      }
      setMsgs(m=>[...m,{role:"assistant",content:cleanReply}]);
    } catch(e) {
      setMsgs(m=>[...m,{role:"assistant",content:"Error: "+e.message}]);
    }
    setLoading(false);
  }

  async function quickLog() {
    if (!input.trim()||loading) return;
    const txt = input.trim();
    setInput("");
    setMsgs(m=>[...m,{role:"user",content:txt},{role:"assistant",content:"Parsing..."}]);
    setLoading(true);
    try {
      const txs = await parseTransaction(txt, st.rates, bp);
      setPendingTx(txs);
      setMsgs(m=>[...m.slice(0,-1),{role:"assistant",content:`Parsed ${txs.length} transaction(s). Confirm to save.`}]);
    } catch(e) {
      setMsgs(m=>[...m.slice(0,-1),{role:"assistant",content:"Parse error: "+e.message}]);
    }
    setLoading(false);
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 130px)", padding:"0 16px 16px" }}>
      {/* Messages */}
      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", paddingTop:16, paddingBottom:8 }}>
        {msgs.map((m,i)=>(
          <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", marginBottom:12 }}>
            {m.role==="assistant"&&<div style={{ width:24,height:24,borderRadius:"50%",background:"#1C1C1C",border:"1px solid #2A2A2A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,marginRight:8,flexShrink:0,marginTop:2,color:"#FBBF24" }}>✦</div>}
            <div style={{ maxWidth:"78%", background:m.role==="user"?"#1C1C1C":"#111", border:`1px solid ${m.role==="user"?"#2A2A2A":"#1C1C1C"}`, borderRadius:m.role==="user"?"10px 10px 2px 10px":"10px 10px 10px 2px", padding:"12px 16px", fontSize:13, color:"#C0C0C0", lineHeight:1.6, whiteSpace:"pre-wrap", fontFamily:"'SF Mono',monospace" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{ display:"flex", gap:8, padding:"0 0 12px 32px" }}>
          {[0,1,2].map(i=><div key={i} style={{ width:6,height:6,borderRadius:"50%",background:"#FBBF24",animation:"pulse 1.2s infinite",animationDelay:`${i*0.2}s`,opacity:0.6 }} />)}
        </div>}

        {/* Pending transactions */}
        {pendingTx&&(
          <div style={{ background:"#0F0F0F",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 16px",marginBottom:12,marginLeft:32 }}>
            <div style={{ fontSize:10,color:"#555",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:10,fontFamily:"'SF Mono',monospace" }}>Confirm transactions</div>
            {pendingTx.map((t,i)=>(
              <div key={i} style={{ fontSize:12,color:"#C0C0C0",padding:"5px 0",borderBottom:"1px solid #151515",fontFamily:"'SF Mono',monospace",display:"flex",justifyContent:"space-between" }}>
                <span><Badge color={t.type==="income"?"#4ADE80":"#F87171"}>{t.type}</Badge> <span style={{ marginLeft:8,color:"#666" }}>{t.date}</span> <span style={{ marginLeft:8 }}>{t.label||t.category}</span></span>
                <span style={{ color:t.type==="income"?"#4ADE80":"#F87171",fontWeight:700 }}>{t.amount} {t.currency} → {t.account}</span>
              </div>
            ))}
            <div style={{ display:"flex",gap:8,marginTop:10 }}>
              <button onClick={()=>{ onTransactions(pendingTx); setPendingTx(null); setMsgs(m=>[...m,{role:"assistant",content:"✓ Saved. Ledger & balances updated."}]); }}
                style={{ background:"#F5F5F0",color:"#0A0A0A",border:"none",borderRadius:5,padding:"7px 16px",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'SF Mono',monospace" }}>
                Confirm & Save
              </button>
              <button onClick={()=>setPendingTx(null)}
                style={{ background:"transparent",color:"#555",border:"1px solid #2A2A2A",borderRadius:5,padding:"7px 14px",fontSize:11,cursor:"pointer",fontFamily:"'SF Mono',monospace" }}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ borderTop:"1px solid #1C1C1C",paddingTop:12 }}>
        <div style={{ display:"flex",gap:8,marginBottom:8 }}>
          <button onClick={onBTCFetch} disabled={btcLoading}
            style={{ background:"#111",border:"1px solid #222",color:"#FBBF24",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em",whiteSpace:"nowrap" }}>
            {btcLoading?"fetching…":"↻ BTC price"}
          </button>
          <div style={{ flex:1,display:"flex",gap:6 }}>
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();} }}
              rows={2} placeholder='Ask anything or log a transaction. "0.003 BTC dropshipping today" · "revolut $45 dating" · "how is my margin?"'
              style={{ flex:1,background:"#111",border:"1px solid #222",borderRadius:8,padding:"10px 14px",color:"#F0F0F0",fontSize:12,fontFamily:"'SF Mono',monospace",outline:"none",resize:"none" }} />
            <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
              <button onClick={send} disabled={loading||!input.trim()}
                style={{ background:"#F5F5F0",color:"#0A0A0A",border:"none",borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em" }}>
                Ask →
              </button>
              <button onClick={quickLog} disabled={loading||!input.trim()}
                style={{ background:"#FBBF2420",color:"#FBBF24",border:"1px solid #FBBF2430",borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em" }}>
                Log ↗
              </button>
            </div>
          </div>
        </div>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {["0.003 BTC dropshipping today","revolut $45 dating Fri","BCA 200rb for gas","how's my margin trending?","net worth breakdown"].map(s=>(
            <button key={s} onClick={()=>setInput(s)}
              style={{ background:"#0F0F0F",border:"1px solid #1C1C1C",color:"#3A3A3A",borderRadius:4,padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.06em" }}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [st, setSt] = useState(load);
  const [view, setView] = useState("Dashboard");
  const [btcLoading, setBtcLoading] = useState(false);

  useEffect(()=>{ persist(st); }, [st]);

  const bp = st.btcPrice;

  function update(key, value) { setSt(s=>({ ...s, [key]:value })); }

  function applyTransactions(txs) {
    const newW = { ...st.wallets };
    const newEntries = txs.map(t=>({ ...t, id:Date.now()+Math.random(), amount:parseFloat(t.amount) }));
    newEntries.forEach(e=>{
      const amt = parseFloat(e.amount);
      if (!e.account||!newW.hasOwnProperty(e.account)) return;
      newW[e.account] = e.type==="income" ? (newW[e.account]||0)+amt : Math.max(0,(newW[e.account]||0)-amt);
    });
    setSt(s=>({ ...s, ledger:[...newEntries,...s.ledger], wallets:newW }));
  }

  async function handleBTCFetch() {
    setBtcLoading(true);
    const price = await fetchBTCPrice();
    if (price) {
      setSt(s=>({ ...s, btcPrice:price, lastBtcFetch:new Date().toISOString(),
        btcSnapshots:[...s.btcSnapshots,{price,ts:new Date().toISOString()}].slice(-200) }));
    }
    setBtcLoading(false);
  }

  const nw = netWorth(st.wallets, bp, st.rates);
  const btcTotal = totalBTC(st.wallets);

  return (
    <div style={{ background:"#080808", minHeight:"100vh", color:"#F5F5F0" }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        button { cursor:pointer; transition:opacity 0.15s; }
        button:hover:not(:disabled) { opacity:0.8; }
        button:disabled { opacity:0.4; cursor:not-allowed; }
        input:focus { border-color:#2A2A2A !important; }
        textarea:focus { border-color:#2A2A2A !important; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:#080808; }
        ::-webkit-scrollbar-thumb { background:#1C1C1C; border-radius:2px; }
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
      `}</style>

      {/* Top bar */}
      <div style={{ position:"sticky",top:0,zIndex:100,background:"#080808",borderBottom:"1px solid #131313" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0 20px", height:52 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
            <span style={{ fontSize:15, fontWeight:800, letterSpacing:"0.08em", color:"#F5F5F0", fontFamily:"'SF Mono',monospace" }}>JJ</span>
            <span style={{ fontSize:10, color:"#2A2A2A", letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:"'SF Mono',monospace" }}>Financial OS</span>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:6, overflowX:"auto" }}>
            {NAV_ITEMS.map((n,i)=>(
              <button key={n} onClick={()=>setView(n)}
                style={{ background:"transparent", border:"none", color:view===n?"#F5F5F0":"#333", fontSize:11, letterSpacing:"0.12em", textTransform:"uppercase", padding:"6px 12px", borderRadius:5, fontFamily:"'SF Mono',monospace", background:view===n?"#141414":"transparent", transition:"all 0.15s", whiteSpace:"nowrap" }}>
                <span style={{ marginRight:5, fontSize:12 }}>{NAV_ICONS[i]}</span>{n}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {bp && <div style={{ fontSize:11, color:"#FBBF24", fontFamily:"'SF Mono',monospace" }}>₿ {cu(bp)}</div>}
            {!bp && <button onClick={handleBTCFetch} disabled={btcLoading}
              style={{ background:"#FBBF2415",color:"#FBBF24",border:"1px solid #FBBF2425",borderRadius:5,padding:"5px 12px",fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'SF Mono',monospace" }}>
              {btcLoading?"…":"Fetch BTC"}
            </button>}
            <div style={{ fontSize:11, color:"#2A2A2A", fontFamily:"'SF Mono',monospace" }}>{bp?cu(nw):"—"}</div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth:1200, margin:"0 auto" }}>
        {view==="Dashboard" && <Dashboard st={st} bp={bp} />}
        {view==="Ledger"    && <Ledger st={st} bp={bp} onDelete={id=>setSt(s=>({...s,ledger:s.ledger.filter(e=>e.id!==id)}))} />}
        {view==="Calendar"  && <CalendarView st={st} bp={bp} />}
        {view==="Orders"    && <Orders st={st} bp={bp} onUpdateOrder={(id,patch)=>setSt(s=>({...s,orders:s.orders.map(o=>o.id===id?{...o,...patch}:o)}))} />}
        {view==="Analytics" && <Analytics st={st} bp={bp} />}
        {view==="Wallets"   && <Wallets st={st} bp={bp} onUpdate={update} />}
        {view==="AI Chat"   && <AIChat st={st} bp={bp} onTransactions={applyTransactions} onBTCFetch={handleBTCFetch} btcLoading={btcLoading} />}
      </div>
    </div>
  );
}