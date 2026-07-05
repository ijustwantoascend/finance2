import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://jhfvkgxzdvyowaehzooj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZnZrZ3h6ZHZ5b3dhZWh6b29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTk3MzMsImV4cCI6MjA5ODQ5NTczM30.5Gf8RYH6qXdJkm7NJHaIOxsiEAEGpeKy_84q1KjQRzM";
const sb = async (path, method="GET", body=null) => {
  const opts = { method, headers: { "Content-Type":"application/json","apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Prefer":"return=representation" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const EXPENSE_CATS = ["Dad","Mom","Sam","Glenn","Personal","Dating","Gas","Gear","Miscellaneous","Family","Debt Repayment"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_KEYS   = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const NAV_ITEMS = ["Dashboard","Ledger","Calendar","Orders","Analytics","Wallets","Budget","AI Chat"];
const NAV_ICONS = ["◈","≡","▦","⊞","∿","◎","◉","✦"];
const HISTORICAL = {
  "2026-04": { inc:4684.00, cost:2416.15, cats:{Dad:315.07,Mom:62.21,Sam:30.23,Glenn:0,Personal:645.35,Dating:232.24,Gas:94.19,Gear:242.63,Miscellaneous:37.87,Family:216.08,"Debt Repayment":0}},
  "2026-05": { inc:5533.35, cost:3075.17, cats:{Dad:1034.88,Mom:87.21,Sam:612.62,Glenn:145.35,Personal:563.49,Dating:198.31,Gas:81.40,Gear:395.35,Miscellaneous:0,Family:7.97,"Debt Repayment":0}},
  "2026-06": { inc:6765.00, cost:1603.71, cats:{Dad:306.76,Mom:129.83,Sam:129.83,Glenn:138.93,Personal:203.95,Dating:229.87,Gas:61.13,Gear:360.12,Miscellaneous:0,Family:44.46,"Debt Repayment":0}},
};
const DEFAULT_WALLETS = { coinbase_btc:0,metamask_btc:0,coinbase_usdt:0,metamask_usdt:0,uob_sgd:0,revolut_sgd:0,bca_idr:0 };
const DEFAULT_RATES   = { USDSGD:1.354, USDIDR:16200 };

// ── Utils ─────────────────────────────────────────────────────────────────────
const cu  = (n,d=2) => "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const csg = n => "S$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const cid = n => "Rp "+Math.round(n||0).toLocaleString("id-ID");
const cbt = n => Number(n||0).toFixed(6)+" ₿";
const cp  = n => (Number(n||0)*100).toFixed(1)+"%";
const pct = (a,b) => b?((a-b)/b*100).toFixed(1):"0.0";
function toUSD(amount,currency,rates,bp){ const a=Math.abs(parseFloat(amount||0)); if(currency==="BTC")return a*(bp||0); if(currency==="SGD")return a/(rates.USDSGD||1.354); if(currency==="IDR")return a/(rates.USDIDR||16200); return a; }
function totalBTC(w){ return (w.coinbase_btc||0)+(w.metamask_btc||0); }
function totalUSDT(w){ return (w.coinbase_usdt||0)+(w.metamask_usdt||0); }
function netWorth(w,bp,rates){ return totalBTC(w)*(bp||0)+totalUSDT(w)+(w.uob_sgd||0)/(rates.USDSGD||1.354)+(w.revolut_sgd||0)/(rates.USDSGD||1.354)+(w.bca_idr||0)/(rates.USDIDR||16200); }
function buildMonth(ym,ledger,bp,rates){
  const hist=HISTORICAL[ym];
  const entries=ledger.filter(e=>e.date?.startsWith(ym));
  const incE=entries.filter(e=>e.type==="income");
  const expE=entries.filter(e=>e.type==="expense");
  const liveInc=incE.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const liveExp=expE.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const inc=(hist?.inc||0)+liveInc;
  const cost=(hist?.cost||0)+liveExp;
  const cats={};EXPENSE_CATS.forEach(c=>cats[c]=0);
  expE.forEach(e=>{if(e.category)cats[e.category]=(cats[e.category]||0)+toUSD(e.amount,e.currency,rates,bp);});
  EXPENSE_CATS.forEach(c=>cats[c]=(cats[c]||0)+(hist?.cats[c]||0));
  return{inc,cost,net:inc-cost,margin:inc>0?(inc-cost)/inc:0,cats,count:entries.length};
}

// ── Live Feeds ────────────────────────────────────────────────────────────────
async function fetchBTCPrice(){
  try{ const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"); const d=await r.json(); return d.bitcoin?.usd||null; }
  catch{ try{ const r2=await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"); const d2=await r2.json(); return parseFloat(d2.price)||null; }catch{ return null; } }
}
async function fetchFXRates(){
  try{ const r=await fetch("https://api.exchangerate-api.com/v4/latest/USD"); const d=await r.json(); if(d?.rates?.SGD&&d?.rates?.IDR)return{USDSGD:d.rates.SGD,USDIDR:d.rates.IDR}; return null; }catch{ return null; }
}

// ── AI ────────────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;
async function callClaude(messages,system){
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1500,system,messages})});
  const d=await r.json(); if(d.error)throw new Error(d.error.message);
  return d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
}
async function parseTransaction(text,rates,bp){
  const today=new Date().toISOString().slice(0,10);
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const sys=`You are a financial transaction parser for a crypto entrepreneur based in Singapore/Indonesia.
FINANCIAL FLOW:
- INCOME: always crypto. BTC → metamask_btc or coinbase_btc. USDT → coinbase_usdt or metamask_usdt.
- EXPENSES: always fiat. SGD from revolut_sgd. IDR from bca_idr. Never deduct from crypto for expenses.
- TRANSFERS: two entries — expense from source + income to destination.
ACCOUNTS: metamask_btc, coinbase_btc, coinbase_usdt, metamask_usdt, uob_sgd, revolut_sgd, bca_idr
EXPENSE CATEGORIES (EXACTLY one): Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Miscellaneous, Family, Debt Repayment
CATEGORY MAPPING:
- dad, father, papa → Dad | mom, mother, mama → Mom | sam → Sam | glenn → Glenn
- gear, steroids, mast, test, tren, testosterone, anavar, winstrol, deca, eq, npp, bloodwork, blood test, labs, needles, syringes, pins, vials, any PED → Gear
- gas, fuel, petrol, transport, grab, taxi, uber, gojek → Gas
- dating, date, girlfriend, flowers → Dating
- personal, haircut, grooming → Personal
- supplements, supps, vitamins, protein, creatine, pre workout → Personal
- family, food, groceries, dinner, lunch, breakfast → Family
- debt, loan, repayment, installment → Debt Repayment
- anything else → Miscellaneous
CURRENCY RULES:
- "$", "dollar", "usd" in EXPENSES = SGD → revolut_sgd
- IDR, ribu, rb, juta = IDR → bca_idr
- SGD, S$ = SGD → revolut_sgd
- BTC income → metamask_btc (unless user says coinbase)
- USDT income → coinbase_usdt (unless user says metamask)
TRANSFER PAIRS: metamask→coinbase (BTC), coinbase→uob (USDT/BTC→SGD), uob→revolut (SGD), revolut→bca (SGD→IDR)
CRITICAL: date=YYYY-MM-DD always. Today=${today}. Yesterday=${yesterday}. Never write "today". account never null. amount positive. type exactly "income" or "expense".
Return ONLY valid JSON array, no markdown.
[{"type":"income|expense","category":"...","amount":0,"currency":"BTC|USDT|SGD|IDR","account":"...","label":"...","date":"YYYY-MM-DD"}]`;
  const txt=await callClaude([{role:"user",content:text}],sys);
  const clean=txt.replace(/```json[\s\S]*?```|```/g,"").trim();
  const parsed=JSON.parse(clean);
  return parsed.map(e=>({...e,type:e.type==="income"?"income":"expense",amount:Math.abs(parseFloat(e.amount)||0),currency:(e.type==="expense"&&e.currency==="USD")?"SGD":e.currency||"SGD",account:e.account||"revolut_sgd",
    category:(()=>{if(!e.category)return"Miscellaneous";const raw=e.category.toLowerCase().trim();const steroidTerms=["steroid","mast","tren","testosterone","anavar","winstrol","deca","npp","bloodwork","blood test","labs","needles","pins","vials","ped"];if(steroidTerms.some(s=>raw.includes(s)))return"Gear";const exact=EXPENSE_CATS.find(c=>c.toLowerCase()===raw);if(exact)return exact;const partial=EXPENSE_CATS.find(c=>raw.includes(c.toLowerCase())||c.toLowerCase().includes(raw));if(partial)return partial;return"Miscellaneous";})(),
    date:(e.date&&/^\d{4}-\d{2}-\d{2}$/.test(e.date))?e.date:today}));
}
async function aiChat(userMsg,state,bp,chatHistory){
  const nw=netWorth(state.wallets,bp,state.rates);
  const thisM=new Date().toISOString().slice(0,7);
  const md=buildMonth(thisM,state.ledger,bp,state.rates);
  const btcTotal=totalBTC(state.wallets);
  const btcPnL=bp&&state.btcCostBasis?(bp-state.btcCostBasis)*btcTotal:0;
  const recentTx=state.ledger.slice(0,5).map(e=>`${e.date} [${e.type}] ${e.label||e.category} ${e.amount} ${e.currency}`).join("\n")||"none";
  const sys=`You are Jo's personal finance AI — sharp, direct, data-driven.
FINANCIAL FLOW: INCOME=crypto(BTC→metamask_btc/coinbase_btc, USDT→coinbase_usdt/metamask_usdt). EXPENSES=fiat(SGD→revolut_sgd, IDR→bca_idr). "$" in expenses=SGD. TRANSFERS=two entries.
ACCOUNTS: metamask_btc, coinbase_btc, coinbase_usdt, metamask_usdt, uob_sgd, revolut_sgd, bca_idr
EXPENSE CATEGORIES: Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Miscellaneous, Family, Debt Repayment
CATEGORY: steroids/PEDs/bloodwork=Gear. supplements/vitamins/protein=Personal. Never invent categories.
LIVE STATE:
- BTC: ${bp?cu(bp):"unknown"} | Basis: ${cu(state.btcCostBasis)} | PnL: ${cu(btcPnL)}
- Total BTC: ${cbt(btcTotal)} = ${bp?cu(btcTotal*bp):"?"}
- Net worth: ${cu(nw)} = ${csg(nw*state.rates.USDSGD)} = ${cid(nw*(state.rates.USDIDR||16200))}
- MetaMask BTC: ${cbt(state.wallets.metamask_btc)} | Coinbase BTC: ${cbt(state.wallets.coinbase_btc)}
- Coinbase USDT: ${cu(state.wallets.coinbase_usdt)} | MetaMask USDT: ${cu(state.wallets.metamask_usdt)}
- UOB: ${csg(state.wallets.uob_sgd)} | Revolut: ${csg(state.wallets.revolut_sgd)} | BCA: ${cid(state.wallets.bca_idr)}
- This month: ${cu(md.inc)} income | ${cu(md.cost)} costs | ${cp(md.margin)} margin
- FX: 1 USD = ${state.rates.USDSGD?.toFixed(4)} SGD = ${Math.round(state.rates.USDIDR||16200).toLocaleString()} IDR (live)
- Recent: ${recentTx}
If user describes income/expenses/transfers output at end:
<TRANSACTIONS>[{"type":"income|expense","category":"...","amount":0,"currency":"BTC|USDT|SGD|IDR","account":"...","label":"...","date":"YYYY-MM-DD"}]</TRANSACTIONS>
CRITICAL: date=YYYY-MM-DD never "today". Today=${new Date().toISOString().slice(0,10)}. account never null. "$" in expenses=SGD→revolut_sgd.
Be concise, data-driven, give real advice.`;
  return await callClaude([...chatHistory.slice(-8),{role:"user",content:userMsg}],sys);
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:      "#F7F8FA",
  white:   "#FFFFFF",
  border:  "#E5E7EB",
  borderS: "#D1D5DB",
  text:    "#0A0A0A",
  textS:   "#374151",
  textM:   "#6B7280",
  textD:   "#9CA3AF",
  green:   "#16A34A",
  red:     "#DC2626",
  blue:    "#1D4ED8",
  gold:    "#D97706",
  purple:  "#7C3AED",
  mono:    "'IBM Plex Mono', monospace",
  sans:    "'Inter', -apple-system, sans-serif",
};

// ── Components ────────────────────────────────────────────────────────────────
function Metric({label,value,sub,color=T.text,trend}){
  return(
    <div style={{padding:"20px 24px",borderRight:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,background:T.white}}>
      <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8,fontFamily:T.mono,fontWeight:500}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,color,lineHeight:1,letterSpacing:"-0.02em",fontFamily:T.sans}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:T.textD,marginTop:5,fontFamily:T.mono}}>{sub}</div>}
      {trend!==undefined&&<div style={{display:"inline-block",fontSize:11,color:trend>=0?T.green:T.red,marginTop:5,fontWeight:500,background:trend>=0?"#F0FDF4":"#FEF2F2",padding:"2px 6px",borderRadius:3}}>{trend>=0?"↑":"↓"} {Math.abs(trend).toFixed(1)}%</div>}
    </div>
  );
}
function Badge({children,color=T.green}){
  return<span style={{display:"inline-block",background:color+"15",color,border:`1px solid ${color}30`,borderRadius:3,padding:"2px 7px",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600,fontFamily:T.mono}}>{children}</span>;
}
function Card({children,style={}}){
  return<div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)",...style}}>{children}</div>;
}
function CardHeader({title,action}){
  return(
    <div style={{padding:"12px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
      <span style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>{title}</span>
      {action}
    </div>
  );
}
function Pill({label,value,color=T.textS}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"10px 20px",borderBottom:`1px solid #F9FAFB`}}>
      <span style={{fontSize:12,color:T.textM,fontFamily:T.mono}}>{label}</span>
      <span style={{fontSize:12,fontWeight:600,color,fontFamily:T.mono}}>{value}</span>
    </div>
  );
}
const CustomTooltip=({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:6,padding:"10px 14px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)"}}>
      <div style={{fontSize:11,color:T.textM,marginBottom:4,fontFamily:T.mono}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{fontSize:12,color:p.color,fontWeight:600,fontFamily:T.mono}}>{p.name}: {cu(p.value)}</div>)}
    </div>
  );
};
function Toast({msg,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return(
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:T.text,border:"1px solid #1F2937",borderRadius:6,padding:"10px 20px",fontSize:12,color:"#FFFFFF",fontFamily:T.mono,zIndex:9999,whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
      {msg}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({st,bp}){
  const{wallets:w,rates,ledger,orders,btcCostBasis}=st;
  const nw=netWorth(w,bp,rates);
  const btcTotal=totalBTC(w);
  const btcPnL=bp&&btcCostBasis?(bp-btcCostBasis)*btcTotal:0;
  const btcPnLPct=btcCostBasis?((bp||0)-btcCostBasis)/btcCostBasis*100:0;
  const thisM=new Date().toISOString().slice(0,7);
  const md=buildMonth(thisM,ledger,bp,rates);
  const allMonths=Array.from(new Set(ledger.map(e=>e.date?.slice(0,7)).filter(Boolean))).sort();
  const chartData=allMonths.slice(-6).map(ym=>{const m=buildMonth(ym,ledger,bp,rates);return{month:MONTHS_SHORT[parseInt(ym.split("-")[1])-1],income:Math.round(m.inc),costs:Math.round(m.cost),net:Math.round(m.net)};});
  const pieData=EXPENSE_CATS.map(c=>({name:c,value:md.cats[c]||0})).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,6);
  const PIE_COLORS=["#DC2626","#D97706","#16A34A","#1D4ED8","#7C3AED","#EC4899"];
  const openOrders=orders.filter(o=>!o.delivered);
  const orderProfitBTC=orders.reduce((s,o)=>s+(parseFloat(o.saleBTC||0)-parseFloat(o.costBTC||0)),0);
  return(
    <div style={{paddingBottom:32}}>
      {/* Hero */}
      <div style={{padding:"32px 28px 28px",background:T.white,borderBottom:`1px solid ${T.border}`,marginBottom:1}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:20}}>
          <div>
            <div style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",marginBottom:10,fontFamily:T.mono,fontWeight:500}}>Total Portfolio Value</div>
            <div style={{display:"flex",alignItems:"baseline",gap:16,flexWrap:"wrap"}}>
              <div style={{fontSize:44,fontWeight:800,letterSpacing:"-0.03em",color:T.text,lineHeight:1,fontFamily:T.sans}}>{bp?cu(nw):"—"}</div>
              {bp&&btcPnL!==0&&<div style={{fontSize:13,color:btcPnL>=0?T.green:T.red,fontFamily:T.mono,fontWeight:500,padding:"3px 8px",background:btcPnL>=0?"#F0FDF4":"#FEF2F2",borderRadius:4}}>{btcPnL>=0?"▲":"▼"} {cu(Math.abs(btcPnL))} ({btcPnLPct.toFixed(1)}%)</div>}
            </div>
            <div style={{display:"flex",gap:20,marginTop:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{cbt(btcTotal)} @ {bp?cu(bp):"—"}/BTC</span>
              {bp&&<span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{csg(nw*rates.USDSGD)} SGD</span>}
              {bp&&<span style={{fontSize:11,color:T.gold,fontFamily:T.mono,fontWeight:500}}>{cid(nw*(rates.USDIDR||16200))}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:28}}>
            {[{label:"Income",val:cu(md.inc),color:T.green},{label:"Expenses",val:cu(md.cost),color:T.red},{label:"Margin",val:cp(md.margin),color:md.margin>0.5?T.green:T.gold}].map(m=>(
              <div key={m.label} style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:T.textD,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:4,fontFamily:T.mono}}>{m.label}</div>
                <div style={{fontSize:18,fontWeight:700,color:m.color,fontFamily:T.sans}}>{m.val}</div>
                <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>this month</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:0,borderBottom:`1px solid ${T.border}`}}>
        <Metric label="BTC Holdings" value={cbt(btcTotal)} color={T.gold} sub={bp?cu(btcTotal*bp):undefined}/>
        <Metric label="Net (mo)" value={cu(md.net)} color={md.net>=0?T.green:T.red}/>
        <Metric label="Open Orders" value={openOrders.length} color={T.blue}/>
        <Metric label="Order Profit" value={cbt(orderProfitBTC)} color={T.purple} sub={bp?cu(orderProfitBTC*bp):undefined}/>
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,padding:"16px 16px 0"}}>
        <Card>
          <CardHeader title="Monthly P&L"/>
          {chartData.length===0
            ?<div style={{padding:"40px 20px",textAlign:"center",color:T.textD,fontSize:13,fontFamily:T.mono}}>No data yet — log income to see charts.</div>
            :<div style={{padding:"12px 0 8px"}}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barGap={3}>
                  <XAxis dataKey="month" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                  <YAxis hide/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="income" fill="#16A34A18" stroke={T.green} strokeWidth={1.5} radius={[3,3,0,0]} name="Income"/>
                  <Bar dataKey="costs"  fill="#DC262618" stroke={T.red}   strokeWidth={1.5} radius={[3,3,0,0]} name="Costs"/>
                  <Bar dataKey="net"    fill="#1D4ED818" stroke={T.blue}  strokeWidth={1.5} radius={[3,3,0,0]} name="Net"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          }
        </Card>
        <Card>
          <CardHeader title="Expense Breakdown"/>
          {pieData.length===0
            ?<div style={{padding:"40px 20px",textAlign:"center",color:T.textD,fontSize:13,fontFamily:T.mono}}>No expenses logged yet.</div>
            :<>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {pieData.map((e,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={v=>cu(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{padding:"0 16px 12px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                {pieData.slice(0,4).map((d,i)=>(
                  <div key={d.name} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:T.textS}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:PIE_COLORS[i],flexShrink:0}}/>
                    <span style={{fontFamily:T.mono}}>{d.name} {cu(d.value,0)}</span>
                  </div>
                ))}
              </div>
            </>
          }
        </Card>
      </div>

      {/* Accounts + Open Orders */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,padding:"12px 16px 0"}}>
        <Card>
          <CardHeader title="Accounts"/>
          <Pill label="MetaMask BTC"   value={cbt(w.metamask_btc)}   color={T.gold}/>
          <Pill label="Coinbase BTC"   value={cbt(w.coinbase_btc)}   color={T.gold}/>
          <Pill label="Coinbase USDT"  value={cu(w.coinbase_usdt)}   color={T.green}/>
          <Pill label="MetaMask USDT"  value={cu(w.metamask_usdt)}   color={T.green}/>
          <Pill label="UOB SGD"        value={csg(w.uob_sgd)}        color={T.blue}/>
          <Pill label="Revolut SGD"    value={csg(w.revolut_sgd)}    color={T.blue}/>
          <Pill label="BCA IDR"        value={cid(w.bca_idr)}        color={T.purple}/>
          {bp&&<Pill label="Total (USD)" value={cu(nw)} color={T.text}/>}
        </Card>
        <Card>
          <CardHeader title="Open Orders"/>
          {openOrders.length===0&&<div style={{padding:"24px 20px",color:T.textD,fontSize:13,fontFamily:T.mono}}>No open orders.</div>}
          {openOrders.slice(0,4).map(o=>{
            const profitBTC=parseFloat(o.saleBTC||0)-parseFloat(o.costBTC||0);
            return(
              <div key={o.id} style={{padding:"12px 20px",borderBottom:`1px solid #F9FAFB`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:13,color:T.textS,fontWeight:500,marginBottom:2}}>{o.client}</div>
                    <div style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{o.vendor} · {o.date}</div>
                    {o.items&&<div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginTop:2}}>{o.items}</div>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                    <div style={{fontSize:12,color:T.green,fontWeight:700,fontFamily:T.mono}}>{cbt(profitBTC)}</div>
                    {bp&&<div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>{cu(profitBTC*bp)}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ── Ledger ────────────────────────────────────────────────────────────────────
function Ledger({st,bp,onDelete}){
  const[typeF,setTypeF]=useState("all");
  const[catF,setCatF]=useState("all");
  const[monthF,setMonthF]=useState("all");
  const{ledger,rates}=st;
  const months=Array.from(new Set(ledger.map(e=>e.date?.slice(0,7)).filter(Boolean))).sort().reverse();
  const filtered=ledger.filter(e=>{const tOk=typeF==="all"||e.type===typeF;const cOk=catF==="all"||e.category===catF;const mOk=monthF==="all"||e.date?.startsWith(monthF);return tOk&&cOk&&mOk;});
  const sel={background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:4,padding:"6px 10px",fontSize:11,fontFamily:T.mono,outline:"none",cursor:"pointer"};
  const th={textAlign:"left",padding:"10px 16px",color:T.textM,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"};
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={sel}>
          <option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option>
        </select>
        <select value={catF} onChange={e=>setCatF(e.target.value)} style={sel}>
          <option value="all">All categories</option>{EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={monthF} onChange={e=>setMonthF(e.target.value)} style={sel}>
          <option value="all">All months</option>
          {months.map(m=><option key={m} value={m}>{MONTHS_SHORT[parseInt(m.split("-")[1])-1]} {m.split("-")[0]}</option>)}
        </select>
        <span style={{fontSize:11,color:T.textD,fontFamily:T.mono,alignSelf:"center"}}>{filtered.length} entries</span>
      </div>
      {filtered.length===0?(
        <Card style={{padding:"48px 24px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:10,color:T.textD}}>≡</div>
          <div style={{color:T.textD,fontSize:13,fontFamily:T.mono}}>No entries yet. Use AI Chat to log transactions.</div>
        </Card>
      ):(
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono,minWidth:600}}>
              <thead><tr>{["Date","Description","Category","Amount","≈ USD / IDR","Account","Type",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(e=>{
                  const usd=toUSD(e.amount,e.currency,rates,bp);
                  const idr=usd*(rates.USDIDR||16200);
                  return(
                    <tr key={e.id} style={{borderBottom:`1px solid #F9FAFB`}}>
                      <td style={{padding:"10px 16px",color:T.textD}}>{e.date}</td>
                      <td style={{padding:"10px 16px",color:T.textS,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.label||"—"}</td>
                      <td style={{padding:"10px 16px",color:T.textM}}>{e.category||"—"}</td>
                      <td style={{padding:"10px 16px",color:e.type==="income"?T.green:T.red,fontWeight:700}}>{e.type==="income"?"+":"-"}{e.amount} {e.currency}</td>
                      <td style={{padding:"10px 16px",color:T.textM}}>
                        <div>{cu(usd)}</div>
                        {e.type==="expense"&&<div style={{fontSize:10,color:T.gold}}>{cid(idr)}</div>}
                      </td>
                      <td style={{padding:"10px 16px",color:T.textD,fontSize:11}}>{e.account||"—"}</td>
                      <td style={{padding:"10px 16px"}}><Badge color={e.type==="income"?T.green:T.red}>{e.type}</Badge></td>
                      <td style={{padding:"10px 16px"}}><button onClick={()=>onDelete(e.id)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:14,lineHeight:1}}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarView({st,bp}){
  const[year,setYear]=useState(2026);
  const{ledger,rates}=st;
  const thisM=new Date().toISOString().slice(0,7);
  const yearData=MONTH_KEYS.map((mk,i)=>{const ym=`${year}-${mk}`;const md=buildMonth(ym,ledger,bp,rates);return{...md,month:MONTHS_SHORT[i],ym,hasData:md.inc>0||md.cost>0};});
  const totals=yearData.reduce((acc,m)=>({inc:acc.inc+m.inc,cost:acc.cost+m.cost}),{inc:0,cost:0});
  const th={textAlign:"right",padding:"9px 12px",color:T.textM,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC",whiteSpace:"nowrap"};
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Annual Earnings Calendar</span>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>setYear(y=>y-1)} style={{background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:13}}>‹</button>
          <span style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:T.sans,padding:"0 8px"}}>{year}</span>
          <button onClick={()=>setYear(y=>y+1)} style={{background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:13}}>›</button>
        </div>
      </div>
      <Card style={{marginBottom:16,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono,minWidth:600}}>
          <thead><tr>
            <th style={{...th,textAlign:"left",padding:"9px 16px"}}>Month</th>
            {["Earnings","Costs","Net","Margin","SGD Net","IDR Net"].map(h=><th key={h} style={th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {yearData.map(m=>{
              const isCur=m.ym===thisM;
              return(
                <tr key={m.ym} style={{borderBottom:`1px solid #F9FAFB`,background:isCur?"#F0F9FF":"transparent",opacity:m.hasData?1:0.25}}>
                  <td style={{padding:"10px 16px",color:isCur?T.blue:T.textS,fontWeight:isCur?700:400,borderLeft:isCur?`3px solid ${T.blue}`:"none"}}>{m.month}{isCur?" ●":""}</td>
                  <td style={{padding:"10px 12px",color:T.green,textAlign:"right",fontWeight:600}}>{m.hasData?cu(m.inc):"—"}</td>
                  <td style={{padding:"10px 12px",color:T.red,textAlign:"right"}}>{m.cost>0?cu(m.cost):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.net>=0?T.green:T.red,textAlign:"right",fontWeight:600}}>{m.hasData?cu(m.net):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.margin>0.5?T.green:T.textM,textAlign:"right"}}>{m.hasData?cp(m.margin):"—"}</td>
                  <td style={{padding:"10px 12px",color:T.textM,textAlign:"right"}}>{m.hasData?csg(m.net*rates.USDSGD):"—"}</td>
                  <td style={{padding:"10px 12px",color:T.gold,textAlign:"right",fontSize:11}}>{m.hasData?cid(m.net*(rates.USDIDR||16200)):"—"}</td>
                </tr>
              );
            })}
            <tr style={{borderTop:`2px solid ${T.border}`,background:"#FAFBFC"}}>
              <td style={{padding:"11px 16px",fontWeight:700,color:T.text}}>TOTAL {year}</td>
              <td style={{padding:"11px 12px",color:T.green,textAlign:"right",fontWeight:700}}>{cu(totals.inc)}</td>
              <td style={{padding:"11px 12px",color:T.red,textAlign:"right",fontWeight:700}}>{cu(totals.cost)}</td>
              <td style={{padding:"11px 12px",color:totals.inc-totals.cost>=0?T.green:T.red,textAlign:"right",fontWeight:700}}>{cu(totals.inc-totals.cost)}</td>
              <td style={{padding:"11px 12px",color:T.green,textAlign:"right",fontWeight:700}}>{cp(totals.inc>0?(totals.inc-totals.cost)/totals.inc:0)}</td>
              <td style={{padding:"11px 12px",color:T.textM,textAlign:"right"}}>{csg((totals.inc-totals.cost)*rates.USDSGD)}</td>
              <td style={{padding:"11px 12px",color:T.gold,textAlign:"right",fontSize:11}}>{cid((totals.inc-totals.cost)*(rates.USDIDR||16200))}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card style={{overflowX:"auto"}}>
        <CardHeader title={`Expense Categories · ${year}`}/>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:T.mono,minWidth:800}}>
            <thead><tr style={{borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"}}>
              <th style={{textAlign:"left",padding:"8px 16px",color:T.textM,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,width:130}}>Category</th>
              {MONTHS_SHORT.map(m=><th key={m} style={{textAlign:"right",padding:"8px 5px",color:T.textM,fontSize:10,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500,minWidth:50}}>{m}</th>)}
              <th style={{textAlign:"right",padding:"8px 16px",color:T.textM,fontSize:10,fontWeight:600}}>Total</th>
            </tr></thead>
            <tbody>
              {EXPENSE_CATS.map(cat=>{
                const vals=MONTH_KEYS.map(mk=>buildMonth(`${year}-${mk}`,ledger,bp,rates).cats[cat]||0);
                const total=vals.reduce((a,b)=>a+b,0);
                return(
                  <tr key={cat} style={{borderBottom:`1px solid #F9FAFB`}}>
                    <td style={{padding:"8px 16px",color:T.textS}}>{cat}</td>
                    {vals.map((v,i)=>(
                      <td key={i} style={{padding:"8px 5px",textAlign:"right",color:v>0?T.red:T.border}}>
                        {v>0?<div><div>{cu(v,0)}</div><div style={{fontSize:9,color:T.gold}}>{cid(v*(rates.USDIDR||16200))}</div></div>:"—"}
                      </td>
                    ))}
                    <td style={{padding:"8px 16px",textAlign:"right"}}>
                      {total>0?<div><div style={{color:T.red,fontWeight:700}}>{cu(total)}</div><div style={{fontSize:9,color:T.gold}}>{cid(total*(rates.USDIDR||16200))}</div></div>:"—"}
                    </td>
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

// ── Orders ────────────────────────────────────────────────────────────────────
function Orders({st,bp,onUpdateOrder,onAddOrder,onDeleteOrder}){
  const{orders}=st;
  const[showForm,setShowForm]=useState(false);
  const[vendors,setVendors]=useState(["Violet","Fiona","Zhongshui"]);
  const[newVendor,setNewVendor]=useState("");
  const[showVendorInput,setShowVendorInput]=useState(false);
  const[form,setForm]=useState({vendor:"Violet",client:"",saleBTC:"",costBTC:"",items:"",date:new Date().toISOString().slice(0,10)});
  function orderStats(o){const costBTC=parseFloat(o.costBTC||o.cost||0);const saleBTC=parseFloat(o.saleBTC||o.salePrice||0);const profitBTC=saleBTC-costBTC;return{costBTC,saleBTC,profitBTC,profitUSD:profitBTC*(bp||0),margin:saleBTC>0?profitBTC/saleBTC:0};}
  const totals=orders.reduce((acc,o)=>{const s=orderStats(o);return{costBTC:acc.costBTC+s.costBTC,saleBTC:acc.saleBTC+s.saleBTC,profitBTC:acc.profitBTC+s.profitBTC,profitUSD:acc.profitUSD+s.profitUSD};},{costBTC:0,saleBTC:0,profitBTC:0,profitUSD:0});
  const avgMargin=totals.saleBTC>0?totals.profitBTC/totals.saleBTC:0;
  const pending=orders.filter(o=>!o.delivered).length;
  const done=orders.filter(o=>o.delivered).length;
  function submitOrder(){if(!form.client||!form.saleBTC)return;const o={id:"ORD-"+Date.now(),vendor:form.vendor,client:form.client,saleBTC:parseFloat(form.saleBTC)||0,costBTC:parseFloat(form.costBTC)||0,cost:parseFloat(form.costBTC)||0,salePrice:parseFloat(form.saleBTC)||0,btcAmount:parseFloat(form.saleBTC)||0,items:form.items,date:form.date,delivered:false,status:"pending",deliveryDays:null};onAddOrder(o);setShowForm(false);setForm({vendor:vendors[0]||"Violet",client:"",saleBTC:"",costBTC:"",items:"",date:new Date().toISOString().slice(0,10)});}
  const cbt6=n=>Number(n||0).toFixed(6)+" ₿";const cbt4=n=>Number(n||0).toFixed(4)+" ₿";
  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"8px 10px",fontSize:12,fontFamily:T.mono,outline:"none",width:"100%"};
  const lbl={fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:5,display:"block",fontFamily:T.mono,fontWeight:500};
  const tdS={padding:"11px 14px",borderBottom:`1px solid #F9FAFB`,verticalAlign:"middle",fontFamily:T.mono,fontSize:12};
  const thS={textAlign:"left",padding:"10px 14px",color:T.textM,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"};
  const profitPreview=(parseFloat(form.saleBTC)||0)-(parseFloat(form.costBTC)||0);
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:0,marginBottom:16,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <Metric label="Revenue" value={cbt4(totals.saleBTC)} color={T.green} sub={bp?cu(totals.saleBTC*bp):"—"}/>
        <Metric label="Cost" value={cbt4(totals.costBTC)} color={T.red} sub={bp?cu(totals.costBTC*bp):"—"}/>
        <Metric label="Profit" value={cbt4(totals.profitBTC)} color={T.blue} sub={bp?cu(totals.profitUSD):"—"}/>
        <Metric label="Avg Margin" value={cp(avgMargin)} color={T.gold}/>
        <Metric label="Pending" value={pending} color={T.red} sub={`${done} delivered`}/>
        {bp&&<Metric label="Live Profit $" value={cu(totals.profitUSD)} color={T.purple} sub={`@ ${cu(bp)}`}/>}
      </div>

      {/* Vendor bar */}
      <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <span style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Vendors:</span>
        {vendors.map(v=>(
          <div key={v} style={{display:"flex",alignItems:"center",gap:4,background:"#F3F4F6",border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 10px"}}>
            <span style={{fontSize:11,color:T.textS,fontFamily:T.mono}}>{v}</span>
            <button onClick={()=>setVendors(vs=>vs.filter(x=>x!==v))} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:12,paddingLeft:4,lineHeight:1}}>×</button>
          </div>
        ))}
        {showVendorInput?(
          <div style={{display:"flex",gap:6}}>
            <input value={newVendor} onChange={e=>setNewVendor(e.target.value)} onKeyDown={e=>e.key==="Enter"&&newVendor.trim()&&(setVendors(v=>[...v,newVendor.trim()]),setNewVendor(""),setShowVendorInput(false))} placeholder="Vendor name" autoFocus style={{...inp,width:130,padding:"4px 8px"}}/>
            <button onClick={()=>newVendor.trim()&&(setVendors(v=>[...v,newVendor.trim()]),setNewVendor(""),setShowVendorInput(false))} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:T.mono}}>Add</button>
            <button onClick={()=>setShowVendorInput(false)} style={{background:"none",border:"none",color:T.textM,cursor:"pointer",fontSize:14}}>×</button>
          </div>
        ):(
          <button onClick={()=>setShowVendorInput(true)} style={{background:"#F3F4F6",border:`1px solid ${T.border}`,color:T.textM,borderRadius:4,padding:"3px 10px",fontSize:10,cursor:"pointer",fontFamily:T.mono}}>+ Add vendor</button>
        )}
      </div>

      {/* New order form */}
      {showForm&&(
        <Card style={{marginBottom:16,padding:"20px"}}>
          <div style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",marginBottom:16,fontFamily:T.mono,fontWeight:500}}>New Order</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label style={lbl}>Vendor</label><select value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} style={{...inp,cursor:"pointer"}}>{vendors.map(v=><option key={v}>{v}</option>)}</select></div>
            <div><label style={lbl}>Customer</label><input value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} placeholder="e.g. Brooks" style={inp}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
            <div>
              <label style={lbl}>Sale (BTC)</label>
              <input type="number" step="0.000001" value={form.saleBTC} onChange={e=>setForm(f=>({...f,saleBTC:e.target.value}))} placeholder="0.005800" style={inp}/>
              {form.saleBTC&&bp&&<div style={{fontSize:10,color:T.green,marginTop:3,fontFamily:T.mono}}>≈ {cu(parseFloat(form.saleBTC)*bp)}</div>}
            </div>
            <div>
              <label style={lbl}>Cost (BTC)</label>
              <input type="number" step="0.000001" value={form.costBTC} onChange={e=>setForm(f=>({...f,costBTC:e.target.value}))} placeholder="0.004200" style={inp}/>
              {form.costBTC&&bp&&<div style={{fontSize:10,color:T.red,marginTop:3,fontFamily:T.mono}}>≈ {cu(parseFloat(form.costBTC)*bp)}</div>}
            </div>
            <div>
              <label style={lbl}>Profit (auto)</label>
              <div style={{background:"#F9FAFB",border:`1px solid ${T.border}`,borderRadius:4,padding:"8px 10px",fontSize:12,fontFamily:T.mono,color:profitPreview>0?T.green:T.textD}}>{form.saleBTC||form.costBTC?cbt6(profitPreview):"—"}</div>
              {(form.saleBTC||form.costBTC)&&bp&&<div style={{fontSize:10,color:T.purple,marginTop:3,fontFamily:T.mono}}>≈ {cu(profitPreview*bp)}</div>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12,marginBottom:16}}>
            <div><label style={lbl}>Items</label><input value={form.items} onChange={e=>setForm(f=>({...f,items:e.target.value}))} placeholder="RT10, CU100*2, BA10*3..." style={inp}/></div>
            <div><label style={lbl}>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={submitOrder} disabled={!form.client||!form.saleBTC} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"9px 24px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Save Order</button>
            <button onClick={()=>setShowForm(false)} style={{background:T.white,color:T.textM,border:`1px solid ${T.borderS}`,borderRadius:5,padding:"9px 16px",fontSize:12,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
          </div>
        </Card>
      )}

      <Card>
        <div style={{padding:"13px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
          <span style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Order Book · {orders.length} · {pending} pending</span>
          <button onClick={()=>setShowForm(true)} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>+ New Order</button>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
            <thead><tr>
              {["Date","Vendor","Customer","Items","Sale ₿","Cost ₿","Profit ₿","Profit $","Margin","Delivered",""].map(h=>(
                <th key={h} style={{...thS,textAlign:["Sale ₿","Cost ₿","Profit ₿","Profit $","Margin"].includes(h)?"right":"left"}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {orders.length===0&&<tr><td colSpan={11} style={{...tdS,textAlign:"center",color:T.textD,padding:"48px"}}>No orders yet.</td></tr>}
              {orders.map(o=>{const s=orderStats(o);return(
                <tr key={o.id} style={{opacity:o.delivered?0.4:1,transition:"opacity 0.2s"}}>
                  <td style={{...tdS,color:T.textD}}>{o.date}</td>
                  <td style={{...tdS,color:T.textM}}>{o.vendor||"—"}</td>
                  <td style={{...tdS,color:T.textS,fontWeight:600}}>{o.client}</td>
                  <td style={{...tdS,color:T.textM,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={o.items||""}>{o.items||"—"}</td>
                  <td style={{...tdS,textAlign:"right",color:T.green,fontWeight:600}}>{cbt6(s.saleBTC)}</td>
                  <td style={{...tdS,textAlign:"right",color:T.red}}>{cbt6(s.costBTC)}</td>
                  <td style={{...tdS,textAlign:"right",color:T.blue,fontWeight:700}}>{cbt6(s.profitBTC)}</td>
                  <td style={{...tdS,textAlign:"right",color:bp?T.purple:T.textD,fontWeight:700}}>{bp?cu(s.profitUSD):"—"}</td>
                  <td style={{...tdS,textAlign:"right",color:s.margin>0.2?T.green:T.gold}}>{cp(s.margin)}</td>
                  <td style={{...tdS,textAlign:"center"}}><input type="checkbox" checked={!!o.delivered} onChange={()=>onUpdateOrder(o.id,{delivered:!o.delivered,status:!o.delivered?"delivered":"pending"})} style={{width:15,height:15,cursor:"pointer",accentColor:T.text}}/></td>
                  <td style={tdS}><button onClick={()=>onDeleteOrder&&onDeleteOrder(o.id)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:14}}>×</button></td>
                </tr>
              );})}
            </tbody>
            {orders.length>0&&<tfoot><tr style={{borderTop:`2px solid ${T.border}`,background:"#FAFBFC"}}>
              <td colSpan={4} style={{...tdS,color:T.textM,fontWeight:700,fontSize:11}}>TOTAL</td>
              <td style={{...tdS,textAlign:"right",color:T.green,fontWeight:700}}>{cbt6(totals.saleBTC)}</td>
              <td style={{...tdS,textAlign:"right",color:T.red,fontWeight:700}}>{cbt6(totals.costBTC)}</td>
              <td style={{...tdS,textAlign:"right",color:T.blue,fontWeight:700}}>{cbt6(totals.profitBTC)}</td>
              <td style={{...tdS,textAlign:"right",color:T.purple,fontWeight:700}}>{bp?cu(totals.profitUSD):"—"}</td>
              <td style={{...tdS,textAlign:"right",color:T.gold,fontWeight:700}}>{cp(avgMargin)}</td>
              <td style={tdS}/><td style={tdS}/>
            </tr></tfoot>}
          </table>
        </div>
      </Card>
      {bp&&totals.profitBTC>0&&(
        <div style={{marginTop:10,background:T.white,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <span style={{fontSize:10,color:T.textD,fontFamily:T.mono,letterSpacing:"0.1em",textTransform:"uppercase"}}>Profit @ live BTC</span>
          <div style={{display:"flex",gap:20,alignItems:"baseline"}}>
            <span style={{fontSize:11,color:T.textM,fontFamily:T.mono}}>{cbt6(totals.profitBTC)}</span>
            <span style={{fontSize:14,color:T.purple,fontWeight:700,fontFamily:T.mono}}>= {cu(totals.profitUSD)}</span>
            <span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>@ {cu(bp)}/BTC</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Analytics ─────────────────────────────────────────────────────────────────
function Analytics({st,bp}){
  const{ledger,rates}=st;
  const today=new Date();
  const[monthOffset,setMonthOffset]=useState(0);

  const targetDate=new Date(today.getFullYear(),today.getMonth()+monthOffset,1);
  const year=targetDate.getFullYear();
  const month=targetDate.getMonth();
  const monthStr=`${year}-${String(month+1).padStart(2,"0")}`;
  const monthLabel=`${MONTHS_SHORT[month]} ${year}`;

  // Split month into 4 weeks
  function getWeeks(){
    const weeks=[];
    const daysInMonth=new Date(year,month+1,0).getDate();
    const ranges=[
      {label:"Week 1",start:1,end:7},
      {label:"Week 2",start:8,end:14},
      {label:"Week 3",start:15,end:21},
      {label:"Week 4",start:22,end:daysInMonth},
    ];
    ranges.forEach(r=>{
      const startStr=`${year}-${String(month+1).padStart(2,"0")}-${String(r.start).padStart(2,"0")}`;
      const endStr=`${year}-${String(month+1).padStart(2,"0")}-${String(r.end).padStart(2,"0")}`;
      const entries=ledger.filter(e=>e.date&&e.date>=startStr&&e.date<=endStr&&e.type==="expense");
      const cats={};
      EXPENSE_CATS.forEach(c=>{
        cats[c]=entries.filter(e=>e.category===c).reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
      });
      const total=entries.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
      weeks.push({...r,cats,total,entries});
    });
    return weeks;
  }

  const weeks=getWeeks();
  const monthTotal=weeks.reduce((s,w)=>s+w.total,0);
  const monthIncome=ledger.filter(e=>e.date?.startsWith(monthStr)&&e.type==="income").reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);

  // Chart data — one bar group per week, each bar is total spend
  const chartData=weeks.map(w=>({
    week:w.label,
    total:Math.round(w.total),
    ...Object.fromEntries(EXPENSE_CATS.map(c=>[c,Math.round(w.cats[c]||0)])),
  }));

  const COLORS={"Dad":"#DC2626","Mom":"#EA580C","Sam":"#D97706","Glenn":"#65A30D","Personal":"#0891B2","Dating":"#7C3AED","Gas":"#6B7280","Gear":"#1D4ED8","Miscellaneous":"#9CA3AF","Family":"#16A34A","Debt Repayment":"#111827"};

  // Top categories across the month
  const topCats=EXPENSE_CATS.map(c=>({
    name:c,
    total:weeks.reduce((s,w)=>s+(w.cats[c]||0),0),
    byWeek:weeks.map(w=>w.cats[c]||0),
  })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  const th={textAlign:"left",padding:"10px 16px",color:T.textM,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"};
  const td={padding:"10px 16px",borderBottom:`1px solid #F9FAFB`,fontFamily:T.mono,fontSize:12};

  return(
    <div style={{padding:"20px 16px"}}>
      {/* Month navigator */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Monthly Spending · 4 Weeks</span>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>setMonthOffset(m=>m-1)} style={{background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:13}}>‹</button>
          <span style={{fontSize:12,fontWeight:600,color:T.text,fontFamily:T.sans,padding:"0 8px"}}>{monthLabel}</span>
          <button onClick={()=>setMonthOffset(m=>Math.min(0,m+1))} style={{background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:4,padding:"4px 10px",cursor:"pointer",fontSize:13}}>›</button>
        </div>
      </div>

      {/* Summary metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:0,marginBottom:16,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <Metric label="Total Spend" value={cu(monthTotal)} color={T.red} sub={cid(monthTotal*(rates.USDIDR||16200))}/>
        <Metric label="Total Income" value={cu(monthIncome)} color={T.green}/>
        <Metric label="Net" value={cu(monthIncome-monthTotal)} color={monthIncome-monthTotal>=0?T.green:T.red}/>
        <Metric label="Margin" value={monthIncome>0?cp((monthIncome-monthTotal)/monthIncome):"—"} color={T.gold}/>
      </div>

      {/* Weekly spend chart */}
      <Card style={{marginBottom:16}}>
        <CardHeader title="Spend per Week"/>
        <div style={{padding:"12px 0 8px"}}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="week" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.textD,fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
              <Tooltip content={<CustomTooltip/>}/>
              {topCats.slice(0,6).map((c,i)=>(
                <Bar key={c.name} dataKey={c.name} stackId="a" fill={COLORS[c.name]||T.textD} name={c.name} radius={i===topCats.slice(0,6).length-1?[3,3,0,0]:[0,0,0,0]}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div style={{padding:"0 20px 14px",display:"flex",flexWrap:"wrap",gap:10}}>
          {topCats.slice(0,6).map(c=>(
            <div key={c.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textS}}>
              <div style={{width:8,height:8,borderRadius:2,background:COLORS[c.name]||T.textD,flexShrink:0}}/>
              <span style={{fontFamily:T.mono}}>{c.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Category breakdown table — week by week */}
      <Card>
        <CardHeader title="Category Breakdown by Week"/>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono,minWidth:500}}>
            <thead><tr>
              <th style={{...th,width:140}}>Category</th>
              {weeks.map(w=><th key={w.label} style={{...th,textAlign:"right"}}>{w.label}<div style={{fontSize:9,color:T.textD,fontWeight:400}}>({w.label==="Week 1"?"1-7":w.label==="Week 2"?"8-14":w.label==="Week 3"?"15-21":`22-${new Date(year,month+1,0).getDate()}`})</div></th>)}
              <th style={{...th,textAlign:"right"}}>Total</th>
            </tr></thead>
            <tbody>
              {topCats.map((c,i)=>(
                <tr key={c.name}>
                  <td style={{...td,display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:8,height:8,borderRadius:2,background:COLORS[c.name]||T.textD,flexShrink:0}}/>
                    <span style={{color:T.textS}}>{c.name}</span>
                  </td>
                  {c.byWeek.map((v,wi)=>(
                    <td key={wi} style={{...td,textAlign:"right",color:v>0?T.red:T.textD}}>
                      {v>0?<div><div>{cu(v)}</div><div style={{fontSize:9,color:T.gold}}>{cid(v*(rates.USDIDR||16200))}</div></div>:"—"}
                    </td>
                  ))}
                  <td style={{...td,textAlign:"right",color:T.red,fontWeight:700}}>
                    <div>{cu(c.total)}</div>
                    <div style={{fontSize:9,color:T.gold}}>{cid(c.total*(rates.USDIDR||16200))}</div>
                  </td>
                </tr>
              ))}
              <tr style={{borderTop:`2px solid ${T.border}`,background:"#FAFBFC"}}>
                <td style={{...td,fontWeight:700,color:T.text}}>Total</td>
                {weeks.map((w,i)=>(
                  <td key={i} style={{...td,textAlign:"right",color:T.red,fontWeight:700}}>
                    <div>{cu(w.total)}</div>
                    <div style={{fontSize:9,color:T.gold}}>{cid(w.total*(rates.USDIDR||16200))}</div>
                  </td>
                ))}
                <td style={{...td,textAlign:"right",color:T.red,fontWeight:700}}>
                  <div>{cu(monthTotal)}</div>
                  <div style={{fontSize:9,color:T.gold}}>{cid(monthTotal*(rates.USDIDR||16200))}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Transfer Form ─────────────────────────────────────────────────────────────
function TransferForm({wallets,rates,bp,onTransfer,showToast}){
  const[form,setForm]=useState({from:"metamask_btc",to:"coinbase_btc",amount:"",date:new Date().toISOString().slice(0,10)});
  const ACCOUNTS=[
    {key:"metamask_btc",  label:"MetaMask BTC",  currency:"BTC",  fmt:n=>Number(n||0).toFixed(6)+" ₿"},
    {key:"coinbase_btc",  label:"Coinbase BTC",  currency:"BTC",  fmt:n=>Number(n||0).toFixed(6)+" ₿"},
    {key:"metamask_usdt", label:"MetaMask USDT", currency:"USDT", fmt:n=>"$"+Number(n||0).toFixed(2)},
    {key:"coinbase_usdt", label:"Coinbase USDT", currency:"USDT", fmt:n=>"$"+Number(n||0).toFixed(2)},
    {key:"uob_sgd",       label:"UOB (SGD)",     currency:"SGD",  fmt:n=>"S$"+Number(n||0).toFixed(2)},
    {key:"revolut_sgd",   label:"Revolut (SGD)", currency:"SGD",  fmt:n=>"S$"+Number(n||0).toFixed(2)},
    {key:"bca_idr",       label:"BCA (IDR)",     currency:"IDR",  fmt:n=>"Rp "+Math.round(n||0).toLocaleString("id-ID")},
  ];
  const QUICK=[
    {from:"metamask_btc", to:"coinbase_btc",  label:"MetaMask → Coinbase BTC"},
    {from:"coinbase_usdt",to:"uob_sgd",       label:"USDT → UOB"},
    {from:"uob_sgd",      to:"revolut_sgd",   label:"UOB → Revolut"},
    {from:"revolut_sgd",  to:"bca_idr",       label:"Revolut → BCA"},
    {from:"coinbase_btc", to:"metamask_btc",  label:"Coinbase → MetaMask BTC"},
  ];
  const fromAcc=ACCOUNTS.find(a=>a.key===form.from);
  const toAcc=ACCOUNTS.find(a=>a.key===form.to);
  const amt=parseFloat(form.amount)||0;
  const bal=wallets[form.from]||0;
  const insufficient=amt>0&&amt>bal;
  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"8px 10px",fontSize:12,fontFamily:T.mono,outline:"none",width:"100%"};
  const lbl={fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:5,display:"block",fontFamily:T.mono,fontWeight:500};
  async function submit(){
    if(!amt||amt<=0||form.from===form.to||insufficient)return;
    const entries=[
      {type:"expense",category:"Miscellaneous",amount:amt,currency:fromAcc.currency,account:form.from,label:`Transfer → ${toAcc.label}`,date:form.date},
      {type:"income", category:"Miscellaneous",amount:amt,currency:toAcc.currency, account:form.to,  label:`Transfer ← ${fromAcc.label}`,date:form.date},
    ];
    await onTransfer(entries);
    setForm(f=>({...f,amount:""}));
    showToast(`✓ ${fromAcc.label} → ${toAcc.label}`);
  }
  return(
    <div style={{padding:"14px 20px"}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {QUICK.map(q=>(
          <button key={q.label} onClick={()=>setForm(f=>({...f,from:q.from,to:q.to}))}
            style={{background:form.from===q.from&&form.to===q.to?T.text:T.white,border:`1px solid ${form.from===q.from&&form.to===q.to?T.text:T.border}`,color:form.from===q.from&&form.to===q.to?"#fff":T.textM,borderRadius:4,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:T.mono,fontWeight:form.from===q.from&&form.to===q.to?500:400}}>
            {q.label}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"end",marginBottom:12}}>
        <div><label style={lbl}>From</label>
          <select value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))} style={{...inp,cursor:"pointer"}}>
            {ACCOUNTS.map(a=><option key={a.key} value={a.key}>{a.label} — {a.fmt(wallets[a.key])}</option>)}
          </select>
        </div>
        <div style={{fontSize:16,color:T.textD,paddingBottom:8,textAlign:"center"}}>→</div>
        <div><label style={lbl}>To</label>
          <select value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))} style={{...inp,cursor:"pointer"}}>
            {ACCOUNTS.filter(a=>a.key!==form.from).map(a=><option key={a.key} value={a.key}>{a.label} — {a.fmt(wallets[a.key])}</option>)}
          </select>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <label style={lbl}>Amount ({fromAcc?.currency})</label>
          <input type="number" step="any" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder={fromAcc?.currency==="BTC"?"0.005000":"100.00"} style={{...inp,borderColor:insufficient?"#DC2626":T.borderS}}/>
          {insufficient&&<div style={{fontSize:10,color:T.red,marginTop:3,fontFamily:T.mono}}>Insufficient — {fromAcc?.fmt(bal)}</div>}
          {!insufficient&&amt>0&&<div style={{fontSize:10,color:T.textD,marginTop:3,fontFamily:T.mono}}>Available: {fromAcc?.fmt(bal)}</div>}
          {amt>0&&bp&&fromAcc?.currency==="BTC"&&<div style={{fontSize:10,color:T.gold,marginTop:2,fontFamily:T.mono}}>≈ {cu(amt*bp)}</div>}
        </div>
        <div><label style={lbl}>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
      </div>
      <button onClick={submit} disabled={!amt||amt<=0||form.from===form.to||insufficient}
        style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"9px 24px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>
        Transfer →
      </button>
      {form.from!==form.to&&amt>0&&!insufficient&&<div style={{marginTop:10,fontSize:11,color:T.textD,fontFamily:T.mono}}>{fromAcc?.fmt(amt)} · {fromAcc?.label} → {toAcc?.label}</div>}
    </div>
  );
}

// ── Wallets ───────────────────────────────────────────────────────────────────
function Wallets({st,bp,onUpdate,onTransfer,showToast}){
  const{wallets:w,rates,btcCostBasis}=st;
  const nw=netWorth(w,bp,rates);
  const btcTotal=totalBTC(w);
  const btcPnL=bp&&btcCostBasis?(bp-btcCostBasis)*btcTotal:0;
  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"7px 10px",fontSize:12,width:150,textAlign:"right",fontFamily:T.mono,outline:"none"};
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:0,marginBottom:16,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <Metric label="Net Worth" value={bp?cu(nw):"—"} color={T.text} sub={bp?csg(nw*rates.USDSGD)+" SGD":undefined}/>
        <Metric label="BTC Holdings" value={cbt(btcTotal)} color={T.gold} sub={bp?cu(btcTotal*bp):undefined}/>
        <Metric label="BTC P&L" value={bp?cu(btcPnL):"—"} color={btcPnL>=0?T.green:T.red} sub={btcCostBasis?`basis ${cu(btcCostBasis)}/BTC`:undefined}/>
        <Metric label="Net Worth IDR" value={bp?cid(nw*(rates.USDIDR||16200)):"—"} color={T.gold}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <Card>
          <CardHeader title="Crypto Wallets"/>
          {[{key:"coinbase_btc",label:"Coinbase BTC",step:"0.000001",type:"BTC"},{key:"metamask_btc",label:"MetaMask BTC",step:"0.000001",type:"BTC"},{key:"coinbase_usdt",label:"Coinbase USDT",step:"0.01",type:"USDT"},{key:"metamask_usdt",label:"MetaMask USDT",step:"0.01",type:"USDT"}].map(a=>(
            <div key={a.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 20px",borderBottom:`1px solid #F9FAFB`}}>
              <div>
                <div style={{fontSize:12,color:T.textS,fontFamily:T.mono}}>{a.label}</div>
                {a.type==="BTC"&&bp&&<div style={{fontSize:10,color:T.textD,marginTop:2,fontFamily:T.mono}}>≈ {cu((w[a.key]||0)*bp)}</div>}
              </div>
              <input type="number" step={a.step} value={w[a.key]||0} onChange={e=>onUpdate("wallets",{...w,[a.key]:parseFloat(e.target.value)||0})} style={inp}/>
            </div>
          ))}
        </Card>
        <Card>
          <CardHeader title="Bank Accounts"/>
          {[{key:"uob_sgd",label:"UOB (SGD)",step:"0.01",type:"SGD"},{key:"revolut_sgd",label:"Revolut (SGD)",step:"0.01",type:"SGD"},{key:"bca_idr",label:"BCA (IDR)",step:"1000",type:"IDR"}].map(a=>(
            <div key={a.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 20px",borderBottom:`1px solid #F9FAFB`}}>
              <div>
                <div style={{fontSize:12,color:T.textS,fontFamily:T.mono}}>{a.label}</div>
                <div style={{fontSize:10,color:T.textD,marginTop:2,fontFamily:T.mono}}>≈ {cu(toUSD(w[a.key],a.type,rates,bp))}</div>
              </div>
              <input type="number" step={a.step} value={w[a.key]||0} onChange={e=>onUpdate("wallets",{...w,[a.key]:parseFloat(e.target.value)||0})} style={inp}/>
            </div>
          ))}
        </Card>
      </div>
      <Card style={{marginBottom:16}}>
        <CardHeader title="Settings"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
          {[["USDSGD","USD/SGD (live)","0.0001"],["USDIDR","USD/IDR (live)","1"]].map(([k,l,step])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderRight:`1px solid ${T.border}`}}>
              <span style={{fontSize:12,color:T.textM,fontFamily:T.mono}}>{l}</span>
              <input type="number" step={step} value={rates[k]} onChange={e=>onUpdate("rates",{...rates,[k]:parseFloat(e.target.value)||rates[k]})} style={{...inp,width:110}}/>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px"}}>
            <span style={{fontSize:12,color:T.textM,fontFamily:T.mono}}>BTC Cost Basis</span>
            <input type="number" step="1" value={st.btcCostBasis||0} onChange={e=>onUpdate("btcCostBasis",parseFloat(e.target.value)||0)} style={{...inp,width:120}}/>
          </div>
        </div>
      </Card>
      <Card style={{marginBottom:16}}>
        <CardHeader title="Net Worth Breakdown"/>
        {[
          {label:"BTC (Coinbase + MetaMask)",val:btcTotal*(bp||0),display:cbt(btcTotal),color:T.gold},
          {label:"USDT (Coinbase + MetaMask)",val:totalUSDT(w),display:cu(totalUSDT(w)),color:T.green},
          {label:"SGD (UOB + Revolut)",val:((w.uob_sgd||0)+(w.revolut_sgd||0))/rates.USDSGD,display:csg((w.uob_sgd||0)+(w.revolut_sgd||0)),color:T.blue},
          {label:"IDR (BCA)",val:(w.bca_idr||0)/(rates.USDIDR||16200),display:cid(w.bca_idr),color:T.purple},
        ].map(r=>(
          <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 20px",borderBottom:`1px solid #F9FAFB`}}>
            <div>
              <div style={{fontSize:12,color:T.textS,fontFamily:T.mono}}>{r.label}</div>
              <div style={{fontSize:10,color:T.textD,marginTop:2,fontFamily:T.mono}}>{r.display}</div>
            </div>
            <div style={{fontSize:14,fontWeight:700,color:r.color,fontFamily:T.mono}}>{cu(r.val)}</div>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"14px 20px"}}>
          <span style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:T.sans}}>Total</span>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:18,fontWeight:800,color:T.text,fontFamily:T.sans}}>{cu(nw)}</div>
            <div style={{fontSize:10,color:T.textD,marginTop:3,fontFamily:T.mono}}>{csg(nw*rates.USDSGD)} · {cid(nw*(rates.USDIDR||16200))}</div>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Transfer Between Accounts"/>
        <TransferForm wallets={w} rates={rates} bp={bp} onTransfer={onTransfer} showToast={showToast}/>
      </Card>
    </div>
  );
}

// ── AI Chat ───────────────────────────────────────────────────────────────────
function AIChat({st,bp,onTransactions,onBTCFetch,btcLoading}){
  const[input,setInput]=useState("");
  const[msgs,setMsgs]=useState([{role:"assistant",content:"I'm your financial OS. Log transactions or ask anything.\n\nExamples:\n• \"made 0.004 BTC dropshipping today\"\n• \"spent $45 on dating\" (= SGD from Revolut)\n• \"add 300 USDT to metamask\"\n• \"500k IDR from BCA for gas\"\n• \"how's my net worth?\""}]);
  const[loading,setLoading]=useState(false);
  const[pendingTx,setPendingTx]=useState(null);
  const[chatHistory,setChatHistory]=useState([]);
  const scrollRef=useRef(null);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[msgs,loading]);

  async function send(){
    if(!input.trim()||loading)return;
    const userMsg=input.trim();setInput("");
    const newHistory=[...chatHistory,{role:"user",content:userMsg}];
    setMsgs(m=>[...m,{role:"user",content:userMsg}]);setLoading(true);
    try{
      const reply=await aiChat(userMsg,st,bp,newHistory);
      const txMatch=reply.match(/<TRANSACTIONS>([\s\S]*?)<\/TRANSACTIONS>/);
      let cleanReply=reply.replace(/<TRANSACTIONS>[\s\S]*?<\/TRANSACTIONS>/g,"").trim();
      if(txMatch){
        try{
          const today=new Date().toISOString().slice(0,10);
          let txs=JSON.parse(txMatch[1].trim());
          const steroidTerms=["steroid","mast","tren","testosterone","anavar","winstrol","deca","npp","bloodwork","blood test","labs","needles","pins","vials","ped"];
          txs=txs.map(t=>({...t,type:t.type==="income"?"income":"expense",amount:Math.abs(parseFloat(t.amount)||0),currency:(t.type==="expense"&&t.currency==="USD")?"SGD":t.currency||"SGD",account:t.account||"revolut_sgd",
            category:(()=>{if(!t.category)return"Miscellaneous";const raw=t.category.toLowerCase().trim();if(steroidTerms.some(s=>raw.includes(s)))return"Gear";const exact=EXPENSE_CATS.find(c=>c.toLowerCase()===raw);if(exact)return exact;const partial=EXPENSE_CATS.find(c=>raw.includes(c.toLowerCase())||c.toLowerCase().includes(raw));if(partial)return partial;return"Miscellaneous";})(),
            date:(t.date&&/^\d{4}-\d{2}-\d{2}$/.test(t.date))?t.date:today}));
          setPendingTx(txs);cleanReply+="\n\n*Transactions parsed — confirm to save.*";
        }catch{}
      }
      setMsgs(m=>[...m,{role:"assistant",content:cleanReply}]);
      setChatHistory([...newHistory,{role:"assistant",content:cleanReply}]);
    }catch(e){setMsgs(m=>[...m,{role:"assistant",content:"Error: "+e.message}]);}
    setLoading(false);
  }

  async function quickLog(){
    if(!input.trim()||loading)return;
    const txt=input.trim();setInput("");
    setMsgs(m=>[...m,{role:"user",content:txt},{role:"assistant",content:"Parsing..."}]);setLoading(true);
    try{const txs=await parseTransaction(txt,st.rates,bp);setPendingTx(txs);setMsgs(m=>[...m.slice(0,-1),{role:"assistant",content:`Parsed ${txs.length} transaction(s) — confirm to save.`}]);}
    catch(e){setMsgs(m=>[...m.slice(0,-1),{role:"assistant",content:"Parse error: "+e.message}]);}
    setLoading(false);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 120px)",padding:"0 16px 16px"}}>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",paddingTop:16,paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:12}}>
            {m.role==="assistant"&&<div style={{width:24,height:24,borderRadius:"50%",background:T.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,marginRight:8,flexShrink:0,marginTop:2,color:"#fff",fontFamily:T.sans,fontWeight:700}}>AI</div>}
            <div style={{maxWidth:"76%",background:m.role==="user"?T.text:T.white,border:`1px solid ${m.role==="user"?T.text:T.border}`,borderRadius:m.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px",padding:"11px 15px",fontSize:13,color:m.role==="user"?"#fff":T.textS,lineHeight:1.65,whiteSpace:"pre-wrap",fontFamily:T.sans,boxShadow:m.role==="assistant"?"0 1px 3px rgba(0,0,0,0.05)":"none"}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:6,padding:"0 0 12px 32px"}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.textD,animation:"pulse 1.2s infinite",animationDelay:`${i*0.2}s`}}/>)}</div>}
        {pendingTx&&(
          <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12,marginLeft:32,boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
            <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:10,fontFamily:T.mono,fontWeight:500}}>Confirm — saves to ledger & updates balances</div>
            {pendingTx.map((t,i)=>(
              <div key={i} style={{fontSize:12,color:T.textS,padding:"5px 0",borderBottom:`1px solid #F9FAFB`,fontFamily:T.mono,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                <span><Badge color={t.type==="income"?T.green:T.red}>{t.type}</Badge> <span style={{marginLeft:6,color:T.textD}}>{t.date}</span> <span style={{marginLeft:6}}>{t.label||t.category}</span></span>
                <span style={{color:t.type==="income"?T.green:T.red,fontWeight:700}}>{t.amount} {t.currency} → {t.account}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button onClick={()=>{onTransactions(pendingTx);setPendingTx(null);setMsgs(m=>[...m,{role:"assistant",content:"✓ Saved. Ledger & balances updated."}]);}}
                style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"8px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Confirm & Save</button>
              <button onClick={()=>setPendingTx(null)} style={{background:T.white,color:T.textM,border:`1px solid ${T.borderS}`,borderRadius:5,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:T.sans}}>Discard</button>
            </div>
          </div>
        )}
      </div>
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,background:T.white,margin:"0 -16px",padding:"12px 16px"}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={onBTCFetch} disabled={btcLoading} style={{background:"#FEF3C7",color:T.gold,border:`1px solid #FDE68A`,borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}>
            {btcLoading?"fetching…":"↻ BTC + FX"}
          </button>
          <div style={{flex:1,display:"flex",gap:6}}>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              rows={2} placeholder='"0.003 BTC dropshipping today" · "spent $45 on dating" · "how is my margin?"'
              style={{flex:1,background:T.white,border:`1px solid ${T.borderS}`,borderRadius:6,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:T.sans,outline:"none",resize:"none"}}/>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <button onClick={send} disabled={loading||!input.trim()} style={{background:T.text,color:"#fff",border:"none",borderRadius:6,padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Ask →</button>
              <button onClick={quickLog} disabled={loading||!input.trim()} style={{background:"#FEF3C7",color:T.gold,border:`1px solid #FDE68A`,borderRadius:6,padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Log ↗</button>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {["0.003 BTC dropshipping today","spent $45 on dating","500k IDR gas from BCA","how's my net worth?"].map(s=>(
            <button key={s} onClick={()=>setInput(s)} style={{background:"#F3F4F6",border:`1px solid ${T.border}`,color:T.textM,borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:T.mono}}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// BUDGET FUNCTION

function Budget({st,bp,budgets,onSaveBudgets}){
  const{ledger,rates}=st;
  const[editing,setEditing]=useState(false);
  const[totalIDR,setTotalIDR]=useState(budgets.totalIDR||15000000);
  const[draftPct,setDraftPct]=useState(budgets.pct||{Dad:15,Mom:5,Sam:5,Glenn:5,Personal:10,Dating:10,Gas:5,Gear:15,Miscellaneous:5,Family:10,"Debt Repayment":15});
  const[wishlist,setWishlist]=useState([]);
  const[showWishForm,setShowWishForm]=useState(false);
  const[wishForm,setWishForm]=useState({name:"",amountIDR:"",targetMonth:new Date().toISOString().slice(0,7),priority:"want",note:""});
  const[selectedMonth,setSelectedMonth]=useState(new Date().toISOString().slice(0,7));

  const pct=budgets.pct||draftPct;
  const budgetTotalIDR=budgets.totalIDR||totalIDR;
  const budgetTotalUSD=budgetTotalIDR/(rates.USDIDR||16200);

  const thisM=selectedMonth;
  const md=buildMonth(thisM,ledger,bp,rates);
  const spentTotalUSD=md.cost;
  const spentTotalIDR=spentTotalUSD*(rates.USDIDR||16200);
  const remainingIDR=budgetTotalIDR-spentTotalIDR;
  const overallPct=budgetTotalIDR>0?spentTotalIDR/budgetTotalIDR:0;

  const monthWishlist=wishlist.filter(w=>w.targetMonth===thisM&&!w.purchased);
  const wishTotalIDR=monthWishlist.reduce((s,w)=>s+(parseFloat(w.amountIDR)||0),0);
  const wishTotalUSD=wishTotalIDR/(rates.USDIDR||16200);
  const grandTotalIDR=budgetTotalIDR+wishTotalIDR;
  const projectedIncome=md.inc;
  const canAfford=projectedIncome>=(spentTotalUSD+wishTotalUSD);

  const totalPct=Object.values(draftPct).reduce((s,v)=>s+(parseFloat(v)||0),0);
  const pctOk=Math.abs(totalPct-100)<0.1;

  function saveEdit(){
    if(!pctOk)return;
    onSaveBudgets({totalIDR,pct:draftPct});
    setEditing(false);
  }

  function addWish(){
    if(!wishForm.name||!wishForm.amountIDR)return;
    setWishlist(wl=>[...wl,{id:Date.now(),name:wishForm.name,amountIDR:parseFloat(wishForm.amountIDR),targetMonth:wishForm.targetMonth,priority:wishForm.priority,note:wishForm.note,purchased:false}]);
    setShowWishForm(false);
    setWishForm({name:"",amountIDR:"",targetMonth:new Date().toISOString().slice(0,7),priority:"want",note:""});
  }

  function statusColor(p){return p>=1?T.red:p>=0.8?T.gold:T.green;}

  const inp={background:"#fff",border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"7px 10px",fontSize:12,fontFamily:T.mono,outline:"none",width:"100%"};
  const lbl={fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:5,display:"block",fontFamily:T.mono,fontWeight:500};

  const today=new Date();
  const nextM=new Date();nextM.setMonth(nextM.getMonth()+1);
  const nextMStr=`${nextM.getFullYear()}-${String(nextM.getMonth()+1).padStart(2,"0")}`;
  const allMonths=[nextMStr,...Array.from({length:6},(_,i)=>{
    const d=new Date(today.getFullYear(),today.getMonth()-i,1);
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  })];

  return(
    <div style={{padding:"20px 16px"}}>

      {/* Month tabs */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:10}}>Budget · Select Month</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {allMonths.map(m=>{
            const d=new Date(m+"-01");
            const isActive=m===selectedMonth;
            return(
              <button key={m} onClick={()=>setSelectedMonth(m)}
                style={{background:isActive?T.text:T.white,color:isActive?"#fff":T.textM,border:`1px solid ${isActive?T.text:T.border}`,borderRadius:5,padding:"6px 14px",fontSize:11,fontWeight:isActive?600:400,cursor:"pointer",fontFamily:T.mono}}>
                {MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}{m===nextMStr?" →":""}
              </button>
            );
          })}
        </div>
      </div>

      {/* Overall budget */}
      <Card style={{marginBottom:16}}>
        <div style={{padding:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16}}>
            <div>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:6}}>Monthly Budget Cap</div>
              {editing?(
                <div>
                  <input type="number" step="100000" value={totalIDR} onChange={e=>setTotalIDR(parseFloat(e.target.value)||0)}
                    style={{...inp,width:200,fontSize:16,fontWeight:700,padding:"8px 12px"}}/>
                  <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:4}}>≈ {cu(totalIDR/(rates.USDIDR||16200))} USD</div>
                </div>
              ):(
                <div>
                  <div style={{fontSize:32,fontWeight:800,color:T.text,fontFamily:T.sans,letterSpacing:"-0.02em"}}>{cid(budgetTotalIDR)}</div>
                  <div style={{fontSize:12,color:T.textD,fontFamily:T.mono,marginTop:4}}>{cu(budgetTotalUSD)} USD</div>
                </div>
              )}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:6}}>Spent So Far</div>
              <div style={{fontSize:24,fontWeight:700,color:statusColor(overallPct),fontFamily:T.sans}}>{cid(spentTotalIDR)}</div>
              <div style={{fontSize:12,color:T.textD,fontFamily:T.mono,marginTop:4}}>{cu(spentTotalUSD)} · {(overallPct*100).toFixed(0)}% used</div>
            </div>
          </div>
          <div style={{height:8,background:"#F3F4F6",borderRadius:4,overflow:"hidden",marginBottom:10}}>
            <div style={{height:8,background:statusColor(overallPct),borderRadius:4,width:Math.min(100,overallPct*100)+"%",transition:"width 0.3s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:12,color:remainingIDR>=0?T.green:T.red,fontWeight:600,fontFamily:T.mono}}>
              {remainingIDR>=0?"Remaining: ":"Over by: "}{cid(Math.abs(remainingIDR))}
            </span>
            <button onClick={editing?saveEdit:()=>setEditing(true)}
              disabled={editing&&!pctOk}
              style={{background:editing?T.text:T.white,color:editing?"#fff":T.textS,border:`1px solid ${editing?T.text:T.borderS}`,borderRadius:4,padding:"5px 14px",fontSize:10,cursor:"pointer",fontFamily:T.mono,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>
              {editing?`Save${!pctOk?" ("+totalPct.toFixed(0)+"%/100%)":""}` :"Edit Budget"}
            </button>
          </div>
        </div>
      </Card>

      {/* Category % breakdown */}
      <Card style={{marginBottom:16}}>
        <CardHeader title={editing?"Set % Per Category (must total 100%)":"Category Budget Breakdown"}/>
        <div style={{padding:"8px 0"}}>
          {EXPENSE_CATS.map(cat=>{
            const catPct=parseFloat(pct[cat])||0;
            const catBudgetIDR=budgetTotalIDR*(catPct/100);
            const catBudgetUSD=catBudgetIDR/(rates.USDIDR||16200);
            const spentUSD=md.cats[cat]||0;
            const spentIDR=spentUSD*(rates.USDIDR||16200);
            const remainIDR=catBudgetIDR-spentIDR;
            const catSpentPct=catBudgetIDR>0?spentIDR/catBudgetIDR:0;
            const isOver=catSpentPct>=1;
            const isClose=catSpentPct>=0.8&&catSpentPct<1;
            return(
              <div key={cat} style={{padding:"12px 20px",borderBottom:`1px solid #F9FAFB`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:catPct>0?6:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,color:T.textS,fontWeight:500}}>{cat}</span>
                    {isOver&&<span style={{background:"#FEE2E2",color:T.red,fontSize:9,fontWeight:700,letterSpacing:"0.1em",padding:"2px 6px",borderRadius:3,fontFamily:T.mono}}>OVER</span>}
                    {isClose&&<span style={{background:"#FEF3C7",color:T.gold,fontSize:9,fontWeight:700,letterSpacing:"0.1em",padding:"2px 6px",borderRadius:3,fontFamily:T.mono}}>CLOSE</span>}
                  </div>
                  {editing?(
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="number" step="1" min="0" max="100" value={draftPct[cat]||0}
                        onChange={e=>setDraftPct(d=>({...d,[cat]:parseFloat(e.target.value)||0}))}
                        style={{...inp,width:70,textAlign:"right",padding:"4px 8px"}}/>
                      <span style={{fontSize:12,color:T.textM,fontFamily:T.mono}}>%</span>
                    </div>
                  ):(
                    <div style={{textAlign:"right"}}>
                      <span style={{fontSize:12,color:T.textM,fontFamily:T.mono,fontWeight:500}}>{catPct}% · {cid(catBudgetIDR)}</span>
                    </div>
                  )}
                </div>
                {catPct>0&&!editing&&(
                  <>
                    <div style={{height:4,background:"#F3F4F6",borderRadius:2,overflow:"hidden",marginBottom:4}}>
                      <div style={{height:4,background:statusColor(catSpentPct),borderRadius:2,width:Math.min(100,catSpentPct*100)+"%",transition:"width 0.3s"}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:T.mono,color:T.textD}}>
                      <span>Spent: {cid(spentIDR)} / {cid(catBudgetIDR)}</span>
                      <span style={{color:remainIDR>=0?T.green:T.red,fontWeight:600}}>
                        {remainIDR>=0?`${cid(remainIDR)} left`:`${cid(Math.abs(remainIDR))} over`}
                      </span>
                    </div>
                  </>
                )}
                {catPct===0&&!editing&&(
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>
                    {spentIDR>0?`Spent: ${cid(spentIDR)} — no cap set`:"No cap · no spending"}
                  </div>
                )}
              </div>
            );
          })}
          {editing&&(
            <div style={{padding:"12px 20px",background:pctOk?"#F0FDF4":"#FEF2F2",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,fontFamily:T.mono,color:pctOk?T.green:T.red,fontWeight:600}}>
                Total: {totalPct.toFixed(1)}% {pctOk?"✓ — ready to save":`— needs to be 100%`}
              </span>
              {!pctOk&&<span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{totalPct<100?`Add ${(100-totalPct).toFixed(1)}% more`:`Remove ${(totalPct-100).toFixed(1)}%`}</span>}
            </div>
          )}
        </div>
      </Card>

      {/* Wishlist */}
      <Card style={{marginBottom:16}}>
        <CardHeader title={`Wishlist · ${MONTHS_SHORT[new Date(selectedMonth+"-01").getMonth()]}`}
          action={<button onClick={()=>setShowWishForm(true)} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"5px 12px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.mono,letterSpacing:"0.08em",textTransform:"uppercase"}}>+ Add</button>}
        />
        {showWishForm&&(
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={lbl}>Item / Activity</label><input value={wishForm.name} onChange={e=>setWishForm(f=>({...f,name:e.target.value}))} placeholder="e.g. New shoes, Bali trip" style={inp}/></div>
              <div>
                <label style={lbl}>Price (IDR)</label>
                <input type="number" value={wishForm.amountIDR} onChange={e=>setWishForm(f=>({...f,amountIDR:e.target.value}))} placeholder="e.g. 2500000" style={inp}/>
                {wishForm.amountIDR&&<div style={{fontSize:10,color:T.textD,marginTop:3,fontFamily:T.mono}}>≈ {cu(parseFloat(wishForm.amountIDR)/(rates.USDIDR||16200))}</div>}
              </div>
              <div>
                <label style={lbl}>Target Month</label>
                <select value={wishForm.targetMonth} onChange={e=>setWishForm(f=>({...f,targetMonth:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                  {allMonths.map(m=>{const d=new Date(m+"-01");return<option key={m} value={m}>{MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}</option>;})}
                </select>
              </div>
              <div>
                <label style={lbl}>Priority</label>
                <select value={wishForm.priority} onChange={e=>setWishForm(f=>({...f,priority:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                  <option value="need">Need</option>
                  <option value="want">Want</option>
                  <option value="experience">Experience</option>
                </select>
              </div>
            </div>
            <div style={{marginBottom:12}}><label style={lbl}>Note</label><input value={wishForm.note} onChange={e=>setWishForm(f=>({...f,note:e.target.value}))} placeholder="Why do you want this?" style={inp}/></div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={addWish} disabled={!wishForm.name||!wishForm.amountIDR} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"8px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Add</button>
              <button onClick={()=>setShowWishForm(false)} style={{background:T.white,color:T.textM,border:`1px solid ${T.borderS}`,borderRadius:4,padding:"8px 14px",fontSize:12,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            </div>
          </div>
        )}
        {monthWishlist.length===0&&!showWishForm&&(
          <div style={{padding:"24px 20px",color:T.textD,fontSize:13,fontFamily:T.mono}}>No wishlist items for this month.</div>
        )}
        {monthWishlist.map(w=>{
          const PRIORITY_COLOR={need:T.red,want:T.blue,experience:T.purple};
          return(
            <div key={w.id} style={{padding:"12px 20px",borderBottom:`1px solid #F9FAFB`,opacity:w.purchased?0.4:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <input type="checkbox" checked={w.purchased} onChange={()=>setWishlist(wl=>wl.map(x=>x.id===w.id?{...x,purchased:!x.purchased}:x))} style={{width:15,height:15,marginTop:2,cursor:"pointer",accentColor:T.text}}/>
                  <div>
                    <div style={{fontSize:13,color:w.purchased?"#9CA3AF":T.textS,fontWeight:500,textDecoration:w.purchased?"line-through":"none"}}>{w.name}</div>
                    {w.note&&<div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:2}}>{w.note}</div>}
                    <span style={{display:"inline-block",background:PRIORITY_COLOR[w.priority]+"15",color:PRIORITY_COLOR[w.priority],border:`1px solid ${PRIORITY_COLOR[w.priority]}25`,borderRadius:3,padding:"1px 6px",fontSize:9,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:T.mono,marginTop:4}}>{w.priority}</span>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"flex-start",gap:8,flexShrink:0,marginLeft:8}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:13,color:T.textS,fontWeight:700,fontFamily:T.mono}}>{cid(w.amountIDR)}</div>
                    <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>{cu(w.amountIDR/(rates.USDIDR||16200))}</div>
                  </div>
                  <button onClick={()=>setWishlist(wl=>wl.filter(x=>x.id!==w.id))} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:14,paddingTop:2}}>×</button>
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Grand total */}
      <Card>
        <CardHeader title="Budget + Wishlist Summary"/>
        <div style={{padding:"20px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,marginBottom:20,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
            <div style={{padding:"16px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:6}}>Budget Cap</div>
              <div style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:T.sans}}>{cid(budgetTotalIDR)}</div>
              <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:2}}>{cu(budgetTotalUSD)}</div>
            </div>
            <div style={{padding:"16px",borderRight:`1px solid ${T.border}`}}>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:6}}>Wishlist ({monthWishlist.length})</div>
              <div style={{fontSize:18,fontWeight:700,color:T.purple,fontFamily:T.sans}}>{cid(wishTotalIDR)}</div>
              <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:2}}>{cu(wishTotalUSD)}</div>
            </div>
            <div style={{padding:"16px"}}>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:6}}>Grand Total</div>
              <div style={{fontSize:18,fontWeight:700,color:T.text,fontFamily:T.sans}}>{cid(grandTotalIDR)}</div>
              <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:2}}>{cu(grandTotalIDR/(rates.USDIDR||16200))}</div>
            </div>
          </div>
          <div style={{background:canAfford?"#F0FDF4":"#FEF2F2",border:`1px solid ${canAfford?"#BBF7D0":"#FECACA"}`,borderRadius:8,padding:"16px 20px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:22}}>{canAfford?"✓":"⚠"}</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:canAfford?T.green:T.red,fontFamily:T.sans}}>{canAfford?"You can afford everything":"Over projected income"}</div>
                <div style={{fontSize:11,color:T.textM,fontFamily:T.mono,marginTop:2}}>Income: {cu(projectedIncome)} · Needed: {cu(spentTotalUSD+wishTotalUSD)}</div>
              </div>
            </div>
            <div style={{height:6,background:canAfford?"#BBF7D0":"#FECACA",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:6,background:canAfford?T.green:T.red,borderRadius:3,width:Math.min(100,((spentTotalUSD+wishTotalUSD)/Math.max(projectedIncome,spentTotalUSD+wishTotalUSD))*100)+"%"}}/>
            </div>
            <div style={{fontSize:11,color:T.textM,fontFamily:T.mono,marginTop:6,textAlign:"right"}}>
              {canAfford
                ?`${cid((projectedIncome-spentTotalUSD-wishTotalUSD)*(rates.USDIDR||16200))} left after everything`
                :`${cid((spentTotalUSD+wishTotalUSD-projectedIncome)*(rates.USDIDR||16200))} short`
              }
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
// ── App Root ──────────────────────────────────────────────────────────────────
export default function App(){
  const[ledger,setLedger]=useState([]);
  const[orders,setOrders]=useState([]);
  const[budgets,setBudgets]=useState({});
  const[wallets,setWallets]=useState(DEFAULT_WALLETS);
  const[rates,setRates]=useState(DEFAULT_RATES);
  const[btcCostBasis,setBtcCostBasis]=useState(0);
  const[btcPrice,setBtcPrice]=useState(null);
  const[view,setView]=useState("Dashboard");
  const[btcLoading,setBtcLoading]=useState(false);
  const[dbLoading,setDbLoading]=useState(true);
  const[toast,setToast]=useState(null);
  const[syncError,setSyncError]=useState(false);
  const[walletRowId,setWalletRowId]=useState(null);
  const showToast=msg=>setToast(msg);

  useEffect(()=>{
    async function loadAll(){
      setDbLoading(true);
      const[price,fx]=await Promise.all([fetchBTCPrice(),fetchFXRates()]);
      if(price)setBtcPrice(price);
      if(fx)setRates(fx);
      try{
        const ledgerData=await sb("ledger?order=created_at.desc");
        if(ledgerData)setLedger(ledgerData.map(e=>({...e,amount:parseFloat(e.amount)})));
        const orderData=await sb("orders?order=created_at.desc");
        if(orderData&&orderData.length>0)setOrders(orderData.map(o=>({...o,costBTC:parseFloat(o.cost||0),saleBTC:parseFloat(o.sale_price||0),cost:parseFloat(o.cost||0),salePrice:parseFloat(o.sale_price||0),delivered:o.delivered===true||o.status==="delivered"})));
        const walletData=await sb("wallets?order=updated_at.desc&limit=1");
        if(walletData&&walletData[0]){const wd=walletData[0];setWalletRowId(wd.id);setWallets({coinbase_btc:parseFloat(wd.coinbase_btc)||0,metamask_btc:parseFloat(wd.metamask_btc)||0,coinbase_usdt:parseFloat(wd.coinbase_usdt)||0,metamask_usdt:parseFloat(wd.metamask_usdt)||0,uob_sgd:parseFloat(wd.uob_sgd)||0,revolut_sgd:parseFloat(wd.revolut_sgd)||0,bca_idr:parseFloat(wd.bca_idr)||0});}
        const settingsData=await sb("settings");
        if(settingsData)settingsData.forEach(s=>{if(s.key==="btc_cost_basis")setBtcCostBasis(parseFloat(s.value)||0);});
        setSyncError(false);
        if(s.key==="budgets"){ try{ setBudgets(JSON.parse(s.value)||{}); }catch{} }
      }catch(e){console.error("Supabase load error:",e);setSyncError(true);}
      setDbLoading(false);
    }
    loadAll();
  },[]);

  async function saveWallets(newW){
    setWallets(newW);
    try{
      if(walletRowId){await sb(`wallets?id=eq.${walletRowId}`,"PATCH",{...newW,updated_at:new Date().toISOString()});}
      else{const res=await sb("wallets","POST",{...newW,updated_at:new Date().toISOString()});if(res&&res[0])setWalletRowId(res[0].id);}
    }catch(e){console.error("Wallet save error:",e);}
  }

  async function saveSetting(key,value){
    try{await sb(`settings?key=eq.${key}`,"DELETE");await sb("settings","POST",{key,value:String(value),updated_at:new Date().toISOString()});}
    catch(e){console.error("Setting save error:",e);}
  }

  async function saveBudgets(newBudgets){
    setBudgets(newBudgets);
    try{ await saveSetting("budgets",JSON.stringify(newBudgets)); }
    catch(e){ console.error("Budget save error:",e); }
  }

  async function applyTransactions(txs){
    const newEntries=txs.map(t=>({...t,amount:Math.abs(parseFloat(t.amount))}));
    const newW={...wallets};
    newEntries.forEach(e=>{const amt=Math.abs(parseFloat(e.amount));if(!e.account||!newW.hasOwnProperty(e.account))return;if(e.type==="income")newW[e.account]=(newW[e.account]||0)+amt;else newW[e.account]=Math.max(0,(newW[e.account]||0)-amt);});
    try{
      for(const e of newEntries){const saved=await sb("ledger","POST",{type:e.type,category:e.category,amount:e.amount,currency:e.currency,account:e.account,label:e.label,date:e.date});const id=saved?.[0]?.id||crypto.randomUUID();setLedger(l=>[{...e,id},...l]);}
      await saveWallets(newW);showToast(`✓ ${newEntries.length} transaction(s) saved`);
    }catch(err){console.error("Transaction save error:",err);setLedger(l=>[...newEntries.map(e=>({...e,id:Date.now()+Math.random()})),...l]);setWallets(newW);showToast("Saved locally (Supabase error)");}
  }

  async function deleteEntry(id){
    const entry=ledger.find(e=>e.id===id);
    setLedger(l=>l.filter(e=>e.id!==id));
    try{await sb(`ledger?id=eq.${id}`,"DELETE");}catch(e){console.error(e);}
    if(entry&&entry.category==="Dropshipping"&&entry.type==="income"){
      const linkedOrder=orders.find(o=>entry.label?.includes(o.id));
      if(linkedOrder){
        const profitBTC=Math.abs(parseFloat(linkedOrder.saleBTC||0))-Math.abs(parseFloat(linkedOrder.costBTC||0));
        if(profitBTC>0){const newW={...wallets,metamask_btc:Math.max(0,(wallets.metamask_btc||0)-profitBTC)};await saveWallets(newW);}
        setOrders(os=>os.filter(o=>o.id!==linkedOrder.id));
        try{await sb(`orders?id=eq.${linkedOrder.id}`,"DELETE");}catch(e){console.error(e);}
        showToast("✓ Entry + linked order removed · balance reversed");return;
      }
    }
    if(entry&&entry.type==="expense"){
      const acc=entry.account||"revolut_sgd";
      let amt=Math.abs(parseFloat(entry.amount)||0);
      if(acc==="revolut_sgd"||acc==="uob_sgd"){if(entry.currency==="USD"||entry.currency==="USDT")amt=amt*rates.USDSGD;if(entry.currency==="IDR")amt=amt*(rates.USDSGD/(rates.USDIDR||16200));if(entry.currency==="BTC")amt=amt*(btcPrice||0)*rates.USDSGD;}
      if(acc==="bca_idr"){if(entry.currency==="USD"||entry.currency==="USDT")amt=amt*(rates.USDIDR||16200);if(entry.currency==="SGD")amt=amt*(rates.USDIDR||16200)/rates.USDSGD;if(entry.currency==="BTC")amt=amt*(btcPrice||0)*(rates.USDIDR||16200);}
      if(acc==="coinbase_btc"||acc==="metamask_btc"){if(entry.currency==="USD"||entry.currency==="USDT")amt=amt/(btcPrice||1);if(entry.currency==="SGD")amt=amt/rates.USDSGD/(btcPrice||1);if(entry.currency==="IDR")amt=amt/(rates.USDIDR||16200)/(btcPrice||1);}
      if(acc==="coinbase_usdt"||acc==="metamask_usdt"){if(entry.currency==="SGD")amt=amt/rates.USDSGD;if(entry.currency==="IDR")amt=amt/(rates.USDIDR||16200);if(entry.currency==="BTC")amt=amt*(btcPrice||0);}
      const newW={...wallets,[acc]:(wallets[acc]||0)+amt};await saveWallets(newW);showToast("✓ Entry removed · balance restored");return;
    }
    showToast("✓ Entry removed");
  }

  async function addOrder(o){
    setOrders(os=>[o,...os]);
    try{
      await sb("orders","POST",{id:o.id,client:o.client,item:o.items,items:o.items,vendor:o.vendor,cost:o.costBTC,sale_price:o.saleBTC,btc_amount:o.saleBTC,date:o.date,status:o.status,delivered:o.delivered,delivery_days:null});
      const profitBTC=(parseFloat(o.saleBTC)||0)-(parseFloat(o.costBTC)||0);
      if(profitBTC>0){const incomeEntry={type:"income",category:"Dropshipping",amount:profitBTC,currency:"BTC",account:"metamask_btc",label:`ORD-${o.id} — ${o.client} (${o.vendor})`,date:o.date};await applyTransactions([incomeEntry]);showToast(`✓ Order saved · +${profitBTC.toFixed(6)} ₿ → MetaMask`);}
    }catch(e){console.error("Order save error:",e);}
  }

  async function updateOrder(id,patch){
    setOrders(os=>os.map(o=>o.id===id?{...o,...patch}:o));
    try{const dbPatch={};if(patch.status!==undefined)dbPatch.status=patch.status;if(patch.delivered!==undefined)dbPatch.delivered=patch.delivered;await sb(`orders?id=eq.${id}`,"PATCH",dbPatch);}
    catch(e){console.error(e);}
  }

  async function deleteOrder(id){
    const order=orders.find(o=>o.id===id);
    setOrders(os=>os.filter(o=>o.id!==id));
    if(order){
      const profitBTC=Math.abs(parseFloat(order.saleBTC||0))-Math.abs(parseFloat(order.costBTC||0));
      if(profitBTC>0){const newW={...wallets,metamask_btc:Math.max(0,(wallets.metamask_btc||0)-profitBTC)};await saveWallets(newW);}
      const matchingEntry=ledger.find(e=>e.label&&e.label.includes(id));
      if(matchingEntry){setLedger(l=>l.filter(e=>e.id!==matchingEntry.id));try{await sb(`ledger?id=eq.${matchingEntry.id}`,"DELETE");}catch(e){console.error(e);}}
    }
    try{await sb(`orders?id=eq.${id}`,"DELETE");}catch(e){console.error(e);}
    showToast("✓ Order removed · balance reversed");
  }

  function handleUpdate(key,value){
    if(key==="wallets")saveWallets(value);
    if(key==="rates"){setRates(value);saveSetting("usd_sgd",value.USDSGD);saveSetting("usd_idr",value.USDIDR);}
    if(key==="btcCostBasis"){setBtcCostBasis(value);saveSetting("btc_cost_basis",value);}
  }

  async function handleBTCFetch(){
    setBtcLoading(true);
    const[price,fx]=await Promise.all([fetchBTCPrice(),fetchFXRates()]);
    if(price){setBtcPrice(price);showToast(`₿ ${cu(price)} · FX updated`);}
    if(fx)setRates(fx);
    setBtcLoading(false);
  }

  const st={wallets,rates,btcCostBasis,ledger,orders};
  const nw=netWorth(wallets,btcPrice,rates);

  if(dbLoading)return(
    <div style={{background:T.white,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.sans}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:32,height:32,border:`2px solid ${T.border}`,borderTop:`2px solid ${T.text}`,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 16px"}}/>
        <div style={{fontSize:12,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono}}>Loading live data…</div>
      </div>
    </div>
  );

  return(
    <div style={{background:T.bg,minHeight:"100vh",color:T.text}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${T.bg};color:${T.text};font-family:'Inter',-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
        button{cursor:pointer;transition:all 0.15s;font-family:inherit;}
        button:hover:not(:disabled){opacity:0.82;}
        button:disabled{opacity:0.35;cursor:not-allowed;}
        input,select,textarea{color:${T.text};font-family:'IBM Plex Mono',monospace;}
        input:focus,textarea:focus,select:focus{outline:none;border-color:${T.text}!important;box-shadow:0 0 0 3px rgba(10,10,10,0.08);}
        select option{background:#fff;color:${T.text};}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-track{background:${T.bg};}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{position:"sticky",top:0,zIndex:100,background:"#FFFFFF",borderBottom:`1px solid ${T.border}`,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 24px",height:52,maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🦉</span>
            <div style={{display:"flex",alignItems:"baseline",gap:6}}>
              <span style={{fontSize:15,fontWeight:800,letterSpacing:"0.04em",color:T.text,fontFamily:T.sans}}>JJ</span>
              <span style={{fontSize:9,color:T.textD,letterSpacing:"0.12em",fontFamily:T.mono,fontStyle:"italic"}}>get rich</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:1,overflowX:"auto"}}>
            {NAV_ITEMS.map((n,i)=>(
              <button key={n} onClick={()=>setView(n)}
              style={{background:view===n?T.text:"transparent",border:"none",color:view===n?"#FFFFFF":T.textM,fontSize:13,letterSpacing:"0.06em",textTransform:"uppercase",padding:"9px 16px",borderRadius:6,fontFamily:T.mono,fontWeight:view===n?600:400,whiteSpace:"nowrap"}}>
              {n}
            </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            {btcPrice
              ?<div onClick={handleBTCFetch} style={{fontSize:12,color:T.gold,fontFamily:T.mono,cursor:"pointer",fontWeight:600}} title="Click to refresh">
                {btcLoading?"₿ …":"₿ "+cu(btcPrice)}
              </div>
              :<button onClick={handleBTCFetch} disabled={btcLoading} style={{background:"#FEF3C7",color:T.gold,border:"1px solid #FDE68A",borderRadius:4,padding:"4px 10px",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:600}}>
                {btcLoading?"…":"₿ fetch"}
              </button>
            }
          </div>
        </div>
      </div>

      <div style={{maxWidth:1200,margin:"0 auto"}}>
        {view==="Dashboard"&&<Dashboard st={st} bp={btcPrice}/>}
        {view==="Ledger"   &&<Ledger st={st} bp={btcPrice} onDelete={deleteEntry}/>}
        {view==="Calendar" &&<CalendarView st={st} bp={btcPrice}/>}
        {view==="Orders"   &&<Orders st={st} bp={btcPrice} onUpdateOrder={updateOrder} onAddOrder={addOrder} onDeleteOrder={deleteOrder}/>}
        {view==="Analytics"&&<Analytics st={st} bp={btcPrice}/>}
        {view==="Wallets"  &&<Wallets st={st} bp={btcPrice} onUpdate={handleUpdate} onTransfer={applyTransactions} showToast={showToast}/>}
        {view==="Budget"&&<Budget st={st} bp={btcPrice} budgets={budgets} onSaveBudgets={saveBudgets}/>}
        {view==="AI Chat"  &&<AIChat st={st} bp={btcPrice} onTransactions={applyTransactions} onBTCFetch={handleBTCFetch} btcLoading={btcLoading}/>}
      </div>

      {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}