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
const EXPENSE_CATS = ["Dad","Mom","Sam","Glenn","Personal","Dating","Gas","Gear","Groceries","Business Reinvestment","Miscellaneous","Family","Debt Repayment"];
const CATEGORY_TAGS = {
  "Gear":       ["PEDs / Steroids","Bloodwork","Equipment","Clothing"],
  "Personal":   ["Supplements","Grooming","Self-care","Other"],
  "Dating":     ["Dates","Gifts","Flowers","Other"],
  "Family":     ["Dining","Household","Other"],
  "Groceries":  ["Weekly Shop","Household Supplies","Bulk / Stock-up","Other"],
  "Business Reinvestment": ["Subscriptions","Software / Tools","Data Plan","Phone Number","Other"],
  "Gas":        ["Fuel","Transport / Rideshare","Other"],
  "Dad":        ["Support","Gift","Other"],
  "Mom":        ["Support","Gift","Other"],
  "Sam":        ["Support","Gift","Other"],
  "Glenn":      ["Support","Gift","Other"],
  "Miscellaneous": ["Unclassified","One-off","Other"],
  "Debt Repayment": ["Loan","Credit","Other"],
};
function tagsFor(category){ return CATEGORY_TAGS[category]||["Other"]; }
function resolveTag(rawTag,category){
  const valid=tagsFor(category);
  if(!rawTag) return valid[valid.length-1]; // default to last option ("Other"-style)
  const raw=String(rawTag).toLowerCase().trim();
  const exact=valid.find(t=>t.toLowerCase()===raw);
  if(exact) return exact;
  const partial=valid.find(t=>t.toLowerCase().includes(raw)||raw.includes(t.toLowerCase()));
  if(partial) return partial;
  return valid[valid.length-1];
}
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_KEYS   = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const NAV_ITEMS = ["Dashboard","Ledger","Calendar","Orders","Analytics","Wallets","Budget","Inventory"];
const NAV_ICONS = ["◈","≡","▦","⊞","∿","◎","◉","⬡"];
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
function computeAvgCostBasis(ledger, fallback){
  const btcIncome = ledger.filter(e=>e.type==="income"&&e.currency==="BTC"&&e.btcPriceAtTime);
  if(btcIncome.length===0) return fallback||0;
  let totalBTC=0, totalUSD=0;
  btcIncome.forEach(e=>{
    const amt=parseFloat(e.amount)||0;
    const price=parseFloat(e.btcPriceAtTime)||0;
    totalBTC+=amt;
    totalUSD+=amt*price;
  });
  return totalBTC>0 ? totalUSD/totalBTC : (fallback||0);
}
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
-TRANSFERS:  Transfers between accounts = type:"transfer", category:"Transfer". Two entries: label "Transfer → X" and "Transfer ← Y"
ACCOUNTS: metamask_btc, coinbase_btc, coinbase_usdt, metamask_usdt, uob_sgd, revolut_sgd, bca_idr
EXPENSE CATEGORIES (EXACTLY one): Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Groceries, Miscellaneous, Family, Debt Repayment
CATEGORY MAPPING:
- dad, father, papa → Dad | mom, mother, mama → Mom | sam → Sam | glenn → Glenn
- gear, steroids, mast, test, tren, testosterone, anavar, winstrol, deca, eq, npp, bloodwork, blood test, labs, needles, syringes, pins, vials, any PED → Gear
- gas, fuel, petrol, transport, grab, taxi, uber, gojek → Gas
- dating, date, girlfriend, flowers → Dating
- personal, haircut, grooming → Personal
- supplements, supps, vitamins, protein, creatine, pre workout → Personal
- groceries, supermarket, market, grocery shopping, household supplies → Groceries
- subscription, data plan, phone number, sim card, Claude, ChatGPT, Telegram number, software, SaaS, tool subscription, hosting, domain → Business Reinvestment
- family, dinner, lunch, breakfast, restaurant, eating out → Family
- debt, loan, repayment, installment → Debt Repayment
- anything else → Miscellaneous
TAG (subcategory — pick ONE specific tag under the category, more precise than the category itself):
- Gear → "PEDs / Steroids" (steroids/mast/test/tren/PEDs), "Bloodwork" (blood tests/labs), "Equipment", or "Clothing"
- Personal → "Supplements" (protein/vitamins/creatine), "Grooming" (haircut), "Self-care", or "Other"
- Dating → "Dates", "Gifts", "Flowers", or "Other"
- Family → "Dining", "Household", or "Other"
- Business Reinvestment → "Subscriptions", "Software / Tools", "Data Plan", "Phone Number", or "Other"
- Groceries → "Weekly Shop", "Household Supplies", "Bulk / Stock-up", or "Other"
- Gas → "Fuel", "Transport / Rideshare", or "Other"
- Dad/Mom/Sam/Glenn → "Support" (regular help), "Gift", or "Other"
- Miscellaneous → "Unclassified", "One-off", or "Other"
- Debt Repayment → "Loan", "Credit", or "Other"
If genuinely unclear, use the category's "Other" tag. Never invent a tag outside the listed options for that category.
CURRENCY RULES:
- "$", "dollar", "usd" in EXPENSES = SGD → revolut_sgd
- IDR, ribu, rb, juta = IDR → bca_idr
- SGD, S$ = SGD → revolut_sgd
- BTC income → metamask_btc (unless user says coinbase)
- USDT income → coinbase_usdt (unless user says metamask)
TRANSFER PAIRS: metamask→coinbase (BTC), coinbase→uob (USDT/BTC→SGD), uob→revolut (SGD), revolut→bca (SGD→IDR)
CRITICAL: date=YYYY-MM-DD always. Today=${today}. Yesterday=${yesterday}. Never write "today". account never null. amount positive. type exactly "income" or "expense".
Return ONLY valid JSON array, no markdown.
[{"type":"income|expense","category":"...","tag":"...","amount":0,"currency":"BTC|USDT|SGD|IDR","account":"...","label":"...","date":"YYYY-MM-DD"}]`;
  const txt=await callClaude([{role:"user",content:text}],sys);
  const clean=txt.replace(/```json[\s\S]*?```|```/g,"").trim();
  const parsed=JSON.parse(clean);
  return parsed.map(e=>{
    const resolvedCategory=(()=>{if(!e.category)return"Miscellaneous";const raw=e.category.toLowerCase().trim();const steroidTerms=["steroid","mast","tren","testosterone","anavar","winstrol","deca","npp","bloodwork","blood test","labs","needles","pins","vials","ped"];if(steroidTerms.some(s=>raw.includes(s)))return"Gear";const exact=EXPENSE_CATS.find(c=>c.toLowerCase()===raw);if(exact)return exact;const partial=EXPENSE_CATS.find(c=>raw.includes(c.toLowerCase())||c.toLowerCase().includes(raw));if(partial)return partial;return"Miscellaneous";})();
    return{...e,type:e.type==="income"?"income":"expense",amount:Math.abs(parseFloat(e.amount)||0),currency:(e.type==="expense"&&e.currency==="USD")?"SGD":e.currency||"SGD",account:e.account||"revolut_sgd",
      category:resolvedCategory,
      tag:resolveTag(e.tag,resolvedCategory),
      date:(e.date&&/^\d{4}-\d{2}-\d{2}$/.test(e.date))?e.date:today};
  });
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
EXPENSE CATEGORIES: Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Groceries, Miscellaneous, Family, Debt Repayment
CATEGORY: steroids/PEDs/bloodwork=Gear. supplements/vitamins/protein=Personal. supermarket/groceries/household supplies=Groceries. dining out/restaurant=Family. subscriptions/data plan/phone number/Claude/Telegram/software tools=Business Reinvestment. Never invent categories.
TAG (subcategory, one level more specific than category): Gear→PEDs/Steroids|Bloodwork|Equipment|Clothing. Personal→Supplements|Grooming|Self-care|Other. Dating→Dates|Gifts|Flowers|Other. Family→Dining|Household|Other. Groceries→Weekly Shop|Household Supplies|Bulk / Stock-up|Other. Gas→Fuel|Transport / Rideshare|Other. Dad/Mom/Sam/Glenn→Support|Gift|Other. Miscellaneous→Unclassified|One-off|Other. If unsure use that category's "Other".
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
<TRANSACTIONS>[{"type":"income|expense","category":"...","tag":"...","amount":0,"currency":"BTC|USDT|SGD|IDR","account":"...","label":"...","date":"YYYY-MM-DD"}]</TRANSACTIONS>
CRITICAL: date=YYYY-MM-DD never "today". Today=${new Date().toISOString().slice(0,10)}. account never null. "$" in expenses=SGD→revolut_sgd.
TRANSFER RULES: If user mentions transfer/move/send between accounts, output TWO entries both with type:"transfer" and category:"Transfer". First entry label "Transfer → [destination]", second label "Transfer ← [source]". Never use type expense or income for transfers.
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
function Dashboard({st,bp,onDismissBanner}){
  const{wallets:w,rates,ledger,orders,btcCostBasis}=st;
  const[stressPct,setStressPct]=useState(0); // 0, -10, -30, -50
  const stressBp=bp?bp*(1+stressPct/100):bp;
  const nw=netWorth(w,bp,rates);
  const stressNw=netWorth(w,stressBp,rates);
  const btcTotal=totalBTC(w);
  const btcPnL=bp&&btcCostBasis?(bp-btcCostBasis)*btcTotal:0;
  const btcPnLPct=btcCostBasis?((bp||0)-btcCostBasis)/btcCostBasis*100:0;
 
  const today=new Date();
  const thisM=today.toISOString().slice(0,7);
  const daysInMonth=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();
  const daysElapsed=today.getDate();
  const md=buildMonth(thisM,ledger,bp,rates);
  const dailyAvgIncome=daysElapsed>0?md.inc/daysElapsed:0;
  const dailyAvgSpend=daysElapsed>0?md.cost/daysElapsed:0;
 
  // ── Net worth trend — last 6 months, reconstructed from cumulative ledger ──
  const allMonths=Array.from({length:6},(_,i)=>{
    const d=new Date(today.getFullYear(),today.getMonth()-(5-i),1);
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
  const nwTrend=allMonths.map(ym=>{
    const m=buildMonth(ym,ledger,bp,rates);
    return{month:MONTHS_SHORT[parseInt(ym.split("-")[1])-1],net:Math.round(m.net),income:Math.round(m.inc),cost:Math.round(m.cost)};
  });

  // ── Cumulative net worth trajectory — the actual curve, not just monthly flow ──
  // Reconstructed by working backwards from current net worth using each month's
  // real net income (same method the Calendar trajectory chart uses), so the
  // sparkline shows what net worth has actually been doing, not a proxy for it.
  const sixMonthNetSum=nwTrend.reduce((s,m)=>s+m.net,0);
  const startingNW=nw-sixMonthNetSum;
  let runningNW=startingNW;
  const nwCumulativeTrend=nwTrend.map(m=>{
    runningNW+=m.net;
    return{month:m.month,nw:Math.round(runningNW)};
  });
  const trendStart=nwCumulativeTrend[0]?.nw||0;
  const trendEnd=nwCumulativeTrend[nwCumulativeTrend.length-1]?.nw||0;

  // ── Compounding rate — the perpetual metric, not a finish line ──
  // Trailing average monthly net (income − expense) as a % of current net worth,
  // then Rule of 72 to translate that into "months to double at this pace."
  // This is the one number that never "completes" — there's always a next
  // doubling to chase, and it's grounded in your own recent behavior, not a
  // fixed target you picked once.
  const monthsWithData=nwTrend.filter(m=>m.income>0||m.cost>0);
  const trailingWindow=monthsWithData.slice(-3); // last up to 3 months with any activity
  const avgMonthlyNet=trailingWindow.length>0?trailingWindow.reduce((s,m)=>s+m.net,0)/trailingWindow.length:0;
  const monthlyGrowthRate=nw>0?avgMonthlyNet/nw:0; // e.g. 0.05 = 5%/month
  const annualGrowthRatePct=monthlyGrowthRate*12*100;
  const monthsToDouble=monthlyGrowthRate>0?72/(monthlyGrowthRate*100):null;
  const isCompounding=monthlyGrowthRate>0;

 
  // ── Portfolio allocation ──
  const allocation=[
    {name:"BTC",value:btcTotal*(bp||0),color:T.gold},
    {name:"USDT",value:totalUSDT(w),color:T.green},
    {name:"SGD",value:((w.uob_sgd||0)+(w.revolut_sgd||0))/rates.USDSGD,color:T.blue},
    {name:"IDR",value:(w.bca_idr||0)/(rates.USDIDR||16200),color:T.purple},
  ].filter(a=>a.value>0.01);
  const allocTotal=allocation.reduce((s,a)=>s+a.value,0);
 
  // ── Recent activity — merged ledger + orders, sorted by date ──
  const recentLedger=ledger.slice(0,6).map(e=>({
    kind:"ledger",date:e.date,type:e.type,
    label:e.label||e.category||"—",
    amountUSD:toUSD(e.amount,e.currency,rates,bp),
    sub:e.category||e.account,
  }));
  const recentOrders=orders.slice(0,4).map(o=>({
    kind:"order",date:o.date,type:"order",
    label:`${o.client} · ${o.vendor}`,
    amountUSD:(parseFloat(o.saleBTC||0)-parseFloat(o.costBTC||0))*(bp||0),
    sub:o.delivered?"delivered":"pending",
  }));
  const activity=[...recentLedger,...recentOrders].sort((a,b)=>(b.date||"").localeCompare(a.date||"")).slice(0,8);
 
  // ── Open orders ──
  const openOrders=orders.filter(o=>!o.delivered);
  function orderProfitUSD(o){
    const currency=o.currency||"BTC";
    const profit=parseFloat(o.saleBTC||0)-parseFloat(o.costBTC||0);
    return currency==="BTC"?profit*(bp||0):profit;
  }
  const orderProfitTotalUSD=orders.reduce((s,o)=>s+orderProfitUSD(o),0);
  const monthOrders=orders.filter(o=>o.date?.startsWith(thisM));
  const monthOrderProfitUSD=monthOrders.reduce((s,o)=>s+orderProfitUSD(o),0);
 
  // ── Category spend snapshot (top 4) ──
  const catSnapshot=EXPENSE_CATS.map(c=>({name:c,value:md.cats[c]||0})).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,4);
  const PIE_COLORS=[T.red,T.gold,T.blue,T.purple];
 
  // ── Runway estimate: liquid non-BTC balance / daily avg spend ──
  const liquidUSD=totalUSDT(w)+((w.uob_sgd||0)+(w.revolut_sgd||0))/rates.USDSGD+(w.bca_idr||0)/(rates.USDIDR||16200);
  const runwayDays=dailyAvgSpend>0?Math.floor(liquidUSD/dailyAvgSpend):null;
 
  const ACT_ICON={income:"↓",expense:"↑",transfer:"⇄",order:"◈"};
  const ACT_COLOR={income:T.green,expense:T.red,transfer:T.blue,order:T.purple};
 
  return(
    <div style={{paddingBottom:32}}>
 
      {/* ── Hero: Net Worth ── */}
      <div style={{padding:"32px 28px 24px",background:T.white,borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:24}}>
          <div style={{flex:1,minWidth:260}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Total Portfolio Value</span>
              {(()=>{const h=reconHealth(st.lastReconciled);return(
                <span style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:h.color,fontFamily:T.mono,fontWeight:600,background:h.urgent?"#FEF2F2":"#F9FAFB",border:`1px solid ${h.urgent?"#FECACA":T.border}`,borderRadius:20,padding:"2px 8px"}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:h.dot}}/>{h.label}
                </span>
              );})()}
            </div>
            <div style={{display:"flex",alignItems:"baseline",gap:14,flexWrap:"wrap"}}>
              <div style={{fontSize:46,fontWeight:800,letterSpacing:"-0.03em",color:T.text,lineHeight:1,fontFamily:T.sans}}>{bp?cu(nw):"—"}</div>
              {bp&&btcPnL!==0&&(
                <div style={{fontSize:12,color:btcPnL>=0?T.green:T.red,fontFamily:T.mono,fontWeight:600,padding:"3px 8px",background:btcPnL>=0?"#F0FDF4":"#FEF2F2",borderRadius:4}}>
                  {btcPnL>=0?"▲":"▼"} {cu(Math.abs(btcPnL))} BTC PnL ({btcPnLPct.toFixed(1)}%)
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:16,marginTop:8,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{cbt(btcTotal)} @ {bp?cu(bp):"—"}/BTC</span>
              {bp&&<span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{csg(nw*rates.USDSGD)} SGD</span>}
              {bp&&<span style={{fontSize:11,color:T.gold,fontFamily:T.mono,fontWeight:500}}>{cid(nw*(rates.USDIDR||16200))}</span>}
            </div>
          </div>
 
          {/* Net worth trend sparkline — cumulative trajectory, not just monthly flow */}
          <div style={{width:220,flexShrink:0}}>
            <div style={{fontSize:10,color:T.textD,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6,fontFamily:T.mono,textAlign:"right"}}>6-Month Net Worth</div>
            <ResponsiveContainer width="100%" height={64}>
              <AreaChart data={nwCumulativeTrend}>
                <defs><linearGradient id="nwg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={T.blue} stopOpacity={0.15}/><stop offset="95%" stopColor={T.blue} stopOpacity={0}/></linearGradient></defs>
                <Area type="monotone" dataKey="nw" stroke={T.blue} strokeWidth={1.75} fill="url(#nwg)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.textD,fontFamily:T.mono,marginTop:2}}>
              <span>{cu(trendStart,0)}</span>
              <span style={{color:trendEnd>=trendStart?T.green:T.red,fontWeight:600}}>→ {cu(trendEnd,0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Since last checked ── */}
      {st.lastVisitBanner&&(()=>{
        const b=st.lastVisitBanner;
        const sinceLabel=new Date(b.sinceDate+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
        const hasActivity=b.incomeSinceUSD>0||b.expenseSinceUSD>0;
        return(
          <div style={{padding:"16px 16px 0"}}>
            <Card style={{background:"#F0F9FF",borderColor:"#BFDBFE"}}>
              <div style={{padding:"14px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:T.blue,fontWeight:600,fontFamily:T.mono,whiteSpace:"nowrap"}}>Since {sinceLabel}:</span>
                  {hasActivity?(
                    <>
                      {b.incomeSinceUSD>0&&<span style={{fontSize:12,color:T.green,fontWeight:600,fontFamily:T.mono}}>+{cu(b.incomeSinceUSD)} income</span>}
                      {b.expenseSinceUSD>0&&<span style={{fontSize:12,color:T.red,fontWeight:600,fontFamily:T.mono}}>-{cu(b.expenseSinceUSD)} spent</span>}
                    </>
                  ):(
                    <span style={{fontSize:12,color:T.textM,fontFamily:T.mono}}>no transactions logged</span>
                  )}
                  {b.nwChange!=null&&<span style={{fontSize:12,color:b.nwChange>=0?T.green:T.red,fontWeight:600,fontFamily:T.mono}}>net worth {b.nwChange>=0?"+":""}{cu(b.nwChange)}</span>}
                  {b.btcChangePct!=null&&<span style={{fontSize:12,color:b.btcChangePct>=0?T.green:T.red,fontFamily:T.mono}}>BTC {b.btcChangePct>=0?"+":""}{b.btcChangePct.toFixed(1)}%</span>}
                </div>
                <button onClick={onDismissBanner} style={{background:"none",border:"none",color:T.blue,cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}}>×</button>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ── Compounding rate — the perpetual metric ── */}
      <div style={{padding:"16px 16px 0"}}>
        <Card>
          <div style={{padding:"18px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
            <div>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:6}}>Compounding Rate</div>
              {isCompounding?(
                <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                  <div style={{fontSize:22,fontWeight:800,color:T.green,fontFamily:T.sans}}>{monthsToDouble<24?`${monthsToDouble.toFixed(0)} months`:`${(monthsToDouble/12).toFixed(1)} years`}</div>
                  <div style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>to double at this pace</div>
                </div>
              ):(
                <div style={{fontSize:14,color:T.textD,fontFamily:T.mono}}>Not compounding yet — log more income to see your rate</div>
              )}
            </div>
            <div style={{display:"flex",gap:24}}>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:T.textD,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:3}}>Avg Monthly Net</div>
                <div style={{fontSize:14,fontWeight:700,color:avgMonthlyNet>=0?T.green:T.red,fontFamily:T.mono}}>{cu(avgMonthlyNet)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:T.textD,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:3}}>Annualized</div>
                <div style={{fontSize:14,fontWeight:700,color:annualGrowthRatePct>=0?T.green:T.red,fontFamily:T.mono}}>{annualGrowthRatePct>=0?"+":""}{annualGrowthRatePct.toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Key metrics row ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:0,borderBottom:`1px solid ${T.border}`}}>
        <Metric label="Income (MTD)" value={cu(md.inc)} color={T.green} sub={`${cu(dailyAvgIncome)}/day avg`}/>
        <Metric label="Spend (MTD)" value={cu(md.cost)} color={T.red} sub={`${cu(dailyAvgSpend)}/day avg`}/>
        <Metric label="Net (MTD)" value={cu(md.net)} color={md.net>=0?T.green:T.red}/>
        <Metric label="Margin" value={md.inc>0?cp(md.margin):"—"} color={md.margin>0.5?T.green:T.gold}/>
        <Metric label="Runway" value={runwayDays!==null?`${runwayDays}d`:"—"} color={T.blue} sub="liquid ÷ daily spend"/>
        <Metric label="Open Orders" value={openOrders.length} color={T.purple} sub={`${cu(orderProfitTotalUSD)} total profit`}/>
      </div>

      {/* ── BTC Drawdown Stress Test ── */}
      {bp&&(
        <div style={{padding:"16px 16px 0"}}>
          <Card>
            <CardHeader title="BTC Drawdown Stress Test" action={
              <div style={{display:"flex",gap:4,background:"#F3F4F6",borderRadius:6,padding:3}}>
                {[0,-10,-30,-50].map(p=>(
                  <button key={p} onClick={()=>setStressPct(p)}
                    style={{background:stressPct===p?T.text:"transparent",color:stressPct===p?"#fff":T.textM,border:"none",borderRadius:4,padding:"5px 11px",fontSize:11,fontWeight:stressPct===p?600:400,cursor:"pointer",fontFamily:T.mono}}>
                    {p===0?"Now":`${p}%`}
                  </button>
                ))}
              </div>
            }/>
            <div style={{padding:"18px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
              <div>
                <div style={{fontSize:10,color:T.textD,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:5}}>
                  {stressPct===0?"Current BTC Price":`BTC at ${stressPct}%`}
                </div>
                <div style={{fontSize:20,fontWeight:700,color:stressPct<0?T.red:T.text,fontFamily:T.sans}}>{cu(stressBp)}</div>
              </div>
              <div style={{fontSize:20,color:T.textD}}>→</div>
              <div>
                <div style={{fontSize:10,color:T.textD,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:5}}>Net Worth Under Scenario</div>
                <div style={{fontSize:24,fontWeight:800,color:stressPct<0?T.red:T.text,fontFamily:T.sans}}>{cu(stressNw)}</div>
              </div>
              {stressPct!==0&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:T.textD,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:5}}>Impact</div>
                  <div style={{fontSize:16,fontWeight:700,color:T.red,fontFamily:T.mono}}>{cu(stressNw-nw)}</div>
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginTop:2}}>{nw>0?(((stressNw-nw)/nw)*100).toFixed(1):"0"}% of portfolio</div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Portfolio allocation + Cash flow chart ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr",gap:16,padding:"16px 16px 0"}}>
        <Card>
          <CardHeader title="Portfolio Allocation"/>
          {allocation.length===0
            ?<div style={{padding:"40px 20px",textAlign:"center",color:T.textD,fontSize:12,fontFamily:T.mono}}>No balances yet.</div>
            :<>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={allocation} cx="50%" cy="50%" innerRadius={38} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {allocation.map((a,i)=><Cell key={i} fill={a.color}/>)}
                  </Pie>
                  <Tooltip formatter={v=>cu(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{padding:"0 18px 16px",display:"flex",flexDirection:"column",gap:6}}>
                {allocation.map(a=>(
                  <div key={a.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12}}>
                    <span style={{display:"flex",alignItems:"center",gap:7,color:T.textS,fontFamily:T.mono}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:a.color}}/>
                      {a.name}
                    </span>
                    <span style={{fontFamily:T.mono,color:T.textM}}>{cu(a.value,0)} <span style={{color:T.textD}}>({allocTotal>0?(a.value/allocTotal*100).toFixed(0):0}%)</span></span>
                  </div>
                ))}
              </div>
            </>
          }
        </Card>
 
        <Card>
          <CardHeader title="Cash Flow · Last 6 Months"/>
          {nwTrend.every(m=>m.income===0&&m.cost===0)
            ?<div style={{padding:"40px 20px",textAlign:"center",color:T.textD,fontSize:12,fontFamily:T.mono}}>No data yet.</div>
            :<div style={{padding:"12px 0 8px"}}>
              <ResponsiveContainer width="100%" height={185}>
                <BarChart data={nwTrend} barGap={3}>
                  <XAxis dataKey="month" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:T.textD,fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="income" fill={T.green} fillOpacity={0.15} stroke={T.green} strokeWidth={1.5} radius={[3,3,0,0]} name="Income"/>
                  <Bar dataKey="cost"   fill={T.red} fillOpacity={0.15} stroke={T.red}   strokeWidth={1.5} radius={[3,3,0,0]} name="Spend"/>
                  <Bar dataKey="net"    fill={T.blue} fillOpacity={0.15} stroke={T.blue}  strokeWidth={1.5} radius={[3,3,0,0]} name="Net"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          }
        </Card>
      </div>
 
      {/* ── Accounts + Category snapshot ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,padding:"12px 16px 0"}}>
        <Card>
          <CardHeader title="Accounts"/>
          <Pill label="MetaMask BTC"  value={cbt(w.metamask_btc)}  color={T.gold}/>
          <Pill label="Coinbase BTC"  value={cbt(w.coinbase_btc)}  color={T.gold}/>
          <Pill label="Coinbase USDT" value={cu(w.coinbase_usdt)}  color={T.green}/>
          <Pill label="MetaMask USDT" value={cu(w.metamask_usdt)}  color={T.green}/>
          <Pill label="UOB SGD"       value={csg(w.uob_sgd)}       color={T.blue}/>
          <Pill label="Revolut SGD"   value={csg(w.revolut_sgd)}   color={T.blue}/>
          <Pill label="BCA IDR"       value={cid(w.bca_idr)}       color={T.purple}/>
        </Card>
 
        <Card>
          <CardHeader title="Top Spend Categories (MTD)"/>
          {catSnapshot.length===0
            ?<div style={{padding:"24px 20px",color:T.textD,fontSize:12,fontFamily:T.mono}}>No expenses logged this month.</div>
            :<div style={{padding:"16px 20px"}}>
              {catSnapshot.map((c,i)=>{
                const pctVal=md.cost>0?c.value/md.cost:0;
                return(
                  <div key={c.name} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5,fontFamily:T.mono}}>
                      <span style={{color:T.textS}}>{c.name}</span>
                      <span style={{color:PIE_COLORS[i%PIE_COLORS.length],fontWeight:600}}>{cu(c.value)} <span style={{color:T.textD,fontWeight:400}}>({(pctVal*100).toFixed(0)}%)</span></span>
                    </div>
                    <div style={{height:4,background:"#F3F4F6",borderRadius:2}}>
                      <div style={{height:4,background:PIE_COLORS[i%PIE_COLORS.length],borderRadius:2,width:Math.min(100,pctVal*100)+"%"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </Card>
      </div>
 
      {/* ── Recent activity + Open orders ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,padding:"12px 16px 0"}}>
        <Card>
          <CardHeader title="Recent Activity"/>
          {activity.length===0&&<div style={{padding:"24px 20px",color:T.textD,fontSize:12,fontFamily:T.mono}}>No activity yet.</div>}
          {activity.map((a,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 18px",borderBottom:`1px solid #F9FAFB`}}>
              <div style={{width:26,height:26,borderRadius:6,background:ACT_COLOR[a.type]+"12",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:ACT_COLOR[a.type],flexShrink:0}}>
                {ACT_ICON[a.type]}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,color:T.textS,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.label}</div>
                <div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginTop:1}}>{a.date} · {a.sub}</div>
              </div>
              <div style={{fontSize:12,fontWeight:600,color:ACT_COLOR[a.type],fontFamily:T.mono,flexShrink:0}}>
                {a.type==="income"?"+":a.type==="expense"?"-":""}{cu(Math.abs(a.amountUSD),0)}
              </div>
            </div>
          ))}
        </Card>
 
        <Card>
          <CardHeader title="Open Orders" action={<span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{cu(monthOrderProfitUSD)} this month</span>}/>
          {openOrders.length===0&&<div style={{padding:"24px 20px",color:T.textD,fontSize:12,fontFamily:T.mono}}>No open orders.</div>}
          {openOrders.slice(0,5).map(o=>{
            const currency=o.currency||"BTC";
            const profit=parseFloat(o.saleBTC||0)-parseFloat(o.costBTC||0);
            const profitUSD=currency==="BTC"?profit*(bp||0):profit;
            return(
              <div key={o.id} style={{padding:"10px 18px",borderBottom:`1px solid #F9FAFB`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:12,color:T.textS,fontWeight:500}}>{o.client}</div>
                    <div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginTop:1}}>{o.vendor} · {o.date}{o.platform?` · ${o.platform}`:""}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}>
                    <div style={{fontSize:12,color:T.green,fontWeight:700,fontFamily:T.mono}}>{currency==="USDT"?"$"+profit.toFixed(2):cbt(profit)}</div>
                    <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>{cu(profitUSD)}</div>
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
const CAT_COLORS = {
  "Dad":"#DC2626","Mom":"#EA580C","Sam":"#D97706","Glenn":"#65A30D",
  "Personal":"#0891B2","Dating":"#7C3AED","Gas":"#6B7280","Gear":"#1D4ED8",
  "Miscellaneous":"#9CA3AF","Family":"#16A34A","Debt Repayment":"#111827",
  "Business Reinvestment":"#B45309","Groceries":"#059669",
  "Transfer":"#2563EB","Dropshipping":"#16A34A",
};
function catColor(cat){ return CAT_COLORS[cat]||T.textM; }
 
function Ledger({st,bp,onDelete,onEdit,onBulkRecategorize}){
  const[typeF,setTypeF]=useState("all");
  const[catF,setCatF]=useState("all");
  const[tagF,setTagF]=useState("all");
  const[monthF,setMonthF]=useState("all");
  const[search,setSearch]=useState("");
  const[editingId,setEditingId]=useState(null);
  const[editDraft,setEditDraft]=useState({});
  const[selectMode,setSelectMode]=useState(false);
  const[selected,setSelected]=useState(new Set());
  const[bulkCat,setBulkCat]=useState("");
  const[bulkTag,setBulkTag]=useState("");
  const sel={background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:6,padding:"7px 12px",fontSize:12,fontFamily:T.mono,outline:"none",cursor:"pointer"};
  const editInp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"5px 8px",fontSize:12,fontFamily:T.mono,outline:"none"};

  function startEdit(e){
    setEditingId(e.id);
    setEditDraft({amount:e.amount,currency:e.currency,category:e.category||"",tag:e.tag||"",account:e.account||"",date:e.date,label:e.label||""});
  }
  function saveEdit(original){
    onEdit(original,{...editDraft,amount:Math.abs(parseFloat(editDraft.amount)||0)});
    setEditingId(null);
  }
  function toggleSelected(id){
    setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});
  }
  function applyBulk(){
    if(!bulkCat||selected.size===0)return;
    onBulkRecategorize(Array.from(selected),bulkCat,bulkTag||tagsFor(bulkCat)[tagsFor(bulkCat).length-1]);
    setSelected(new Set());
    setBulkCat("");setBulkTag("");
    setSelectMode(false);
  }

  const{ledger,rates}=st;
  const months=Array.from(new Set(ledger.map(e=>e.date?.slice(0,7)).filter(Boolean))).sort().reverse();

  const filtered=ledger.filter(e=>{
    const tOk=typeF==="all"||e.type===typeF;
    const cOk=catF==="all"||e.category===catF;
    const gOk=tagF==="all"||e.tag===tagF;
    const mOk=monthF==="all"||e.date?.startsWith(monthF);
    const sOk=!search.trim()||
      (e.label||"").toLowerCase().includes(search.toLowerCase())||
      (e.category||"").toLowerCase().includes(search.toLowerCase())||
      (e.tag||"").toLowerCase().includes(search.toLowerCase())||
      (e.account||"").toLowerCase().includes(search.toLowerCase());
    return tOk&&cOk&&gOk&&mOk&&sOk;
  });

  // Summary stats for filtered set
  const incTotal=filtered.filter(e=>e.type==="income").reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const expTotal=filtered.filter(e=>e.type==="expense").reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const trfCount=filtered.filter(e=>e.type==="transfer").length;

  // Category summary (expenses only) for the current filter set
  const catSummary=EXPENSE_CATS.map(c=>({
    name:c,
    value:filtered.filter(e=>e.category===c&&e.type==="expense").reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0),
    count:filtered.filter(e=>e.category===c&&e.type==="expense").length,
  })).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);

  // Tag drill-down for the currently active category (or across all expenses if none selected)
  const tagScope=catF!=="all"?ledger.filter(e=>e.category===catF&&e.type==="expense"):ledger.filter(e=>e.type==="expense"&&catSummary.some(c=>c.name===e.category));
  const tagSummary=(()=>{
    if(catF==="all")return[];
    const byTag={};
    tagScope.forEach(e=>{
      const t=e.tag||"Other";
      byTag[t]=(byTag[t]||0)+toUSD(e.amount,e.currency,rates,bp);
    });
    return Object.entries(byTag).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  })();

  return(
    <div style={{padding:"20px 16px"}}>

      {/* Summary bar */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:0,marginBottom:16,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <Metric label="Income" value={cu(incTotal)} color={T.green} sub={`${filtered.filter(e=>e.type==="income").length} entries`}/>
        <Metric label="Expenses" value={cu(expTotal)} color={T.red} sub={cid(expTotal*(rates.USDIDR||16200))}/>
        <Metric label="Net" value={cu(incTotal-expTotal)} color={incTotal-expTotal>=0?T.green:T.red}/>
        <Metric label="Transfers" value={trfCount} color={T.blue}/>
      </div>

      {/* Category quick-filter chips */}
      {catSummary.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Spend by Category</div>
            <button onClick={()=>{setSelectMode(v=>!v);setSelected(new Set());}}
              style={{background:selectMode?T.text:"none",color:selectMode?"#fff":T.textD,border:selectMode?"none":`1px solid ${T.border}`,borderRadius:4,padding:"3px 10px",fontSize:10,fontFamily:T.mono,cursor:"pointer",letterSpacing:"0.06em"}}>
              {selectMode?"Cancel Select":"Select to Recategorize"}
            </button>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {catSummary.map(c=>{
              const active=catF===c.name;
              return(
                <button key={c.name} onClick={()=>{setCatF(active?"all":c.name);setTagF("all");}}
                  style={{display:"flex",alignItems:"center",gap:7,background:active?catColor(c.name):T.white,border:`1px solid ${active?catColor(c.name):T.border}`,borderRadius:20,padding:"6px 12px 6px 8px",cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:active?"#fff":catColor(c.name),flexShrink:0}}/>
                  <span style={{fontSize:11,color:active?"#fff":T.textS,fontFamily:T.mono,fontWeight:500}}>{c.name}</span>
                  <span style={{fontSize:11,color:active?"#fff":T.textD,fontFamily:T.mono}}>{cu(c.value,0)}</span>
                </button>
              );
            })}
          </div>

          {/* Tag drill-down — appears once a category is selected */}
          {catF!=="all"&&tagSummary.length>0&&(
            <div style={{marginTop:10,paddingLeft:4,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>↳ breakdown:</span>
              {tagSummary.map(t=>{
                const active=tagF===t.name;
                return(
                  <button key={t.name} onClick={()=>setTagF(active?"all":t.name)}
                    style={{background:active?"#F3F4F6":"transparent",border:`1px solid ${active?T.borderS:"transparent"}`,borderRadius:14,padding:"4px 10px",cursor:"pointer",fontSize:10,fontFamily:T.mono,color:T.textM}}>
                    {t.name} <span style={{color:T.textD}}>{cu(t.value,0)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bulk recategorize bar */}
      {selectMode&&selected.size>0&&(
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,padding:"10px 16px"}}>
          <span style={{fontSize:12,color:T.blue,fontWeight:600,fontFamily:T.mono}}>{selected.size} selected</span>
          <select value={bulkCat} onChange={e=>{setBulkCat(e.target.value);setBulkTag("");}} style={sel}>
            <option value="">Set category…</option>
            {EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}
          </select>
          {bulkCat&&(
            <select value={bulkTag} onChange={e=>setBulkTag(e.target.value)} style={sel}>
              <option value="">Set tag…</option>
              {tagsFor(bulkCat).map(t=><option key={t}>{t}</option>)}
            </select>
          )}
          <button onClick={applyBulk} disabled={!bulkCat} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"7px 16px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Apply to {selected.size}</button>
        </div>
      )}

      {/* Filters */}
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search description, category, tag, account..."
          style={{...sel,flex:1,minWidth:200,cursor:"text"}}/>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={sel}>
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="transfer">Transfer</option>
        </select>
        <select value={catF} onChange={e=>{setCatF(e.target.value);setTagF("all");}} style={sel}>
          <option value="all">All categories</option>
          {EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={monthF} onChange={e=>setMonthF(e.target.value)} style={sel}>
          <option value="all">All months</option>
          {months.map(m=><option key={m} value={m}>{MONTHS_SHORT[parseInt(m.split("-")[1])-1]} {m.split("-")[0]}</option>)}
        </select>
        {(typeF!=="all"||catF!=="all"||tagF!=="all"||monthF!=="all"||search)&&(
          <button onClick={()=>{setTypeF("all");setCatF("all");setTagF("all");setMonthF("all");setSearch("");}}
            style={{background:"none",border:"none",color:T.textD,fontSize:11,fontFamily:T.mono,cursor:"pointer",textDecoration:"underline"}}>
            Clear filters
          </button>
        )}
        <span style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginLeft:"auto"}}>{filtered.length} entries</span>
      </div>

      {/* Entries list */}
      {filtered.length===0?(
        <Card style={{padding:"48px 24px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:10,color:T.textD}}>≡</div>
          <div style={{color:T.textD,fontSize:13,fontFamily:T.mono}}>No entries match your filters.</div>
        </Card>
      ):(
        <Card>
          {filtered.map((e,i)=>{
            const usd=toUSD(e.amount,e.currency,rates,bp);
            const idr=usd*(rates.USDIDR||16200);
            const color=e.type==="income"?T.green:e.type==="transfer"?T.blue:T.red;
            const catDot=e.category?catColor(e.category):T.textD;
            const isEditing=editingId===e.id;
            const isChecked=selected.has(e.id);

            if(isEditing){
              return(
                <div key={e.id} style={{padding:"14px 20px",borderBottom:i<filtered.length-1?`1px solid #F9FAFB`:"none",background:"#FAFBFC"}}>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:10}}>
                    <input value={editDraft.label} onChange={ev=>setEditDraft(d=>({...d,label:ev.target.value}))} placeholder="Description" style={editInp}/>
                    <input type="number" step="any" value={editDraft.amount} onChange={ev=>setEditDraft(d=>({...d,amount:ev.target.value}))} style={editInp}/>
                    <select value={editDraft.currency} onChange={ev=>setEditDraft(d=>({...d,currency:ev.target.value}))} style={editInp}>
                      {["BTC","USDT","SGD","IDR","USD"].map(c=><option key={c}>{c}</option>)}
                    </select>
                    {e.type!=="transfer"?(
                      <select value={editDraft.category} onChange={ev=>setEditDraft(d=>({...d,category:ev.target.value,tag:tagsFor(ev.target.value)[tagsFor(ev.target.value).length-1]}))} style={editInp}>
                        <option value="">—</option>
                        {EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}
                      </select>
                    ):<div/>}
                    {e.type!=="transfer"&&editDraft.category?(
                      <select value={editDraft.tag} onChange={ev=>setEditDraft(d=>({...d,tag:ev.target.value}))} style={editInp}>
                        {tagsFor(editDraft.category).map(t=><option key={t}>{t}</option>)}
                      </select>
                    ):<div/>}
                    <input type="date" value={editDraft.date} onChange={ev=>setEditDraft(d=>({...d,date:ev.target.value}))} style={editInp}/>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>saveEdit(e)} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"6px 16px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Save</button>
                    <button onClick={()=>setEditingId(null)} style={{background:T.white,color:T.textM,border:`1px solid ${T.borderS}`,borderRadius:5,padding:"6px 14px",fontSize:11,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
                  </div>
                </div>
              );
            }

            return(
              <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 20px",borderBottom:i<filtered.length-1?`1px solid #F9FAFB`:"none",transition:"background 0.1s",background:isChecked?"#EFF6FF":"transparent"}}>
                {selectMode&&(
                  <input type="checkbox" checked={isChecked} onChange={()=>toggleSelected(e.id)} style={{width:15,height:15,cursor:"pointer",accentColor:T.blue,flexShrink:0}}/>
                )}

                {/* Type icon */}
                <div style={{width:34,height:34,borderRadius:8,background:color+"12",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,color}}>
                  {e.type==="income"?"↓":e.type==="transfer"?"⇄":"↑"}
                </div>

                {/* Description + meta */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:T.textS,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {e.label||e.category||"—"}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>{e.date}</span>
                    {e.category&&(
                      <span style={{display:"flex",alignItems:"center",gap:3}}>
                        <span style={{fontSize:10,color:T.textD}}>·</span>
                        <div style={{width:5,height:5,borderRadius:"50%",background:catDot}}/>
                        <span style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>{e.category}</span>
                      </span>
                    )}
                    {e.tag&&(
                      <span style={{fontSize:9,color:catDot,background:catDot+"12",border:`1px solid ${catDot}25`,borderRadius:8,padding:"1px 6px",fontFamily:T.mono}}>{e.tag}</span>
                    )}
                    {e.account&&(
                      <span style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>· {e.account}</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:700,color,fontFamily:T.mono}}>
                    {e.type==="income"?"+":e.type==="transfer"?"":"-"}{e.amount} {e.currency}
                  </div>
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginTop:1}}>
                    {cu(usd)}{e.type==="expense"&&` · ${cid(idr)}`}
                  </div>
                </div>

                {/* Edit + Delete */}
                {!selectMode&&<>
                  <button onClick={()=>startEdit(e)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:13,flexShrink:0,padding:"0 2px"}}>✎</button>
                  <button onClick={()=>onDelete(e.id)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:16,flexShrink:0,padding:"0 2px",lineHeight:1}}>×</button>
                </>}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarView({st,bp,onSaveTarget}){
  const[year,setYear]=useState(2026);
  const[editingTarget,setEditingTarget]=useState(false);
  const{ledger,rates,wallets:w}=st;
  const thisM=new Date().toISOString().slice(0,7);
  const today=new Date();
  const isCurrentYear=year===today.getFullYear();

  const netWorthTarget=st.netWorthTarget||100000;
  const[targetDraft,setTargetDraft]=useState(netWorthTarget);

  const nw=netWorth(w,bp,rates); // live current net worth, independent of browsed year

  // Pace + trajectory always computed against the REAL current year, regardless of which year is browsed
  const realYear=today.getFullYear();
  const monthsElapsed=today.getMonth()+1;
  const monthsRemaining=12-monthsElapsed;
  const curYearMonths=MONTH_KEYS.map(mk=>buildMonth(`${realYear}-${mk}`,ledger,bp,rates));
  const ytdNet=curYearMonths.slice(0,monthsElapsed).reduce((s,m)=>s+m.net,0);
  const avgMonthlyNet=monthsElapsed>0?ytdNet/monthsElapsed:0;
  const startOfYearNW=nw-ytdNet; // approx Jan 1 net worth, backing out this year's net income flow
  const gapUSD=netWorthTarget-nw;
  const targetReached=nw>=netWorthTarget;
  const requiredMonthlyNet=monthsRemaining>0?gapUSD/monthsRemaining:0;
  const projectedYearEndNW=nw+avgMonthlyNet*monthsRemaining;
  const onTrack=targetReached||projectedYearEndNW>=netWorthTarget;
  const overallProgressPct=netWorthTarget>0?Math.min(1,nw/netWorthTarget):0;

  // Cumulative net worth trajectory vs the linear glide path needed to hit target by Dec 31
  const trajectoryData=curYearMonths.map((m,i)=>{
    const cumNet=curYearMonths.slice(0,i+1).reduce((s,mm)=>s+mm.net,0);
    const actualNW=startOfYearNW+cumNet;
    const requiredNW=startOfYearNW+(netWorthTarget-startOfYearNW)*((i+1)/12);
    return{month:MONTHS_SHORT[i],actual:i<monthsElapsed?Math.round(actualNW):null,required:Math.round(requiredNW),hasData:i<monthsElapsed};
  });

  function monthStatus(i){
    if(i>=monthsElapsed) return null;
    const actual=trajectoryData[i].actual;
    const required=trajectoryData[i].required;
    if(actual>=required) return {label:"ON TRACK",color:T.green,bg:"#F0FDF4"};
    if(actual>=required*0.9) return {label:"CLOSE",color:T.gold,bg:"#FEF3C7"};
    return {label:"BEHIND",color:T.red,bg:"#FEF2F2"};
  }

  function saveTarget(){
    onSaveTarget(parseFloat(targetDraft)||0);
    setEditingTarget(false);
  }

  const yearData=MONTH_KEYS.map((mk,i)=>{const ym=`${year}-${mk}`;const md=buildMonth(ym,ledger,bp,rates);return{...md,month:MONTHS_SHORT[i],ym,hasData:md.inc>0||md.cost>0};});
  const totals=yearData.reduce((acc,m)=>({inc:acc.inc+m.inc,cost:acc.cost+m.cost}),{inc:0,cost:0});

  const th={textAlign:"right",padding:"9px 12px",color:T.textM,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC",whiteSpace:"nowrap"};
  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"7px 10px",fontSize:14,fontWeight:700,fontFamily:T.mono,outline:"none",width:180};

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

      {/* Net Worth Target card */}
      <Card style={{marginBottom:16}}>
        <div style={{padding:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16,marginBottom:16}}>
            <div>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:6}}>Net Worth Target · Dec 31, {realYear}</div>
              {editingTarget?(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input type="number" step="1000" value={targetDraft} onChange={e=>setTargetDraft(e.target.value)} style={inp}/>
                  <button onClick={saveTarget} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"7px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Save</button>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                  <div style={{fontSize:28,fontWeight:800,color:T.text,fontFamily:T.sans}}>{cu(netWorthTarget)}</div>
                  <button onClick={()=>{setTargetDraft(netWorthTarget);setEditingTarget(true);}} style={{background:"none",border:"none",color:T.textD,fontSize:11,fontFamily:T.mono,cursor:"pointer",textDecoration:"underline"}}>edit</button>
                </div>
              )}
              <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:4}}>Current: {cu(nw)} {targetReached?"· target reached ✓":`· ${cu(Math.abs(gapUSD))} ${gapUSD>=0?"to go":"over"}`}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:6}}>Projected Year-End</div>
              <div style={{fontSize:24,fontWeight:800,color:onTrack?T.green:T.red,fontFamily:T.sans}}>{cu(projectedYearEndNW)}</div>
              <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:4}}>at {cu(avgMonthlyNet)}/mo current pace</div>
            </div>
          </div>

          <div style={{height:8,background:"#F3F4F6",borderRadius:4,overflow:"hidden",marginBottom:8}}>
            <div style={{height:8,background:targetReached?T.green:onTrack?T.gold:T.red,borderRadius:4,width:Math.min(100,overallProgressPct*100)+"%",transition:"width 0.3s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontFamily:T.mono,marginBottom:16}}>
            <span style={{color:T.textM}}>{cu(nw)} of {cu(netWorthTarget)} target</span>
            <span style={{color:targetReached?T.green:onTrack?T.gold:T.red,fontWeight:600}}>{(overallProgressPct*100).toFixed(0)}%</span>
          </div>

          {!targetReached&&(
            <div style={{background:onTrack?"#F0FDF4":"#FEF2F2",border:`1px solid ${onTrack?"#BBF7D0":"#FECACA"}`,borderRadius:8,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontSize:12,fontWeight:700,color:onTrack?T.green:T.red,fontFamily:T.sans}}>
                  {onTrack?"On track to hit your target":"Behind pace — need to pick it up"}
                </div>
                <div style={{fontSize:11,color:T.textM,fontFamily:T.mono,marginTop:3}}>
                  {monthsRemaining>0
                    ? `Need ${cu(requiredMonthlyNet)}/mo net for the remaining ${monthsRemaining} month${monthsRemaining>1?"s":""} to close the gap`
                    : "Final month of the year"}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>vs current pace</div>
                <div style={{fontSize:14,fontWeight:700,color:T.text,fontFamily:T.mono}}>{cu(avgMonthlyNet)}/mo</div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Net worth trajectory chart */}
      <Card style={{marginBottom:16}}>
        <CardHeader title="Net Worth Trajectory vs Required Pace"/>
        <div style={{padding:"12px 0 8px"}}>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={trajectoryData} barGap={3}>
              <XAxis dataKey="month" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.textD,fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="actual" fill={T.green} fillOpacity={0.15} stroke={T.green} strokeWidth={1.5} radius={[3,3,0,0]} name="Actual Net Worth"/>
              <Bar dataKey="required" fill={T.textD} fillOpacity={0.12} stroke={T.textD} strokeWidth={1} strokeDasharray="3 3" radius={[3,3,0,0]} name="Required Pace"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card style={{marginBottom:16,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono,minWidth:750}}>
          <thead><tr>
            <th style={{...th,textAlign:"left",padding:"9px 16px"}}>Month</th>
            {isCurrentYear&&<th style={{...th,textAlign:"center"}}>Status</th>}
            {["Earnings","Costs","Net","Margin"].map(h=><th key={h} style={th}>{h}</th>)}
            {isCurrentYear&&<th style={th}>Cum. Net Worth</th>}
          </tr></thead>
          <tbody>
            {yearData.map((m,i)=>{
              const isCur=m.ym===thisM;
              const status=isCurrentYear?monthStatus(i):null;
              return(
                <tr key={m.ym} style={{borderBottom:`1px solid #F9FAFB`,background:isCur?"#F0F9FF":"transparent",opacity:m.hasData?1:0.25}}>
                  <td style={{padding:"10px 16px",color:isCur?T.blue:T.textS,fontWeight:isCur?700:400,borderLeft:isCur?`3px solid ${T.blue}`:"none"}}>{m.month}{isCur?" ●":""}</td>
                  {isCurrentYear&&(
                    <td style={{padding:"10px 12px",textAlign:"center"}}>
                      {status&&<span style={{background:status.bg,color:status.color,fontSize:9,fontWeight:700,letterSpacing:"0.06em",padding:"2px 7px",borderRadius:10,fontFamily:T.mono}}>{status.label}</span>}
                    </td>
                  )}
                  <td style={{padding:"10px 12px",color:T.green,textAlign:"right",fontWeight:600}}>{m.hasData?cu(m.inc):"—"}</td>
                  <td style={{padding:"10px 12px",color:T.red,textAlign:"right"}}>{m.cost>0?cu(m.cost):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.net>=0?T.green:T.red,textAlign:"right",fontWeight:600}}>{m.hasData?cu(m.net):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.margin>0.5?T.green:T.textM,textAlign:"right"}}>{m.hasData?cp(m.margin):"—"}</td>
                  {isCurrentYear&&(
                    <td style={{padding:"10px 12px",color:T.textM,textAlign:"right"}}>{i<monthsElapsed?cu(trajectoryData[i].actual):"—"}</td>
                  )}
                </tr>
              );
            })}
            <tr style={{borderTop:`2px solid ${T.border}`,background:"#FAFBFC"}}>
              <td style={{padding:"11px 16px",fontWeight:700,color:T.text}}>TOTAL {year}</td>
              {isCurrentYear&&<td/>}
              <td style={{padding:"11px 12px",color:T.green,textAlign:"right",fontWeight:700}}>{cu(totals.inc)}</td>
              <td style={{padding:"11px 12px",color:T.red,textAlign:"right",fontWeight:700}}>{cu(totals.cost)}</td>
              <td style={{padding:"11px 12px",color:totals.inc-totals.cost>=0?T.green:T.red,textAlign:"right",fontWeight:700}}>{cu(totals.inc-totals.cost)}</td>
              <td style={{padding:"11px 12px",color:T.green,textAlign:"right",fontWeight:700}}>{cp(totals.inc>0?(totals.inc-totals.cost)/totals.inc:0)}</td>
              {isCurrentYear&&<td style={{padding:"11px 12px",color:T.text,textAlign:"right",fontWeight:700}}>{cu(nw)}</td>}
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
const PLATFORM_OPTIONS = ["Discord","Telegram","WhatsApp","Instagram","Email","Signal"];
const PRESET_ITEMS = ["Rt20","Rt15","Cd5","Glow70","Tsm10","Ba10","Bb10"];
 
function Orders({st,bp,onUpdateOrder,onAddOrder,onDeleteOrder}){
  const{orders}=st;
  const[showForm,setShowForm]=useState(false);
  const[vendors,setVendors]=useState(["Violet","Fiona","Zhongshui"]);
  const[newVendor,setNewVendor]=useState("");
  const[showVendorInput,setShowVendorInput]=useState(false);
  const[period,setPeriod]=useState("all"); // all | week | month | 90d
  const[selectedMonth,setSelectedMonth]=useState(new Date().toISOString().slice(0,7));
  const[statusF,setStatusF]=useState("all"); // all | pending | delivered
  const[search,setSearch]=useState("");
  const[sortBy,setSortBy]=useState("date"); // date | profit | client

  // Customer history — processed from ALL orders (not just the current filter view),
  // so "returning" reflects the customer's real lifetime order count.
  function normalizeName(n){ return (n||"").trim().toLowerCase(); }
  const customerCounts=(()=>{
    const counts={};
    orders.forEach(o=>{
      const n=normalizeName(o.client);
      if(!n)return;
      counts[n]=(counts[n]||0)+1;
    });
    return counts;
  })();

  // Big-ticket orders — a single order at/over the threshold, regardless of that
  // customer's other order history. Computed live from every order (old and new),
  // so it applies to existing data automatically.
  const VIP_THRESHOLD_USD=1000;
  function isBigTicket(o){ return orderStats(o).saleUSD>=VIP_THRESHOLD_USD; }
  const bigTicketOrders=orders.filter(o=>isBigTicket(o)).sort((a,b)=>orderStats(b).saleUSD-orderStats(a).saleUSD);

  const emptyForm={vendor:vendors[0]||"Violet",client:"",platform:"",items:"",currency:"BTC",costBTC:"",saleBTC:"",date:new Date().toISOString().slice(0,10)};
  const[form,setForm]=useState(emptyForm);

  // Currency-aware stats: amounts are in the order's OWN currency (BTC or USDT).
  // USD equivalent only needs the live BTC price when the order is BTC-denominated —
  // USDT is treated as ≈1:1 with USD.
  function orderStats(o){
    const currency=o.currency||"BTC";
    const cost=parseFloat(o.costBTC||o.cost||0);
    const sale=parseFloat(o.saleBTC||o.salePrice||0);
    const profit=sale-cost;
    const profitUSD=currency==="BTC"?profit*(bp||0):profit;
    const saleUSD=currency==="BTC"?sale*(bp||0):sale;
    const margin=sale>0?profit/sale:0;
    return{currency,cost,sale,profit,profitUSD,saleUSD,margin};
  }
  function fmtAmt(n,currency){
    if(currency==="USDT") return "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
    return Number(n||0).toFixed(6)+" ₿";
  }

  // ── Customer & order analytics — dropshipping-focused trends over last 6 months ──
  // A customer's "first" order (chronologically, across ALL their orders) marks
  // their acquisition — every order after that counts as returning behavior.
  const firstOrderIds=(()=>{
    const byCustomer={};
    orders.forEach(o=>{
      const n=normalizeName(o.client);
      if(!n)return;
      if(!byCustomer[n])byCustomer[n]=[];
      byCustomer[n].push(o);
    });
    const ids=new Set();
    Object.values(byCustomer).forEach(list=>{
      const sorted=[...list].sort((a,b)=>(a.date||"").localeCompare(b.date||""));
      if(sorted[0])ids.add(sorted[0].id);
    });
    return ids;
  })();
  const TICKET_THRESHOLD=600;
  const last6Months=Array.from({length:6},(_,i)=>{
    const d=new Date();
    d.setMonth(d.getMonth()-(5-i));
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
  const monthlyOrderTrend=last6Months.map(ym=>{
    const monthOrders=orders.filter(o=>o.date?.startsWith(ym));
    const newCount=monthOrders.filter(o=>firstOrderIds.has(o.id)).length;
    const returningCount=monthOrders.length-newCount;
    const small=monthOrders.filter(o=>orderStats(o).saleUSD<TICKET_THRESHOLD).length;
    const big=monthOrders.length-small;
    const totalSaleUSD=monthOrders.reduce((s,o)=>s+orderStats(o).saleUSD,0);
    const avgTicket=monthOrders.length>0?totalSaleUSD/monthOrders.length:0;
    const newPct=monthOrders.length>0?(newCount/monthOrders.length*100):0;
    return{month:MONTHS_SHORT[parseInt(ym.split("-")[1])-1],ym,total:monthOrders.length,new:newCount,returning:returningCount,small,big,avgTicket,newPct};
  });
  const hasOrderHistory=monthlyOrderTrend.some(m=>m.total>0);

  // ── Period filter ──
  function inPeriod(dateStr){
    if(period==="all"||!dateStr)return true;
    const d=new Date(dateStr);
    const now=new Date();
    const diffDays=(now-d)/(1000*60*60*24);
    if(period==="week")return diffDays<=7;
    if(period==="month")return dateStr.slice(0,7)===selectedMonth; // specific calendar month, chosen from dropdown
    if(period==="90d")return diffDays<=90;
    return true;
  }

  const filtered=orders.filter(o=>{
    const pOk=inPeriod(o.date);
    const sOk=statusF==="all"||(statusF==="pending"&&!o.delivered)||(statusF==="delivered"&&o.delivered);
    const qOk=!search.trim()||
      (o.client||"").toLowerCase().includes(search.toLowerCase())||
      (o.vendor||"").toLowerCase().includes(search.toLowerCase())||
      (o.items||"").toLowerCase().includes(search.toLowerCase())||
      (o.platform||"").toLowerCase().includes(search.toLowerCase());
    return pOk&&sOk&&qOk;
  }).sort((a,b)=>{
    if(sortBy==="profit"){
      const sa=orderStats(a).profitUSD, sb=orderStats(b).profitUSD;
      return sb-sa;
    }
    if(sortBy==="client")return (a.client||"").localeCompare(b.client||"");
    return (b.date||"").localeCompare(a.date||"");
  });

  // Totals split by currency (native units don't mix), plus a combined USD figure that always works
  const totals=filtered.reduce((acc,o)=>{
    const s=orderStats(o);
    const bucket=s.currency==="USDT"?acc.usdt:acc.btc;
    bucket.sale+=s.sale; bucket.cost+=s.cost; bucket.profit+=s.profit;
    acc.profitUSD+=s.profitUSD;
    return acc;
  },{btc:{sale:0,cost:0,profit:0},usdt:{sale:0,cost:0,profit:0},profitUSD:0});
  const totalSaleUSD=totals.btc.sale*(bp||0)+totals.usdt.sale;
  const avgMargin=totalSaleUSD>0?totals.profitUSD/totalSaleUSD:0;
  const pending=filtered.filter(o=>!o.delivered).length;
  const done=filtered.filter(o=>o.delivered).length;

  // Vendor breakdown for filtered set — profit shown in USD since vendors can mix currencies
  const vendorBreakdown={};
  filtered.forEach(o=>{
    const v=o.vendor||"Unknown";
    if(!vendorBreakdown[v])vendorBreakdown[v]={count:0,profitUSD:0};
    vendorBreakdown[v].count++;
    vendorBreakdown[v].profitUSD+=orderStats(o).profitUSD;
  });
  const topVendors=Object.entries(vendorBreakdown).sort((a,b)=>b[1].profitUSD-a[1].profitUSD).slice(0,4);

  function addVendor(){if(!newVendor.trim())return;setVendors(v=>[...v,newVendor.trim()]);setNewVendor("");setShowVendorInput(false);}
  function removeVendor(v){setVendors(vs=>vs.filter(x=>x!==v));}
  function togglePresetItem(code){
    setForm(f=>{
      const parts=f.items.split(",").map(s=>s.trim()).filter(Boolean);
      const idx=parts.findIndex(p=>p===code);
      if(idx>=0){parts.splice(idx,1);}else{parts.push(code);}
      return{...f,items:parts.join(", ")};
    });
  }
  function submitOrder(){
    if(!form.client.trim()||!form.saleBTC)return;
    const newOrder={id:"ORD-"+Date.now(),vendor:form.vendor,client:form.client.trim(),platform:form.platform,items:form.items,currency:form.currency,saleBTC:parseFloat(form.saleBTC)||0,costBTC:parseFloat(form.costBTC)||0,cost:parseFloat(form.costBTC)||0,salePrice:parseFloat(form.saleBTC)||0,btcAmount:parseFloat(form.saleBTC)||0,date:form.date,delivered:false,status:"pending",deliveryDays:null};
    onAddOrder(newOrder);
    setShowForm(false);
    setForm({...emptyForm,vendor:vendors[0]||"Violet"});
  }

  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"8px 10px",fontSize:12,fontFamily:T.mono,outline:"none",width:"100%"};
  const lbl={fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:5,display:"block",fontFamily:T.mono,fontWeight:500};
  const sel={background:T.white,border:`1px solid ${T.borderS}`,color:T.textS,borderRadius:6,padding:"7px 12px",fontSize:12,fontFamily:T.mono,outline:"none",cursor:"pointer"};
  const profitPreview=(parseFloat(form.saleBTC)||0)-(parseFloat(form.costBTC)||0);

  const PERIODS=[["all","All time"],["week","This week"],["month","By month"],["90d","Last 90d"]];
  const availableMonths=(()=>{
    const fromOrders=orders.map(o=>o.date?.slice(0,7)).filter(Boolean);
    const thisM=new Date().toISOString().slice(0,7);
    return Array.from(new Set([thisM,...fromOrders])).sort().reverse();
  })();

  return(
    <div style={{padding:"20px 16px"}}>

      {/* Metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:0,marginBottom:16,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <Metric label="BTC Profit" value={fmtAmt(totals.btc.profit,"BTC")} color={T.gold} sub={bp?cu(totals.btc.profit*bp):"—"}/>
        <Metric label="USDT Profit" value={fmtAmt(totals.usdt.profit,"USDT")} color={T.green}/>
        <Metric label="Combined Profit $" value={cu(totals.profitUSD)} color={T.purple}/>
        <Metric label="Avg Margin" value={cp(avgMargin)} color={T.gold}/>
        <Metric label="Pending" value={pending} color={T.red} sub={`${done} delivered`}/>
        <Metric label="Repeat Customers" value={Object.values(customerCounts).filter(c=>c>1).length} color={T.purple} sub={`of ${Object.keys(customerCounts).length} total`}/>
        <Metric label="Big Ticket (≥$1000)" value={bigTicketOrders.length} color={T.gold} sub="need special assistance"/>
      </div>

      {/* Customer & Order Trends — dropshipping business behavior over last 6 months */}
      {hasOrderHistory&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card>
              <CardHeader title="New vs Returning Customers"/>
              <div style={{padding:"12px 0 8px"}}>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={monthlyOrderTrend} barGap={3}>
                    <XAxis dataKey="month" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:T.textD,fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="new" stackId="cust" fill={T.green} fillOpacity={0.75} radius={[0,0,0,0]} name="New"/>
                    <Bar dataKey="returning" stackId="cust" fill={T.purple} fillOpacity={0.75} radius={[3,3,0,0]} name="Returning"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{padding:"0 20px 14px",display:"flex",gap:16}}>
                <span style={{fontSize:10,color:T.textM,fontFamily:T.mono,display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:T.green}}/>New</span>
                <span style={{fontSize:10,color:T.textM,fontFamily:T.mono,display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:T.purple}}/>Returning</span>
              </div>
            </Card>
            <Card>
              <CardHeader title={`Ticket Size — Small (<$${TICKET_THRESHOLD}) vs Big`}/>
              <div style={{padding:"12px 0 8px"}}>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={monthlyOrderTrend} barGap={3}>
                    <XAxis dataKey="month" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:T.textD,fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="small" stackId="ticket" fill={T.gold} fillOpacity={0.75} radius={[0,0,0,0]} name="Small"/>
                    <Bar dataKey="big" stackId="ticket" fill={T.blue} fillOpacity={0.75} radius={[3,3,0,0]} name="Big"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{padding:"0 20px 14px",display:"flex",gap:16}}>
                <span style={{fontSize:10,color:T.textM,fontFamily:T.mono,display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:T.gold}}/>Small (&lt;${TICKET_THRESHOLD})</span>
                <span style={{fontSize:10,color:T.textM,fontFamily:T.mono,display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:T.blue}}/>Big (≥${TICKET_THRESHOLD})</span>
              </div>
            </Card>
          </div>

          <Card style={{marginBottom:16,overflowX:"auto"}}>
            <CardHeader title="Monthly Comparison"/>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono,minWidth:680}}>
                <thead><tr>
                  <th style={{textAlign:"left",padding:"9px 16px",color:T.textM,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"}}>Month</th>
                  {["Orders","New","Returning","New %","Small","Big","Avg Ticket"].map(h=>(
                    <th key={h} style={{textAlign:"right",padding:"9px 12px",color:T.textM,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {monthlyOrderTrend.map(m=>(
                    <tr key={m.ym} style={{borderBottom:`1px solid #F9FAFB`,opacity:m.total>0?1:0.35}}>
                      <td style={{padding:"9px 16px",color:T.textS,fontWeight:500}}>{m.month}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:T.textM}}>{m.total||"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:T.green}}>{m.total>0?m.new:"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:T.purple}}>{m.total>0?m.returning:"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:m.newPct>=50?T.green:T.gold,fontWeight:600}}>{m.total>0?`${m.newPct.toFixed(0)}%`:"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:T.gold}}>{m.total>0?m.small:"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:T.blue}}>{m.total>0?m.big:"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:T.text,fontWeight:600}}>{m.total>0?cu(m.avgTicket):"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Top vendors this period */}
      {topVendors.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:8}}>Top Vendors</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {topVendors.map(([v,d])=>(
              <div key={v} style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:T.textS,fontWeight:600,fontFamily:T.mono}}>{v}</span>
                <span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{d.count} orders</span>
                <span style={{fontSize:11,color:T.blue,fontWeight:600,fontFamily:T.mono}}>{cu(d.profitUSD)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vendor management bar */}
      <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
        <span style={{fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Vendors:</span>
        {vendors.map(v=>(
          <div key={v} style={{display:"flex",alignItems:"center",gap:4,background:"#F3F4F6",border:`1px solid ${T.border}`,borderRadius:4,padding:"3px 10px"}}>
            <span style={{fontSize:11,color:T.textS,fontFamily:T.mono}}>{v}</span>
            <button onClick={()=>removeVendor(v)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:12,paddingLeft:4,lineHeight:1}}>×</button>
          </div>
        ))}
        {showVendorInput?(
          <div style={{display:"flex",gap:6}}>
            <input value={newVendor} onChange={e=>setNewVendor(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVendor()} placeholder="Vendor name" autoFocus style={{...inp,width:130,padding:"4px 8px"}}/>
            <button onClick={addVendor} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:T.mono}}>Add</button>
            <button onClick={()=>setShowVendorInput(false)} style={{background:"none",border:"none",color:T.textM,cursor:"pointer",fontSize:14}}>×</button>
          </div>
        ):(
          <button onClick={()=>setShowVendorInput(true)} style={{background:"#F3F4F6",border:`1px solid ${T.border}`,color:T.textM,borderRadius:4,padding:"3px 10px",fontSize:10,cursor:"pointer",fontFamily:T.mono}}>+ Add vendor</button>
        )}
      </div>

      {/* New order form */}
      {showForm&&(
        <Card style={{marginBottom:16,padding:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>New Order</div>
            {/* Currency switch */}
            <div style={{display:"flex",gap:4,background:"#F3F4F6",borderRadius:6,padding:3}}>
              {["BTC","USDT"].map(c=>(
                <button key={c} onClick={()=>setForm(f=>({...f,currency:c}))}
                  style={{background:form.currency===c?T.text:"transparent",color:form.currency===c?"#fff":T.textM,border:"none",borderRadius:4,padding:"6px 14px",fontSize:11,fontWeight:form.currency===c?600:400,cursor:"pointer",fontFamily:T.mono}}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:12}}>
            <div><label style={lbl}>Vendor</label>
              <select value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                {vendors.map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Customer</label>
              <input value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} placeholder="e.g. Brooks" style={inp}/>
              {form.client.trim()&&(()=>{
                const cnt=customerCounts[normalizeName(form.client)]||0;
                return cnt>0
                  ?<div style={{fontSize:10,color:T.purple,marginTop:3,fontFamily:T.mono}}>↻ Returning customer — {cnt} previous order{cnt!==1?"s":""}</div>
                  :<div style={{fontSize:10,color:T.green,marginTop:3,fontFamily:T.mono}}>✦ New customer</div>;
              })()}
            </div>
            <div><label style={lbl}>Platform</label>
              <select value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                <option value="">— none —</option>
                {PLATFORM_OPTIONS.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={lbl}>Items</label>
            <input value={form.items} onChange={e=>setForm(f=>({...f,items:e.target.value}))} placeholder="RT10, CU100*2, BA10*3..." style={inp}/>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
              {PRESET_ITEMS.map(code=>{
                const active=form.items.split(",").map(s=>s.trim()).includes(code);
                return(
                  <button key={code} type="button" onClick={()=>togglePresetItem(code)}
                    style={{background:active?T.text:"#F3F4F6",color:active?"#fff":T.textM,border:`1px solid ${active?T.text:T.border}`,borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontFamily:T.mono}}>
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:12}}>
            <div>
              <label style={lbl}>Sale ({form.currency})</label>
              <input type="number" step={form.currency==="BTC"?"0.000001":"0.01"} value={form.saleBTC} onChange={e=>setForm(f=>({...f,saleBTC:e.target.value}))} placeholder={form.currency==="BTC"?"0.005800":"580.00"} style={inp}/>
              {form.saleBTC&&<div style={{fontSize:10,color:T.green,marginTop:3,fontFamily:T.mono}}>≈ {form.currency==="BTC"?(bp?cu(parseFloat(form.saleBTC)*bp):"—"):cu(parseFloat(form.saleBTC))}</div>}
            </div>
            <div>
              <label style={lbl}>Cost ({form.currency})</label>
              <input type="number" step={form.currency==="BTC"?"0.000001":"0.01"} value={form.costBTC} onChange={e=>setForm(f=>({...f,costBTC:e.target.value}))} placeholder={form.currency==="BTC"?"0.004200":"420.00"} style={inp}/>
              {form.costBTC&&<div style={{fontSize:10,color:T.red,marginTop:3,fontFamily:T.mono}}>≈ {form.currency==="BTC"?(bp?cu(parseFloat(form.costBTC)*bp):"—"):cu(parseFloat(form.costBTC))}</div>}
            </div>
            <div>
              <label style={lbl}>Profit (auto)</label>
              <div style={{background:"#F9FAFB",border:`1px solid ${T.border}`,borderRadius:4,padding:"8px 10px",fontSize:12,fontFamily:T.mono,color:profitPreview>0?T.green:T.textD}}>
                {form.saleBTC||form.costBTC?fmtAmt(profitPreview,form.currency):"—"}
              </div>
              {(form.saleBTC||form.costBTC)&&<div style={{fontSize:10,color:T.purple,marginTop:3,fontFamily:T.mono}}>≈ {form.currency==="BTC"?(bp?cu(profitPreview*bp):"—"):cu(profitPreview)}</div>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr",gap:14,marginBottom:16,maxWidth:200}}>
            <div><label style={lbl}>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={submitOrder} disabled={!form.client.trim()||!form.saleBTC} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"9px 24px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Save Order</button>
            <button onClick={()=>{setShowForm(false);setForm({...emptyForm,vendor:vendors[0]||"Violet"});}} style={{background:T.white,color:T.textM,border:`1px solid ${T.borderS}`,borderRadius:5,padding:"9px 16px",fontSize:12,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
          </div>
        </Card>
      )}

      {/* Filter bar */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:4,background:"#F3F4F6",borderRadius:6,padding:3}}>
          {PERIODS.map(([k,label])=>(
            <button key={k} onClick={()=>setPeriod(k)}
              style={{background:period===k?T.white:"transparent",color:period===k?T.text:T.textM,border:"none",borderRadius:4,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:T.mono,fontWeight:period===k?600:400,boxShadow:period===k?"0 1px 2px rgba(0,0,0,0.08)":"none"}}>
              {label}
            </button>
          ))}
        </div>
        {period==="month"&&(
          <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={sel}>
            {availableMonths.map(m=>{
              const d=new Date(m+"-01");
              return<option key={m} value={m}>{MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}</option>;
            })}
          </select>
        )}
        <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={sel}>
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="delivered">Delivered</option>
        </select>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={sel}>
          <option value="date">Sort: Newest</option>
          <option value="profit">Sort: Profit</option>
          <option value="client">Sort: Client</option>
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search client, vendor, items..."
          style={{...sel,flex:1,minWidth:180,cursor:"text"}}/>
      </div>

      {/* Order list */}
      <Card>
        <div style={{padding:"13px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC"}}>
          <span style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500}}>Order Book · {filtered.length} shown</span>
          <button onClick={()=>{setForm({...emptyForm,vendor:vendors[0]||"Violet"});setShowForm(true);}} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>+ New Order</button>
        </div>

        {filtered.length===0&&<div style={{padding:"48px 20px",textAlign:"center",color:T.textD,fontSize:13,fontFamily:T.mono}}>No orders match your filters.</div>}

        {filtered.map((o,i)=>{
          const s=orderStats(o);
          return(
            <div key={o.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",borderBottom:i<filtered.length-1?`1px solid #F9FAFB`:"none",opacity:o.delivered?0.55:1,transition:"opacity 0.2s"}}>
              {/* Delivery toggle */}
              <input type="checkbox" checked={!!o.delivered} onChange={()=>onUpdateOrder(o.id,{delivered:!o.delivered,status:!o.delivered?"delivered":"pending"})}
                style={{width:16,height:16,cursor:"pointer",accentColor:T.text,flexShrink:0}}/>

              {/* Main info */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:13,color:T.textS,fontWeight:600}}>{o.client}</span>
                  {(()=>{const cnt=customerCounts[normalizeName(o.client)]||0;return cnt>1?<Badge color={T.purple}>Returning · {cnt}</Badge>:<Badge color={T.green}>New</Badge>;})()}
                  {isBigTicket(o)&&<Badge color={T.gold}>★ Big Ticket</Badge>}
                  <span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>{o.vendor}</span>
                  <Badge color={s.currency==="USDT"?T.green:T.gold}>{s.currency}</Badge>
                  {o.platform&&<Badge color={T.blue}>{o.platform}</Badge>}
                  {o.delivered&&<Badge color={T.green}>delivered</Badge>}
                </div>
                <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {o.items||"—"} · {o.date}
                </div>
              </div>

              {/* Numbers */}
              <div style={{display:"flex",gap:16,alignItems:"center",flexShrink:0}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>Sale</div>
                  <div style={{fontSize:12,color:T.green,fontWeight:600,fontFamily:T.mono}}>{fmtAmt(s.sale,s.currency)}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>Cost</div>
                  <div style={{fontSize:12,color:T.red,fontFamily:T.mono}}>{fmtAmt(s.cost,s.currency)}</div>
                </div>
                <div style={{textAlign:"right",minWidth:90}}>
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>Profit</div>
                  <div style={{fontSize:13,color:T.blue,fontWeight:700,fontFamily:T.mono}}>{fmtAmt(s.profit,s.currency)}</div>
                  <div style={{fontSize:10,color:T.purple,fontFamily:T.mono}}>{cu(s.profitUSD)}</div>
                </div>
                <div style={{textAlign:"right",minWidth:44}}>
                  <div style={{fontSize:12,color:s.margin>0.2?T.green:T.gold,fontWeight:600,fontFamily:T.mono}}>{cp(s.margin)}</div>
                </div>
              </div>

              <button onClick={()=>onDeleteOrder&&onDeleteOrder(o.id)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:16,flexShrink:0}}>×</button>
            </div>
          );
        })}

        {filtered.length>0&&(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px",borderTop:`2px solid ${T.border}`,background:"#FAFBFC",flexWrap:"wrap",gap:10}}>
            <span style={{fontSize:11,color:T.textM,fontWeight:700,fontFamily:T.mono}}>TOTAL ({filtered.length})</span>
            <div style={{display:"flex",gap:20,alignItems:"baseline",flexWrap:"wrap"}}>
              {totals.btc.sale>0&&<span style={{fontSize:12,color:T.gold,fontWeight:700,fontFamily:T.mono}}>₿ {fmtAmt(totals.btc.profit,"BTC")}</span>}
              {totals.usdt.sale>0&&<span style={{fontSize:12,color:T.green,fontWeight:700,fontFamily:T.mono}}>{fmtAmt(totals.usdt.profit,"USDT")}</span>}
              <span style={{fontSize:13,color:T.purple,fontWeight:700,fontFamily:T.mono}}>{cu(totals.profitUSD)}</span>
              <span style={{fontSize:12,color:T.gold,fontWeight:700,fontFamily:T.mono}}>{cp(avgMargin)}</span>
            </div>
          </div>
        )}
      </Card>

      {totals.profitUSD>0&&(
        <div style={{marginTop:10,background:T.white,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <span style={{fontSize:10,color:T.textD,fontFamily:T.mono,letterSpacing:"0.1em",textTransform:"uppercase"}}>Combined Profit</span>
          <div style={{display:"flex",gap:20,alignItems:"baseline",flexWrap:"wrap"}}>
            {totals.btc.profit>0&&<span style={{fontSize:11,color:T.textM,fontFamily:T.mono}}>{fmtAmt(totals.btc.profit,"BTC")}</span>}
            {totals.usdt.profit>0&&<span style={{fontSize:11,color:T.textM,fontFamily:T.mono}}>{fmtAmt(totals.usdt.profit,"USDT")}</span>}
            <span style={{fontSize:14,color:T.purple,fontWeight:700,fontFamily:T.mono}}>= {cu(totals.profitUSD)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
// ── Analytics ─────────────────────────────────────────────────────────────────
function Analytics({st,bp}){
  const{ledger,rates,orders}=st;
  const today=new Date();
  const[monthOffset,setMonthOffset]=useState(0);
  const[expandedCat,setExpandedCat]=useState(null);
 
  const targetDate=new Date(today.getFullYear(),today.getMonth()+monthOffset,1);
  const year=targetDate.getFullYear();
  const month=targetDate.getMonth();
  const monthStr=`${year}-${String(month+1).padStart(2,"0")}`;
  const monthLabel=`${MONTHS_SHORT[month]} ${year}`;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const isCurrentMonth=monthOffset===0;
  // How many days of THIS month have actually elapsed (for fair comparison + run rate)
  const daysElapsed=isCurrentMonth?today.getDate():daysInMonth;
 
  const prevDate=new Date(year,month-1,1);
  const prevMonthStr=`${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,"0")}`;
  const prevMonthLabel=MONTHS_SHORT[prevDate.getMonth()];
 
  const md=buildMonth(monthStr,ledger,bp,rates);
 
  // ── Fair comparison window ──
  // Same-day-count slice of the previous month (e.g. July 1-3 if today is Aug 3)
  function buildPartialMonth(ym,endDay){
    const entries=ledger.filter(e=>{
      if(!e.date?.startsWith(ym))return false;
      const day=parseInt(e.date.slice(8,10));
      return day<=endDay;
    });
    const inc=entries.filter(e=>e.type==="income").reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
    const cost=entries.filter(e=>e.type==="expense").reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
    return{inc,cost};
  }
 
  // The comparison baseline — fair depending on whether we're mid-month or looking at history
  const compareLabel = isCurrentMonth ? `first ${daysElapsed}d of ${prevMonthLabel}` : `all of ${prevMonthLabel}`;
  const compareBaseline = isCurrentMonth
    ? buildPartialMonth(prevMonthStr, daysElapsed)
    : buildMonth(prevMonthStr,ledger,bp,rates);
 
  // Daily averages — the only truly comparable unit across partial/full periods
  const dailyAvgIncome = daysElapsed>0 ? md.inc/daysElapsed : 0;
  const dailyAvgSpend  = daysElapsed>0 ? md.cost/daysElapsed : 0;
  const prevDailyAvgIncome = isCurrentMonth
    ? (daysElapsed>0?compareBaseline.inc/daysElapsed:0)
    : (daysInMonth>0?compareBaseline.inc/daysInMonth:0);
  const prevDailyAvgSpend = isCurrentMonth
    ? (daysElapsed>0?compareBaseline.cost/daysElapsed:0)
    : (daysInMonth>0?compareBaseline.cost/daysInMonth:0);
 
  // Run rate — where the current month is projected to land if the pace holds
  const projectedIncome = isCurrentMonth ? dailyAvgIncome*daysInMonth : md.inc;
  const projectedSpend  = isCurrentMonth ? dailyAvgSpend*daysInMonth : md.cost;
 
  // ── Weekly split (unchanged — already fair since it's within-month) ──
  function getWeeks(){
    const weeks=[];
    const ranges=[{label:"Week 1",start:1,end:7},{label:"Week 2",start:8,end:14},{label:"Week 3",start:15,end:21},{label:"Week 4",start:22,end:daysInMonth}];
    ranges.forEach(r=>{
      const startStr=`${year}-${String(month+1).padStart(2,"0")}-${String(r.start).padStart(2,"0")}`;
      const endStr=`${year}-${String(month+1).padStart(2,"0")}-${String(r.end).padStart(2,"0")}`;
      const expEntries=ledger.filter(e=>e.date&&e.date>=startStr&&e.date<=endStr&&e.type==="expense");
      const incEntries=ledger.filter(e=>e.date&&e.date>=startStr&&e.date<=endStr&&e.type==="income");
      const cats={};
      EXPENSE_CATS.forEach(c=>{cats[c]=expEntries.filter(e=>e.category===c).reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);});
      const expTotal=expEntries.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
      const incTotal=incEntries.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
      weeks.push({...r,cats,expTotal,incTotal});
    });
    return weeks;
  }
  const weeks=getWeeks();
  const monthTotal=weeks.reduce((s,w)=>s+w.expTotal,0);
  const monthIncome=weeks.reduce((s,w)=>s+w.incTotal,0);
  const chartData=weeks.map(w=>({week:w.label,income:Math.round(w.incTotal),spend:Math.round(w.expTotal),net:Math.round(w.incTotal-w.expTotal)}));
 
  const incomeEntries=ledger.filter(e=>e.date?.startsWith(monthStr)&&e.type==="income");
  const incomeBySource={};
  incomeEntries.forEach(e=>{
    const key=e.category==="Dropshipping"?"Dropshipping":(e.account||"Other");
    incomeBySource[key]=(incomeBySource[key]||0)+toUSD(e.amount,e.currency,rates,bp);
  });
  const incomeSourceData=Object.entries(incomeBySource).map(([name,value])=>({name,value:Math.round(value)})).sort((a,b)=>b.value-a.value);
  const INCOME_COLORS=[T.green,T.blue,T.gold,T.purple,"#14B8A6","#EC4899"];
 
  const COLORS=[T.red,"#EA580C",T.gold,T.green,T.blue,T.purple,"#EC4899","#14B8A6"];
  const topCats=EXPENSE_CATS.map(c=>({name:c,total:weeks.reduce((s,w)=>s+(w.cats[c]||0),0),byWeek:weeks.map(w=>w.cats[c]||0)})).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);

  function tagBreakdownFor(category){
    const entries=ledger.filter(e=>e.date?.startsWith(monthStr)&&e.type==="expense"&&e.category===category);
    const byTag={};
    entries.forEach(e=>{
      const t=e.tag||"Other";
      byTag[t]=(byTag[t]||0)+toUSD(e.amount,e.currency,rates,bp);
    });
    return Object.entries(byTag).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }
 
  // ═══════════════════════════════════════════════════════════════════════
  // FAIR INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════
  const insights=[];
 
  // 1. Income — daily-average comparison, not raw totals
  if(prevDailyAvgIncome>0){
    const chg=((dailyAvgIncome-prevDailyAvgIncome)/prevDailyAvgIncome)*100;
    insights.push({
      type: chg>=0?"good":"warn",
      text: `Daily income average is ${chg>=0?"up":"down"} ${Math.abs(chg).toFixed(0)}% vs ${compareLabel} (${cu(prevDailyAvgIncome)}/day → ${cu(dailyAvgIncome)}/day).`,
    });
  }
 
  // 2. Spend — daily-average comparison
  if(prevDailyAvgSpend>0){
    const chg=((dailyAvgSpend-prevDailyAvgSpend)/prevDailyAvgSpend)*100;
    insights.push({
      type: chg<=0?"good":"warn",
      text: `Daily spend average is ${chg<=0?"down":"up"} ${Math.abs(chg).toFixed(0)}% vs ${compareLabel} (${cu(prevDailyAvgSpend)}/day → ${cu(dailyAvgSpend)}/day).`,
    });
  }
 
  // 3. Run rate — only meaningful for the current, in-progress month
  if(isCurrentMonth&&daysElapsed>=2&&daysElapsed<daysInMonth){
    insights.push({
      type:"info",
      text:`At the current pace (${daysElapsed} of ${daysInMonth} days in), you're on track for ≈${cu(projectedIncome)} income and ≈${cu(projectedSpend)} spend by end of ${monthLabel}.`,
    });
  }
 
  // 4. Top category — always fair since it's a within-period share, not cross-period
  if(topCats.length>0){
    const top=topCats[0];
    const pctOfSpend=monthTotal>0?(top.total/monthTotal*100):0;
    insights.push({
      type:"info",
      text:`${top.name} is the biggest expense category so far ${isCurrentMonth?`this month (through day ${daysElapsed})`:"this month"} at ${cu(top.total)} (${pctOfSpend.toFixed(0)}% of spend).`,
    });
  }
 
  // 5. Margin — a ratio, so it's naturally fair regardless of period length
  if(md.inc>0){
    const marginPct=md.margin*100;
    insights.push({
      type: marginPct>=50?"good":marginPct>=20?"info":"warn",
      text: marginPct>=50
        ? `Margin is strong at ${marginPct.toFixed(0)}% so far${isCurrentMonth?` (day ${daysElapsed})`:""}.`
        : marginPct>=20
        ? `Margin is ${marginPct.toFixed(0)}% so far — solid but tighten spend if you want to grow it.`
        : `Margin is only ${marginPct.toFixed(0)}% so far — expenses are eating income fast.`,
    });
  }
 
  // 6. Order profit — count-based, always fair to state as-is with a day marker
  const monthOrders=orders.filter(o=>o.date?.startsWith(monthStr));
  if(monthOrders.length>0){
    const orderProfitUSDTotal=monthOrders.reduce((s,o)=>{
      const currency=o.currency||"BTC";
      const profit=parseFloat(o.saleBTC||0)-parseFloat(o.costBTC||0);
      return s+(currency==="BTC"?profit*(bp||0):profit);
    },0);
    insights.push({
      type:"info",
      text:`${monthOrders.length} orders ${isCurrentMonth?`through day ${daysElapsed}`:"this month"} generated ${cu(orderProfitUSDTotal)} profit.`,
    });
  }
 
  if(chartData.every(d=>d.income===0&&d.spend===0)){
    return(
      <div style={{padding:"20px 16px"}}>
        <Card style={{padding:"64px 24px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:12,color:T.textD}}>∿</div>
          <div style={{color:T.textD,fontSize:13,fontFamily:T.mono}}>No data for {monthLabel}. Log income and expenses to see analytics.</div>
        </Card>
      </div>
    );
  }
 
  const th={textAlign:"left",padding:"10px 16px",color:T.textM,fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:500,fontFamily:T.mono,borderBottom:`1px solid ${T.border}`,background:"#FAFBFC"};
  const td={padding:"10px 16px",borderBottom:`1px solid #F9FAFB`,fontFamily:T.mono,fontSize:12};
  const INSIGHT_STYLE={good:{bg:"#F0FDF4",border:"#BBF7D0",icon:"↑",color:T.green},warn:{bg:"#FEF2F2",border:"#FECACA",icon:"⚠",color:T.red},info:{bg:"#EFF6FF",border:"#BFDBFE",icon:"·",color:T.blue}};
 
  return(
    <div style={{padding:"20px 16px"}}>
 
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,color:T.textM,letterSpacing:"0.16em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:10}}>
          Analytics {isCurrentMonth&&<span style={{color:T.textD,fontWeight:400}}>· day {daysElapsed} of {daysInMonth}</span>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Array.from({length:6},(_,i)=>-i).reverse().map(offset=>{
            const d=new Date(today.getFullYear(),today.getMonth()+offset,1);
            const label=`${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
            const isActive=offset===monthOffset;
            return(
              <button key={offset} onClick={()=>setMonthOffset(offset)}
                style={{background:isActive?T.text:T.white,color:isActive?"#fff":T.textM,border:`1px solid ${isActive?T.text:T.border}`,borderRadius:5,padding:"6px 14px",fontSize:11,fontWeight:isActive?600:400,cursor:"pointer",fontFamily:T.mono}}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
 
      {/* Summary metrics — daily average is the headline for partial months */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:0,marginBottom:16,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
        <Metric label="Income (MTD)" value={cu(monthIncome)} color={T.green} sub={`${cu(dailyAvgIncome)}/day avg`}/>
        <Metric label="Spend (MTD)" value={cu(monthTotal)} color={T.red} sub={`${cu(dailyAvgSpend)}/day avg`}/>
        <Metric label="Net" value={cu(monthIncome-monthTotal)} color={monthIncome-monthTotal>=0?T.green:T.red}/>
        <Metric label="Margin" value={monthIncome>0?cp((monthIncome-monthTotal)/monthIncome):"—"} color={T.gold}/>
        {isCurrentMonth&&<Metric label="Projected (EOM)" value={cu(projectedIncome-projectedSpend)} color={T.purple} sub="net at current pace"/>}
      </div>
 
      {insights.length>0&&(
        <Card style={{marginBottom:16}}>
          <CardHeader title="Insights"/>
          <div style={{padding:"14px 20px",display:"flex",flexDirection:"column",gap:10}}>
            {insights.map((ins,i)=>{
              const s=INSIGHT_STYLE[ins.type];
              return(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",background:s.bg,border:`1px solid ${s.border}`,borderRadius:8,padding:"10px 14px"}}>
                  <span style={{fontSize:14,color:s.color,flexShrink:0,marginTop:1}}>{s.icon}</span>
                  <span style={{fontSize:12,color:T.textS,fontFamily:T.sans,lineHeight:1.5}}>{ins.text}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
 
      <Card style={{marginBottom:16}}>
        <CardHeader title="Income vs Spend per Week"/>
        <div style={{padding:"12px 0 8px"}}>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={chartData} barGap={3}>
              <XAxis dataKey="week" tick={{fill:T.textD,fontSize:11,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:T.textD,fontSize:10,fontFamily:"IBM Plex Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
              <Tooltip content={<CustomTooltip/>}/>
              <Bar dataKey="income" fill={T.green} fillOpacity={0.15} stroke={T.green} strokeWidth={1.5} radius={[3,3,0,0]} name="Income"/>
              <Bar dataKey="spend"  fill={T.red} fillOpacity={0.15} stroke={T.red}   strokeWidth={1.5} radius={[3,3,0,0]} name="Spend"/>
              <Bar dataKey="net"    fill={T.blue} fillOpacity={0.15} stroke={T.blue}  strokeWidth={1.5} radius={[3,3,0,0]} name="Net"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
 
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <Card>
          <CardHeader title="Income Sources"/>
          {incomeSourceData.length===0
            ?<div style={{padding:"24px 20px",color:T.textD,fontSize:12,fontFamily:T.mono}}>No income logged this month.</div>
            :<>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={incomeSourceData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                    {incomeSourceData.map((e,i)=><Cell key={i} fill={INCOME_COLORS[i%INCOME_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={v=>cu(v)}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{padding:"0 16px 14px",display:"flex",flexDirection:"column",gap:4}}>
                {incomeSourceData.map((d,i)=>(
                  <div key={d.name} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:T.textS}}>
                    <span style={{display:"flex",alignItems:"center",gap:6,fontFamily:T.mono}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:INCOME_COLORS[i%INCOME_COLORS.length]}}/>
                      {d.name}
                    </span>
                    <span style={{fontFamily:T.mono,fontWeight:600}}>{cu(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          }
        </Card>
 
        <Card>
          <CardHeader title="Spend by Category" action={<span style={{fontSize:9,color:T.textD,fontFamily:T.mono}}>click to drill down</span>}/>
          {topCats.length===0
            ?<div style={{padding:"24px 20px",color:T.textD,fontSize:12,fontFamily:T.mono}}>No expenses this month.</div>
            :<div style={{padding:"16px 20px"}}>
              {topCats.map((c,i)=>{
                const pctVal=monthTotal>0?c.total/monthTotal:0;
                const isOpen=expandedCat===c.name;
                const tagData=isOpen?tagBreakdownFor(c.name):[];
                return(
                  <div key={c.name} style={{marginBottom:10}}>
                    <div onClick={()=>setExpandedCat(isOpen?null:c.name)} style={{cursor:"pointer"}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4,fontFamily:T.mono}}>
                        <span style={{color:T.textS,display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:9,color:T.textD,transition:"transform 0.15s",display:"inline-block",transform:isOpen?"rotate(90deg)":"none"}}>▸</span>
                          {c.name}
                        </span>
                        <span style={{color:COLORS[i%COLORS.length],fontWeight:600}}>{cu(c.total)} <span style={{color:T.textD,fontWeight:400}}>({(pctVal*100).toFixed(0)}%)</span></span>
                      </div>
                      <div style={{height:3,background:"#F3F4F6",borderRadius:2}}>
                        <div style={{height:3,background:COLORS[i%COLORS.length],borderRadius:2,width:Math.min(100,pctVal*100)+"%"}}/>
                      </div>
                    </div>
                    {isOpen&&tagData.length>0&&(
                      <div style={{marginTop:8,marginLeft:16,paddingLeft:10,borderLeft:`2px solid ${T.border}`,display:"flex",flexDirection:"column",gap:5}}>
                        {tagData.map(t=>(
                          <div key={t.name} style={{display:"flex",justifyContent:"space-between",fontSize:11,fontFamily:T.mono}}>
                            <span style={{color:T.textM}}>{t.name}</span>
                            <span style={{color:T.textS,fontWeight:500}}>{cu(t.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          }
        </Card>
      </div>
 
      {topCats.length>0&&(
        <Card>
          <CardHeader title="Category Breakdown by Week"/>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:T.mono,minWidth:500}}>
              <thead><tr>
                <th style={{...th,width:140}}>Category</th>
                {weeks.map(w=><th key={w.label} style={{...th,textAlign:"right"}}>{w.label}</th>)}
                <th style={{...th,textAlign:"right"}}>Total</th>
              </tr></thead>
              <tbody>
                {topCats.map((c,i)=>(
                  <tr key={c.name}>
                    <td style={{...td,display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:8,height:8,borderRadius:2,background:COLORS[i%COLORS.length],flexShrink:0}}/>
                      <span style={{color:T.textS}}>{c.name}</span>
                    </td>
                    {c.byWeek.map((v,wi)=>(
                      <td key={wi} style={{...td,textAlign:"right",color:v>0?T.red:T.textD}}>{v>0?cu(v):"—"}</td>
                    ))}
                    <td style={{...td,textAlign:"right",color:T.red,fontWeight:700}}>{cu(c.total)}</td>
                  </tr>
                ))}
                <tr style={{borderTop:`2px solid ${T.border}`,background:"#FAFBFC"}}>
                  <td style={{...td,fontWeight:700,color:T.text}}>Total</td>
                  {weeks.map((w,i)=>(
                    <td key={i} style={{...td,textAlign:"right",color:T.red,fontWeight:700}}>{cu(w.expTotal)}</td>
                  ))}
                  <td style={{...td,textAlign:"right",color:T.red,fontWeight:700}}>{cu(monthTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
      {type:"transfer",category:"Transfer",amount:amt,currency:fromAcc.currency,account:form.from,label:`Transfer → ${toAcc.label}`,date:form.date},
      {type:"transfer",category:"Transfer",amount:amt,currency:toAcc.currency, account:form.to,  label:`Transfer ← ${fromAcc.label}`,date:form.date},
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
// ── Reconciliation ────────────────────────────────────────────────────────────
const RECON_ACCOUNTS = [
  {key:"metamask_btc",  label:"MetaMask BTC",  step:"0.000001", fmt:cbt},
  {key:"coinbase_btc",  label:"Coinbase BTC",  step:"0.000001", fmt:cbt},
  {key:"coinbase_usdt", label:"Coinbase USDT", step:"0.01",     fmt:cu},
  {key:"metamask_usdt", label:"MetaMask USDT", step:"0.01",     fmt:cu},
  {key:"uob_sgd",       label:"UOB SGD",       step:"0.01",     fmt:csg},
  {key:"revolut_sgd",   label:"Revolut SGD",   step:"0.01",     fmt:csg},
  {key:"bca_idr",       label:"BCA IDR",       step:"1000",     fmt:cid},
];

function reconHealth(lastReconciled){
  if(!lastReconciled) return {color:T.red, dot:"#EF4444", label:"Never reconciled", urgent:true};
  const days=Math.floor((Date.now()-new Date(lastReconciled).getTime())/86400000);
  if(days<=7)  return {color:T.green, dot:"#22C55E", label:`Reconciled ${days===0?"today":days+"d ago"}`, urgent:false};
  if(days<=14) return {color:T.gold,  dot:"#F59E0B", label:`Reconciled ${days}d ago`, urgent:false};
  return {color:T.red, dot:"#EF4444", label:`Reconciled ${days}d ago`, urgent:true};
}

function Reconciliation({wallets,onReconcile,lastReconciled,showToast}){
  const[open,setOpen]=useState(false);
  const[actuals,setActuals]=useState({});
  const health=reconHealth(lastReconciled);

  function startReconcile(){
    const init={};
    RECON_ACCOUNTS.forEach(a=>{init[a.key]=wallets[a.key]||0;});
    setActuals(init);
    setOpen(true);
  }
  function applyReconcile(){
    const newW={...wallets};
    RECON_ACCOUNTS.forEach(a=>{newW[a.key]=parseFloat(actuals[a.key])||0;});
    onReconcile(newW);
    setOpen(false);
    showToast("✓ Balances reconciled");
  }
  const deltas=RECON_ACCOUNTS.map(a=>{
    const appVal=wallets[a.key]||0;
    const actualVal=parseFloat(actuals[a.key])||0;
    return{...a, appVal, actualVal, delta:actualVal-appVal};
  });
  const mismatchCount=deltas.filter(d=>Math.abs(d.delta)>0.000001).length;

  return(
    <Card style={{marginTop:16}}>
      <CardHeader title="Reconciliation" action={
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:health.color,fontFamily:T.mono,fontWeight:600}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:health.dot,display:"inline-block"}}/>
            {health.label}
          </span>
          {!open&&<button onClick={startReconcile} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"5px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Reconcile Now</button>}
        </div>
      }/>
      {!open?(
        <div style={{padding:"16px 20px",fontSize:12,color:T.textM,fontFamily:T.mono,lineHeight:1.6}}>
          Compare your app balances against what your wallets and bank apps actually show. Catches drift from parsing errors or sync failures before it compounds.
        </div>
      ):(
        <div style={{padding:"16px 20px"}}>
          <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginBottom:14}}>
            Enter what each account actually shows right now — mismatches highlight in red.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,padding:"0 0 8px",borderBottom:`1px solid ${T.border}`,marginBottom:8}}>
            <span style={{fontSize:9,color:T.textD,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:T.mono}}>Account</span>
            <span style={{fontSize:9,color:T.textD,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:T.mono,textAlign:"right"}}>App Shows</span>
            <span style={{fontSize:9,color:T.textD,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:T.mono,textAlign:"right"}}>Actual</span>
          </div>
          {deltas.map(a=>{
            const hasDelta=Math.abs(a.delta)>0.000001;
            return(
              <div key={a.key} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,alignItems:"center",padding:"9px 0",borderBottom:`1px solid #F9FAFB`}}>
                <div style={{fontSize:12,color:T.textS,fontFamily:T.mono}}>{a.label}</div>
                <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,textAlign:"right"}}>{a.fmt(a.appVal)}</div>
                <div>
                  <input type="number" step={a.step} value={actuals[a.key]??""} onChange={e=>setActuals(x=>({...x,[a.key]:e.target.value}))}
                    style={{background:hasDelta?"#FEF2F2":T.white,border:`1px solid ${hasDelta?"#FECACA":T.borderS}`,borderRadius:4,padding:"6px 10px",fontSize:12,width:"100%",textAlign:"right",fontFamily:T.mono,color:T.text,outline:"none"}}/>
                  {hasDelta&&<div style={{fontSize:10,color:T.red,marginTop:3,textAlign:"right",fontFamily:T.mono}}>Δ {a.delta>0?"+":""}{a.fmt(a.delta)}</div>}
                </div>
              </div>
            );
          })}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16}}>
            <span style={{fontSize:11,fontFamily:T.mono,color:mismatchCount>0?T.red:T.green,fontWeight:600}}>
              {mismatchCount>0?`${mismatchCount} mismatch${mismatchCount>1?"es":""} found`:"All balances match"}
            </span>
            <div style={{display:"flex",gap:8}}>
              <button onClick={applyReconcile} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"8px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Apply & Save</button>
              <button onClick={()=>setOpen(false)} style={{background:T.white,color:T.textM,border:`1px solid ${T.borderS}`,borderRadius:5,padding:"8px 16px",fontSize:12,cursor:"pointer",fontFamily:T.sans}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Wallets({st,bp,onUpdate,onTransfer,showToast,onReconcile}){
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
            <div>
              <span style={{fontSize:12,color:T.textM,fontFamily:T.mono}}>BTC Cost Basis</span>
              <div style={{fontSize:9,color:T.textD,fontFamily:T.mono,marginTop:2}}>auto — weighted avg from BTC income</div>
            </div>
            <div style={{fontSize:14,fontWeight:700,color:T.gold,fontFamily:T.mono}}>{cu(st.btcCostBasis||0)}</div>
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
      <Reconciliation wallets={w} onReconcile={onReconcile} lastReconciled={st.lastReconciled} showToast={showToast}/>
      <Card style={{marginTop:16}}>
        <CardHeader title="Backup & Export"/>
        <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div style={{fontSize:12,color:T.textM,fontFamily:T.mono,lineHeight:1.6,maxWidth:420}}>
            Download a full snapshot of your ledger, orders, wallets, budgets and settings as JSON — a safety copy independent of Supabase. Or export your ledger as CSV for a spreadsheet or accountant.
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>{
              const headers=["Date","Type","Category","Tag","Amount","Currency","Account","Label"];
              const rows=(st.ledger||[]).map(e=>[
                e.date||"", e.type||"", e.category||"", e.tag||"",
                e.amount||0, e.currency||"", e.account||"",
                `"${(e.label||"").replace(/"/g,'""')}"`,
              ]);
              const csv=[headers.join(","),...rows.map(r=>r.join(","))].join("\n");
              const blob=new Blob([csv],{type:"text/csv"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url; a.download=`hxn-ledger-${new Date().toISOString().slice(0,10)}.csv`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} style={{background:T.white,color:T.textS,border:`1px solid ${T.borderS}`,borderRadius:5,padding:"9px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}>
              ↓ Export CSV
            </button>
            <button onClick={()=>{
              const payload={
                exportedAt:new Date().toISOString(),
                wallets:w, rates,
                btcCostBasis:st.btcCostBasis,
                ledger:st.ledger, orders:st.orders,
                budgets:st.budgets||null,
              };
              const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
              const url=URL.createObjectURL(blob);
              const a=document.createElement("a");
              a.href=url; a.download=`hxn-backup-${new Date().toISOString().slice(0,10)}.json`;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"9px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans,whiteSpace:"nowrap"}}>
              ↓ Export JSON
            </button>
          </div>
        </div>
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
          txs=txs.map(t=>{
            const resolvedCategory=t.type==="transfer"?"Transfer":(()=>{if(!t.category)return"Miscellaneous";const raw=t.category.toLowerCase().trim();if(steroidTerms.some(s=>raw.includes(s)))return"Gear";const exact=EXPENSE_CATS.find(c=>c.toLowerCase()===raw);if(exact)return exact;const partial=EXPENSE_CATS.find(c=>raw.includes(c.toLowerCase())||c.toLowerCase().includes(raw));if(partial)return partial;return"Miscellaneous";})();
            return{...t,type:t.type==="income"?"income":t.type==="transfer"?"transfer":"expense",
              amount:Math.abs(parseFloat(t.amount)||0),currency:(t.type==="expense"&&t.currency==="USD")?"SGD":t.currency||"SGD",account:t.account||"revolut_sgd",
              category:resolvedCategory,
              tag:resolvedCategory==="Transfer"?null:resolveTag(t.tag,resolvedCategory),
              date:(t.date&&/^\d{4}-\d{2}-\d{2}$/.test(t.date))?t.date:today};
          });
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
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"0 16px 16px"}}>
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
                <span><Badge color={t.type==="income"?T.green:t.type==="transfer"?T.blue:T.red}>{t.type}</Badge><span style={{marginLeft:6,color:T.textD}}>{t.date}</span> <span style={{marginLeft:6}}>{t.label||t.category}</span></span>
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

// ── Supply Tracker ────────────────────────────────────────────────────────────
function daysUntil(dateStr){
  const target=new Date(dateStr+"T00:00:00");
  const today=new Date();today.setHours(0,0,0,0);
  return Math.round((target-today)/86400000);
}
// Pill/tablet type: qty on hand ÷ daily dose
function computeRunsOutPill(qty,dailyDose){
  const q=parseFloat(qty)||0;
  const d=parseFloat(dailyDose)||0;
  if(d<=0)return null;
  const daysLeft=Math.floor(q/d);
  const dt=new Date();
  dt.setDate(dt.getDate()+daysLeft);
  return dt.toISOString().slice(0,10);
}
// Injectable/oil type: total mg on hand (vials × mg-per-vial) ÷ weekly usage, converted to days
function computeRunsOutOil(vialsOnHand,mgPerVial,weeklyUsageMg){
  const vials=parseFloat(vialsOnHand)||0;
  const mgVial=parseFloat(mgPerVial)||0;
  const weekly=parseFloat(weeklyUsageMg)||0;
  if(weekly<=0)return null;
  const totalMg=vials*mgVial;
  const daysLeft=Math.floor((totalMg/weekly)*7);
  const dt=new Date();
  dt.setDate(dt.getDate()+daysLeft);
  return dt.toISOString().slice(0,10);
}
function computeRunsOut(item){
  // Items not actively in use (backup/duplicate stock, e.g. a second vial of Test
  // sitting unopened) shouldn't have a countdown running — only what you're
  // actually taking right now should deplete.
  if(item.inUse===false) return null;
  if(item.itemType==="oil") return computeRunsOutOil(item.vialsOnHand,item.mgPerVial,item.weeklyUsageMg);
  return computeRunsOutPill(item.qty,item.dailyDose);
}
function runOutStatus(daysLeft){
  if(daysLeft===null) return {color:T.textD,bg:"#F9FAFB",label:"—"};
  if(daysLeft<=14) return {color:T.red,bg:"#FEF2F2",label:`${daysLeft}d left`};
  if(daysLeft<=30) return {color:T.gold,bg:"#FEF3C7",label:`${daysLeft}d left`};
  return {color:T.green,bg:"#F0FDF4",label:`${daysLeft}d left`};
}

const SUPPLY_CATEGORIES = ["Ancillaries","Steroids","Supplements"];

function SupplyTracker({supplies,onAdd,onRestock,onDelete,onToggleInUse,rates}){
  const[activeTab,setActiveTab]=useState("Ancillaries");
  const[showForm,setShowForm]=useState(false);
  const emptyForm={
    itemType:"pill", name:"", category:activeTab, inUse:true,
    qty:"", unit:"tabs", dailyDose:"",
    concentrationMgMl:"", vialVolumeMl:"", mgPerVial:"", vialsOnHand:"", weeklyUsageMg:"",
    restockCostIDR:"", restockQty:"", notes:"",
  };
  const[form,setForm]=useState(emptyForm);

  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"8px 10px",fontSize:12,fontFamily:T.mono,outline:"none",width:"100%"};
  const lbl={fontSize:10,color:T.textM,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:5,display:"block",fontFamily:T.mono,fontWeight:500};

  const computedMgPerVial=(parseFloat(form.concentrationMgMl)||0)*(parseFloat(form.vialVolumeMl)||0);
  const effectiveMgPerVial=form.mgPerVial?parseFloat(form.mgPerVial):(computedMgPerVial||0);

  const CAT_COLOR={"Ancillaries":T.blue,"Steroids":T.gold,"Supplements":T.purple};

  const enriched=supplies.map(s=>{
    const runsOut=s.runsOutOverride||computeRunsOut(s);
    const daysLeft=runsOut?daysUntil(runsOut):null;
    return{...s,runsOut,daysLeft};
  }).filter(s=>(s.category||"Ancillaries")===activeTab)
    .sort((a,b)=>{
      if(a.daysLeft===null)return 1;
      if(b.daysLeft===null)return -1;
      return a.daysLeft-b.daysLeft;
    });

  const tabCounts={};
  SUPPLY_CATEGORIES.forEach(c=>{tabCounts[c]=supplies.filter(s=>(s.category||"Ancillaries")===c).length;});

  function submitAdd(){
    if(!form.name.trim())return;
    if(form.itemType==="pill"&&!form.qty)return;
    if(form.itemType==="oil"&&!form.vialsOnHand)return;
    onAdd({
      ...form,
      category:activeTab,
      qty:parseFloat(form.qty)||0,
      dailyDose:parseFloat(form.dailyDose)||0,
      concentrationMgMl:parseFloat(form.concentrationMgMl)||0,
      vialVolumeMl:parseFloat(form.vialVolumeMl)||0,
      mgPerVial:effectiveMgPerVial,
      vialsOnHand:parseFloat(form.vialsOnHand)||0,
      weeklyUsageMg:parseFloat(form.weeklyUsageMg)||0,
      restockCostIDR:parseFloat(form.restockCostIDR)||0,
      restockQty:parseFloat(form.restockQty)||0,
    });
    setShowForm(false);
    setForm({...emptyForm,category:activeTab});
  }

  // Side badge — red within a week, gold within a month, otherwise quiet
  function runOutBadge(daysLeft,runsOut,inUse){
    if(inUse===false) return <span style={{display:"inline-block",background:"#F3F4F6",color:T.textM,fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:12,fontFamily:T.mono,whiteSpace:"nowrap"}}>Reserve</span>;
    if(daysLeft===null) return <span style={{fontSize:10,color:T.textD,fontFamily:T.mono}}>—</span>;
    const isUrgent=daysLeft<=7;
    const isSoon=daysLeft<=30&&!isUrgent;
    const color=isUrgent?T.red:isSoon?T.gold:T.textM;
    const bg=isUrgent?"#FEF2F2":isSoon?"#FEF3C7":"#F9FAFB";
    return(
      <div style={{textAlign:"right",flexShrink:0}}>
        <span style={{display:"inline-block",background:bg,color,fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:12,fontFamily:T.mono,whiteSpace:"nowrap"}}>
          {daysLeft<0?`${Math.abs(daysLeft)}d overdue`:`${daysLeft}d left`}
        </span>
        <div style={{fontSize:9,color:T.textD,fontFamily:T.mono,marginTop:3}}>{runsOut}</div>
      </div>
    );
  }

  return(
    <div style={{padding:"20px 16px"}}>

      {/* Category tabs */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {SUPPLY_CATEGORIES.map(cat=>{
          const active=activeTab===cat;
          return(
            <button key={cat} onClick={()=>{setActiveTab(cat);setShowForm(false);}}
              style={{display:"flex",alignItems:"center",gap:7,background:active?CAT_COLOR[cat]:T.white,border:`1px solid ${active?CAT_COLOR[cat]:T.border}`,borderRadius:8,padding:"9px 16px",cursor:"pointer"}}>
              <span style={{fontSize:13,fontWeight:active?600:500,color:active?"#fff":T.text,fontFamily:T.sans}}>{cat}</span>
              <span style={{fontSize:11,color:active?"#fff":T.textD,fontFamily:T.mono}}>{tabCounts[cat]}</span>
            </button>
          );
        })}
      </div>

      {/* ── LIST — the main content, at the top ── */}
      <Card style={{marginBottom:16}}>
        <CardHeader title={`${activeTab} · ${enriched.length} item${enriched.length!==1?"s":""}`}/>
        {enriched.length===0
          ?<div style={{padding:"40px 20px",textAlign:"center",color:T.textD,fontSize:13,fontFamily:T.mono}}>No {activeTab.toLowerCase()} tracked yet — add one below.</div>
          :enriched.map((s,i)=>{
            const isOil=s.itemType==="oil";
            const isActive=s.inUse!==false;
            return(
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 18px",borderBottom:i<enriched.length-1?`1px solid #F9FAFB`:"none",opacity:isActive?1:0.75}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:T.textS,fontWeight:600}}>{s.name}</div>
                  <div style={{fontSize:11,color:T.textD,fontFamily:T.mono,marginTop:2}}>
                    {isOil
                      ? `${s.vialsOnHand} vial${s.vialsOnHand!==1?"s":""}${s.weeklyUsageMg>0?` · ${s.weeklyUsageMg}mg/wk`:""}`
                      : `${s.qty} ${s.unit}${s.dailyDose>0?` · ${s.dailyDose} ${s.unit}/day`:""}`
                    }
                    {s.restockCostIDR>0&&` · ~${cid(s.restockCostIDR)}`}
                    {s.notes&&` · ${s.notes}`}
                  </div>
                </div>
                {runOutBadge(s.daysLeft,s.runsOut,s.inUse)}
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  {isActive?(
                    <button onClick={()=>onToggleInUse(s,false)} title="Pause — move to reserve" style={{background:"#F3F4F6",color:T.textM,border:`1px solid ${T.border}`,borderRadius:4,padding:"5px 9px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.mono}}>⏸</button>
                  ):(
                    <button onClick={()=>onToggleInUse(s,true)} title="Start using — begins the countdown" style={{background:"#F0FDF4",color:T.green,border:"1px solid #BBF7D0",borderRadius:4,padding:"5px 9px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.mono}}>▶ Start</button>
                  )}
                  <button onClick={()=>onRestock(s)} title="Mark restocked" style={{background:"#F0FDF4",color:T.green,border:"1px solid #BBF7D0",borderRadius:4,padding:"5px 9px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.mono}}>↻</button>
                  <button onClick={()=>onDelete(s.id)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:16}}>×</button>
                </div>
              </div>
            );
          })
        }
      </Card>

      {/* ── Add form — below the list ── */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:showForm?12:0}}>
        <button onClick={()=>{setShowForm(v=>!v);setForm(f=>({...f,category:activeTab}));}} style={{background:T.text,color:"#fff",border:"none",borderRadius:5,padding:"7px 16px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>{showForm?"Cancel":`+ Add to ${activeTab}`}</button>
      </div>

      {showForm&&(
        <Card style={{padding:"20px"}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
            <div style={{display:"flex",gap:6,background:"#F3F4F6",borderRadius:6,padding:3,width:"fit-content"}}>
              {[["pill","Oral / Tablet"],["oil","Injectable / Vial"]].map(([k,label])=>(
                <button key={k} onClick={()=>setForm(f=>({...f,itemType:k}))}
                  style={{background:form.itemType===k?T.text:"transparent",color:form.itemType===k?"#fff":T.textM,border:"none",borderRadius:4,padding:"6px 14px",fontSize:11,fontWeight:form.itemType===k?600:400,cursor:"pointer",fontFamily:T.mono}}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,background:"#F3F4F6",borderRadius:6,padding:3,width:"fit-content"}}>
              {[[true,"Active — using now"],[false,"Reserve — not started"]].map(([v,label])=>(
                <button key={String(v)} onClick={()=>setForm(f=>({...f,inUse:v}))}
                  style={{background:form.inUse===v?(v?T.green:T.textD):"transparent",color:form.inUse===v?"#fff":T.textM,border:"none",borderRadius:4,padding:"6px 14px",fontSize:11,fontWeight:form.inUse===v?600:400,cursor:"pointer",fontFamily:T.mono}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:10}}>
            <label style={lbl}>Name</label>
            <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder={form.itemType==="oil"?"e.g. Test E":"e.g. Telmisartan"} style={inp}/>
          </div>

          {form.itemType==="pill"?(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
              <div><label style={lbl}>Qty on Hand</label><input type="number" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} placeholder="200" style={inp}/></div>
              <div><label style={lbl}>Unit</label><input value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} placeholder="tabs" style={inp}/></div>
              <div><label style={lbl}>Daily Dose ({form.unit||"tabs"})</label><input type="number" step="0.25" value={form.dailyDose} onChange={e=>setForm(f=>({...f,dailyDose:e.target.value}))} placeholder="1" style={inp}/></div>
            </div>
          ):(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:6}}>
                <div><label style={lbl}>Concentration (mg/ml)</label><input type="number" value={form.concentrationMgMl} onChange={e=>setForm(f=>({...f,concentrationMgMl:e.target.value,mgPerVial:""}))} placeholder="250" style={inp}/></div>
                <div><label style={lbl}>Vial Volume (ml)</label><input type="number" value={form.vialVolumeMl} onChange={e=>setForm(f=>({...f,vialVolumeMl:e.target.value,mgPerVial:""}))} placeholder="10" style={inp}/></div>
                <div><label style={lbl}>or mg / vial direct</label><input type="number" value={form.mgPerVial} onChange={e=>setForm(f=>({...f,mgPerVial:e.target.value}))} placeholder="2500" style={inp}/></div>
              </div>
              {effectiveMgPerVial>0&&<div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginBottom:10}}>≈ {effectiveMgPerVial}mg per vial</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label style={lbl}>Vials on Hand</label><input type="number" step="0.5" value={form.vialsOnHand} onChange={e=>setForm(f=>({...f,vialsOnHand:e.target.value}))} placeholder="3" style={inp}/></div>
                <div><label style={lbl}>Weekly Usage (mg)</label><input type="number" value={form.weeklyUsageMg} onChange={e=>setForm(f=>({...f,weeklyUsageMg:e.target.value}))} placeholder="600" style={inp}/></div>
              </div>
            </>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            <div>
              <label style={lbl}>Rough Restock Cost (IDR)</label>
              <input type="number" value={form.restockCostIDR} onChange={e=>setForm(f=>({...f,restockCostIDR:e.target.value}))} placeholder="e.g. 3500000" style={inp}/>
              {form.restockCostIDR&&<div style={{fontSize:10,color:T.textD,marginTop:3,fontFamily:T.mono}}>≈ {cu(parseFloat(form.restockCostIDR)/(rates.USDIDR||16200))} · for reference only</div>}
            </div>
            <div><label style={lbl}>Restock Qty ({form.itemType==="oil"?"vials":form.unit||"tabs"})</label><input type="number" value={form.restockQty} onChange={e=>setForm(f=>({...f,restockQty:e.target.value}))} placeholder={form.itemType==="oil"?"e.g. 5":"e.g. 200"} style={inp}/></div>
          </div>
          <div style={{marginBottom:12}}><label style={lbl}>Notes (optional)</label><input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Cycle notes, source, etc." style={inp}/></div>
          <button onClick={submitAdd} disabled={!form.name.trim()||(form.itemType==="pill"?!form.qty:!form.vialsOnHand)} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"8px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>Add to {activeTab}</button>
        </Card>
      )}
    </div>
  );
}

// BUDGET FUNCTION

function Budget({st,bp,budgets,onSaveBudgets,supplies,planned,onAddPlanned,onTogglePlanned,onDeletePlanned}){
  const{ledger,rates}=st;
  const[editing,setEditing]=useState(false);
  const defaultAmounts={Dad:2250000,Mom:750000,Sam:750000,Glenn:750000,Personal:1500000,Dating:1500000,Gas:750000,Gear:2250000,Groceries:1500000,Miscellaneous:750000,Family:1500000,"Debt Repayment":2250000};
  const[draftAmounts,setDraftAmounts]=useState(budgets.amounts||defaultAmounts);
  const[selectedMonth,setSelectedMonth]=useState(new Date().toISOString().slice(0,7));
  const rolloverEnabled=budgets.rolloverEnabled||{};
  function toggleCatRollover(cat){
    const updated={...rolloverEnabled,[cat]:rolloverEnabled[cat]===false?true:false};
    onSaveBudgets({amounts,rolloverEnabled:updated});
  }
  const[addingTo,setAddingTo]=useState(null); // category name currently showing its "+ plan a purchase" mini-form
  const[planName,setPlanName]=useState("");
  const[planAmount,setPlanAmount]=useState("");

  const amounts=budgets.amounts||draftAmounts;
  const budgetTotalIDR=EXPENSE_CATS.reduce((s,c)=>s+(parseFloat(amounts[c])||0),0);
  const draftTotalIDR=EXPENSE_CATS.reduce((s,c)=>s+(parseFloat(draftAmounts[c])||0),0);

  const thisM=selectedMonth;
  const isCurrentMonthSelected=thisM===new Date().toISOString().slice(0,7);
  const daysInSelMonth=new Date(parseInt(thisM.split("-")[0]),parseInt(thisM.split("-")[1]),0).getDate();
  const daysElapsedSel=isCurrentMonthSelected?new Date().getDate():daysInSelMonth;

  const prevMDate=new Date(parseInt(thisM.split("-")[0]),parseInt(thisM.split("-")[1])-2,1);
  const prevMStr=`${prevMDate.getFullYear()}-${String(prevMDate.getMonth()+1).padStart(2,"0")}`;
  const prevMd=buildMonth(prevMStr,ledger,bp,rates);

  const md=buildMonth(thisM,ledger,bp,rates);
  const spentTotalUSD=md.cost;
  const spentTotalIDR=spentTotalUSD*(rates.USDIDR||16200);
  const projectedIncome=md.inc;

  // Planned items are NOT month-scoped — they're just "things I'm currently
  // planning to buy" per category, and disappear (via the ✓ toggle) once you
  // actually buy them and log the real expense. Simple running want-list,
  // not a separate wishlist system with its own dates and priorities.
  const plannedByCategory={};
  EXPENSE_CATS.forEach(c=>{plannedByCategory[c]=(planned||[]).filter(p=>p.category===c&&!p.purchased);});
  const plannedTotalIDR=(planned||[]).filter(p=>!p.purchased).reduce((s,p)=>s+(parseFloat(p.amountIDR)||0),0);
  const plannedTotalUSD=plannedTotalIDR/(rates.USDIDR||16200);

  const remainingIDR=budgetTotalIDR-spentTotalIDR-plannedTotalIDR;
  const overallPct=budgetTotalIDR>0?(spentTotalIDR+plannedTotalIDR)/budgetTotalIDR:0;
  const canAfford=projectedIncome>=(spentTotalUSD+plannedTotalUSD);

  function saveEdit(){
    onSaveBudgets({amounts:draftAmounts});
    setEditing(false);
  }
  function submitPlan(cat){
    if(!planName.trim()||!planAmount)return;
    onAddPlanned({category:cat,name:planName.trim(),amountIDR:parseFloat(planAmount)||0});
    setPlanName("");setPlanAmount("");setAddingTo(null);
  }
  function statusColor(pct){if(pct>=1)return T.red;if(pct>=0.8)return T.gold;return T.green;}

  const inp={background:T.white,border:`1px solid ${T.borderS}`,color:T.text,borderRadius:4,padding:"7px 10px",fontSize:12,fontFamily:T.mono,outline:"none",width:"100%"};

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

      {/* Overall summary — one honest number, spent + planned vs cap */}
      <Card style={{marginBottom:16}}>
        <div style={{padding:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16}}>
            <div>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:6}}>Monthly Budget Cap {editing&&<span style={{color:T.textD,fontWeight:400}}>· sum of categories below</span>}</div>
              <div style={{fontSize:32,fontWeight:800,color:T.text,fontFamily:T.sans,letterSpacing:"-0.02em"}}>{cid(editing?draftTotalIDR:budgetTotalIDR)}</div>
              <div style={{fontSize:12,color:T.textD,fontFamily:T.mono,marginTop:4}}>{cu((editing?draftTotalIDR:budgetTotalIDR)/(rates.USDIDR||16200))} USD</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:500,marginBottom:6}}>Spent + Planned</div>
              <div style={{fontSize:24,fontWeight:700,color:statusColor(overallPct),fontFamily:T.sans}}>{cid(spentTotalIDR+plannedTotalIDR)}</div>
              <div style={{fontSize:12,color:T.textD,fontFamily:T.mono,marginTop:4}}>{cid(spentTotalIDR)} spent · {cid(plannedTotalIDR)} planned</div>
            </div>
          </div>
          <div style={{height:8,background:"#F3F4F6",borderRadius:4,overflow:"hidden",marginBottom:4,display:"flex"}}>
            <div style={{height:8,background:statusColor(overallPct),width:budgetTotalIDR>0?Math.min(100,spentTotalIDR/budgetTotalIDR*100)+"%":"0%"}}/>
            <div style={{height:8,background:statusColor(overallPct),opacity:0.4,width:budgetTotalIDR>0?Math.min(100-Math.min(100,spentTotalIDR/budgetTotalIDR*100),plannedTotalIDR/budgetTotalIDR*100)+"%":"0%"}}/>
          </div>
          <div style={{display:"flex",gap:14,fontSize:10,color:T.textD,fontFamily:T.mono,marginBottom:14}}>
            <span style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:statusColor(overallPct)}}/>Spent</span>
            <span style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:8,height:8,borderRadius:2,background:statusColor(overallPct),opacity:0.4}}/>Planned</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:12,color:remainingIDR>=0?T.green:T.red,fontWeight:600,fontFamily:T.mono}}>
              {remainingIDR>=0?"Remaining: ":"Over by: "}{cid(Math.abs(remainingIDR))}
            </span>
            <button onClick={editing?saveEdit:()=>setEditing(true)}
              style={{background:editing?T.text:T.white,color:editing?"#fff":T.textS,border:`1px solid ${editing?T.text:T.borderS}`,borderRadius:4,padding:"5px 14px",fontSize:10,cursor:"pointer",fontFamily:T.mono,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>
              {editing?"Save":"Edit Budget"}
            </button>
          </div>
          {!canAfford&&(
            <div style={{marginTop:12,background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:6,padding:"10px 14px",fontSize:11,color:T.red,fontFamily:T.mono}}>
              ⚠ Projected income ({cu(projectedIncome)}) won't cover spent + planned ({cu(spentTotalUSD+plannedTotalUSD)}) this month.
            </div>
          )}
        </div>
      </Card>

      {/* Category breakdown — spent + planned, side by side, per category */}
      <Card>
        <CardHeader title={editing?"Set Amount Per Category (IDR)":"Category Breakdown"}/>
        <div style={{padding:"8px 0"}}>
          {EXPENSE_CATS.map(cat=>{
            const baseBudgetIDR=parseFloat(amounts[cat])||0;
            const catRolloverOn=rolloverEnabled[cat]!==false;
            const prevSpentIDR=(prevMd.cats[cat]||0)*(rates.USDIDR||16200);
            const rolloverIDR=catRolloverOn?Math.max(0,baseBudgetIDR-prevSpentIDR):0;
            const catBudgetIDR=baseBudgetIDR+rolloverIDR;
            const spentUSD=md.cats[cat]||0;
            const spentIDR=spentUSD*(rates.USDIDR||16200);
            const catPlannedIDR=plannedByCategory[cat].reduce((s,p)=>s+(parseFloat(p.amountIDR)||0),0);
            const combinedIDR=spentIDR+catPlannedIDR;
            const remainIDR=catBudgetIDR-combinedIDR;
            const catPct=catBudgetIDR>0?combinedIDR/catBudgetIDR:0;
            const spentPct=catBudgetIDR>0?Math.min(100,spentIDR/catBudgetIDR*100):0;
            const plannedPct=catBudgetIDR>0?Math.min(100-spentPct,catPlannedIDR/catBudgetIDR*100):0;
            const isOver=catPct>=1;
            const isClose=catPct>=0.8&&catPct<1;
            const dailyAvgIDR=daysElapsedSel>0?spentIDR/daysElapsedSel:0;
            const projectedEOMIDR=dailyAvgIDR*daysInSelMonth;
            const willExceed=isCurrentMonthSelected&&catBudgetIDR>0&&!isOver&&projectedEOMIDR+catPlannedIDR>catBudgetIDR&&dailyAvgIDR>0;
            const catPctOfTotal=budgetTotalIDR>0?(baseBudgetIDR/budgetTotalIDR*100):0;
            return(
              <div key={cat} style={{padding:"12px 20px",borderBottom:`1px solid #F9FAFB`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:baseBudgetIDR>0?6:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,color:T.textS,fontWeight:500}}>{cat}</span>
                    {isOver&&<span style={{background:"#FEE2E2",color:T.red,fontSize:9,fontWeight:700,letterSpacing:"0.1em",padding:"2px 6px",borderRadius:3,fontFamily:T.mono}}>OVER</span>}
                    {isClose&&!isOver&&<span style={{background:"#FEF3C7",color:T.gold,fontSize:9,fontWeight:700,letterSpacing:"0.1em",padding:"2px 6px",borderRadius:3,fontFamily:T.mono}}>CLOSE</span>}
                    {rolloverIDR>0&&!editing&&<span style={{background:"#EFF6FF",color:T.blue,fontSize:9,fontWeight:700,letterSpacing:"0.06em",padding:"2px 6px",borderRadius:3,fontFamily:T.mono}}>+{cid(rolloverIDR)} rollover</span>}
                    {!editing&&(
                      <button onClick={()=>toggleCatRollover(cat)} title={catRolloverOn?"Rollover on — click to disable":"Rollover off — click to enable"}
                        style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:0}}>
                        <div style={{width:22,height:13,borderRadius:7,background:catRolloverOn?T.text:T.border,position:"relative",transition:"background 0.2s"}}>
                          <div style={{width:9,height:9,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:catRolloverOn?11:2,transition:"left 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.2)"}}/>
                        </div>
                        <span style={{fontSize:9,color:T.textD,fontFamily:T.mono}}>rollover</span>
                      </button>
                    )}
                  </div>
                  {editing?(
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <input type="number" step="50000" min="0" value={draftAmounts[cat]||0}
                        onChange={e=>setDraftAmounts(d=>({...d,[cat]:parseFloat(e.target.value)||0}))}
                        style={{...inp,width:130,textAlign:"right",padding:"4px 8px"}}/>
                      <span style={{fontSize:10,color:T.textD,fontFamily:T.mono,minWidth:32}}>{draftTotalIDR>0?((parseFloat(draftAmounts[cat])||0)/draftTotalIDR*100).toFixed(0):0}%</span>
                    </div>
                  ):(
                    <span style={{fontSize:12,color:T.textM,fontFamily:T.mono,fontWeight:500}}>{cid(baseBudgetIDR)} · {catPctOfTotal.toFixed(0)}%</span>
                  )}
                </div>

                {willExceed&&(
                  <div style={{fontSize:10,color:T.gold,fontFamily:T.mono,marginBottom:5,display:"flex",alignItems:"center",gap:5}}>
                    <span>⚠</span> At current pace + planned items, will exceed budget
                  </div>
                )}

                {baseBudgetIDR>0&&!editing&&(
                  <>
                    <div style={{height:5,background:"#F3F4F6",borderRadius:3,overflow:"hidden",marginBottom:4,display:"flex"}}>
                      <div style={{height:5,background:statusColor(catPct)}}/>
                    </div>
                    <div style={{height:5,background:"#F3F4F6",borderRadius:3,overflow:"hidden",marginBottom:4,display:"flex",marginTop:-5}}>
                      <div style={{height:5,background:statusColor(catPct),width:spentPct+"%",flexShrink:0}}/>
                      <div style={{height:5,background:statusColor(catPct),opacity:0.4,width:plannedPct+"%",flexShrink:0}}/>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:T.mono,color:T.textD,marginBottom:8}}>
                      <span>Spent {cid(spentIDR)}{catPlannedIDR>0?` + Planned ${cid(catPlannedIDR)}`:""}</span>
                      <span style={{color:remainIDR>=0?T.green:T.red,fontWeight:600}}>
                        {remainIDR>=0?`${cid(remainIDR)} left`:`${cid(Math.abs(remainIDR))} over`}
                      </span>
                    </div>
                  </>
                )}
                {baseBudgetIDR===0&&!editing&&(
                  <div style={{fontSize:10,color:T.textD,fontFamily:T.mono,marginBottom:8}}>
                    {combinedIDR>0?`${cid(spentIDR)} spent, ${cid(catPlannedIDR)} planned — no cap set`:"No cap · nothing spent or planned"}
                  </div>
                )}

                {/* Planned items for this category — the wishlist, integrated */}
                {!editing&&plannedByCategory[cat].length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
                    {plannedByCategory[cat].map(p=>(
                      <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#FAFBFC",border:`1px solid ${T.border}`,borderRadius:5,padding:"6px 10px"}}>
                        <span style={{fontSize:11,color:T.textS,fontFamily:T.mono}}>{p.name}</span>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:T.textM,fontFamily:T.mono,fontWeight:600}}>{cid(p.amountIDR)}</span>
                          <button onClick={()=>onTogglePlanned(p)} title="Mark as bought" style={{background:"#F0FDF4",color:T.green,border:"1px solid #BBF7D0",borderRadius:4,padding:"3px 8px",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:T.mono}}>✓ Bought</button>
                          <button onClick={()=>onDeletePlanned(p.id)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:13}}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!editing&&(
                  addingTo===cat?(
                    <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4}}>
                      <input value={planName} onChange={e=>setPlanName(e.target.value)} placeholder="What are you planning to buy?" style={{...inp,flex:2}} autoFocus/>
                      <input type="number" value={planAmount} onChange={e=>setPlanAmount(e.target.value)} placeholder="Rp amount" style={{...inp,flex:1}}/>
                      <button onClick={()=>submitPlan(cat)} disabled={!planName.trim()||!planAmount} style={{background:T.text,color:"#fff",border:"none",borderRadius:4,padding:"7px 12px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:T.mono,whiteSpace:"nowrap"}}>Add</button>
                      <button onClick={()=>{setAddingTo(null);setPlanName("");setPlanAmount("");}} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:14}}>×</button>
                    </div>
                  ):(
                    <button onClick={()=>setAddingTo(cat)} style={{background:"none",border:"none",color:T.textD,cursor:"pointer",fontSize:10,fontFamily:T.mono,letterSpacing:"0.04em",padding:"2px 0"}}>+ plan a purchase</button>
                  )
                )}
              </div>
            );
          })}
          {editing&&(
            <div style={{padding:"12px 20px",background:"#F9FAFB",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,fontFamily:T.mono,color:T.text,fontWeight:600}}>
                Total: {cid(draftTotalIDR)} · 100%
              </span>
              <span style={{fontSize:11,color:T.textD,fontFamily:T.mono}}>auto-calculated from categories above</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
// ── App Root ──────────────────────────────────────────────────────────────────
export default function App(){
  const[unlocked,setUnlocked]=useState(()=>sessionStorage.getItem("hxn_auth")==="true");
  const[pwInput,setPwInput]=useState("");
  const[pwError,setPwError]=useState(false);
  const[ledger,setLedger]=useState([]);
  const[orders,setOrders]=useState([]);
  const[budgets,setBudgets]=useState({});
  const[supplies,setSupplies]=useState([]);
  const[planned,setPlanned]=useState([]);
  const[wallets,setWallets]=useState(DEFAULT_WALLETS);
  const[rates,setRates]=useState(DEFAULT_RATES);
  const[btcCostBasis,setBtcCostBasis]=useState(0);
  const[btcPrice,setBtcPrice]=useState(null);
  const[view,setView]=useState("Dashboard");
  const[navOpen,setNavOpen]=useState(false);
  const[btcLoading,setBtcLoading]=useState(false);
  const[dbLoading,setDbLoading]=useState(true);
  const[toast,setToast]=useState(null);
  const[syncError,setSyncError]=useState(false);
  const[walletRowId,setWalletRowId]=useState(null);
  const[lastReconciled,setLastReconciled]=useState(null);
  const[netWorthTarget,setNetWorthTarget]=useState(100000);
  const[lastVisitBanner,setLastVisitBanner]=useState(null);
  const[bannerDismissed,setBannerDismissed]=useState(false);
  const[chatOpen,setChatOpen]=useState(false);
  const showToast=msg=>setToast(msg);

  function tryUnlock(){
    if(pwInput==="ijustwantoascend33"){
      sessionStorage.setItem("hxn_auth","true");
      setUnlocked(true);
    } else {
      setPwError(true);
      setTimeout(()=>setPwError(false),2000);
    }
  }
  
  if(!unlocked) return(
    <div style={{background:T.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:T.white,border:`1px solid ${T.border}`,borderRadius:12,padding:"40px",width:320,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{fontSize:20,marginBottom:4}}>🦉</div>
        <div style={{fontSize:16,fontWeight:800,color:T.text,fontFamily:T.sans,marginBottom:4}}>JJ Financial OS</div>
        <div style={{fontSize:12,color:T.textD,fontFamily:T.mono,marginBottom:24,fontStyle:"italic"}}>get rich scheme</div>
        <input type="password" value={pwInput} onChange={e=>setPwInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&tryUnlock()}
          placeholder="Enter password"
          style={{width:"100%",background:"#F9FAFB",border:`1px solid ${pwError?"#DC2626":T.borderS}`,borderRadius:6,padding:"10px 14px",fontSize:14,fontFamily:T.mono,outline:"none",marginBottom:12,color:T.text}}/>
        {pwError&&<div style={{fontSize:11,color:T.red,fontFamily:T.mono,marginBottom:8}}>Wrong password</div>}
        <button onClick={tryUnlock} style={{width:"100%",background:T.text,color:"#fff",border:"none",borderRadius:6,padding:"10px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:T.sans}}>
          Unlock
        </button>
      </div>
    </div>
  );

  useEffect(()=>{
    async function loadAll(){
      setDbLoading(true);
      const[price,fx]=await Promise.all([fetchBTCPrice(),fetchFXRates()]);
      if(price)setBtcPrice(price);
      if(fx)setRates(fx);
      try{
        const ledgerData=await sb("ledger?order=created_at.desc");
        const finalLedger=ledgerData?ledgerData.map(e=>({...e,amount:parseFloat(e.amount),btcPriceAtTime:e.btc_price_at_time?parseFloat(e.btc_price_at_time):undefined})):[];
        if(ledgerData)setLedger(finalLedger);
        const orderData=await sb("orders?order=created_at.desc");
        if(orderData&&orderData.length>0)setOrders(orderData.map(o=>({...o,costBTC:parseFloat(o.cost||0),saleBTC:parseFloat(o.sale_price||0),cost:parseFloat(o.cost||0),salePrice:parseFloat(o.sale_price||0),delivered:o.delivered===true||o.status==="delivered"})));
        const walletData=await sb("wallets?order=updated_at.desc&limit=1");
        let finalWallets=DEFAULT_WALLETS;
        if(walletData&&walletData[0]){
          const wd=walletData[0];
          setWalletRowId(wd.id);
          finalWallets={coinbase_btc:parseFloat(wd.coinbase_btc)||0,metamask_btc:parseFloat(wd.metamask_btc)||0,coinbase_usdt:parseFloat(wd.coinbase_usdt)||0,metamask_usdt:parseFloat(wd.metamask_usdt)||0,uob_sgd:parseFloat(wd.uob_sgd)||0,revolut_sgd:parseFloat(wd.revolut_sgd)||0,bca_idr:parseFloat(wd.bca_idr)||0};
          setWallets(finalWallets);
        }
        try{
          const suppliesData=await sb("supplies?order=created_at.desc");
          if(suppliesData)setSupplies(suppliesData.map(s=>({
            ...s,
            itemType:s.item_type||"pill",
            inUse:s.in_use!==false,
            qty:parseFloat(s.qty)||0,dailyDose:parseFloat(s.daily_dose)||0,
            concentrationMgMl:parseFloat(s.concentration_mg_ml)||0,vialVolumeMl:parseFloat(s.vial_volume_ml)||0,
            mgPerVial:parseFloat(s.mg_per_vial)||0,vialsOnHand:parseFloat(s.vials_on_hand)||0,weeklyUsageMg:parseFloat(s.weekly_usage_mg)||0,
            restockCostIDR:parseFloat(s.restock_cost_idr)||0,restockQty:parseFloat(s.restock_qty)||0,
            runsOutOverride:s.runs_out_override||null,
          })));
        }catch(supErr){ console.error("Supplies load error (table may not exist yet):",supErr); }

        try{
          const plannedData=await sb("planned_items?order=created_at.desc");
          if(plannedData)setPlanned(plannedData.map(p=>({...p,amountIDR:parseFloat(p.amount_idr)||0,purchased:p.purchased===true})));
        }catch(planErr){ console.error("Planned items load error (table may not exist yet):",planErr); }

        const settingsData=await sb("settings");
        if(settingsData)settingsData.forEach(s=>{
          if(s.key==="btc_cost_basis") setBtcCostBasis(parseFloat(s.value)||0);
          if(s.key==="budgets"){ try{ setBudgets(JSON.parse(s.value)||{}); }catch{} }
          if(s.key==="last_reconciled") setLastReconciled(s.value);
          if(s.key==="net_worth_target") setNetWorthTarget(parseFloat(s.value)||100000);
        });

        // ── Since last checked ──
        // Compares today against the last day you actually opened the app
        // (not every reload — only when the calendar day has changed), so the
        // Dashboard can show "since Tuesday: +$X income, -$Y spent" instead of
        // making you go hunt through Ledger for what happened.
        try{
          const todayStr=new Date().toISOString().slice(0,10);
          const finalRates=fx||DEFAULT_RATES;
          const finalBp=price||null;
          const currentNW=netWorth(finalWallets,finalBp,finalRates);
          const lastVisitSetting=settingsData&&settingsData.find(s=>s.key==="last_visit");
          if(lastVisitSetting){
            let old={};
            try{ old=JSON.parse(lastVisitSetting.value)||{}; }catch{}
            if(old.date&&old.date<todayStr){
              const incomeSinceUSD=finalLedger.filter(e=>e.type==="income"&&e.date>old.date).reduce((s,e)=>s+toUSD(e.amount,e.currency,finalRates,finalBp),0);
              const expenseSinceUSD=finalLedger.filter(e=>e.type==="expense"&&e.date>old.date).reduce((s,e)=>s+toUSD(e.amount,e.currency,finalRates,finalBp),0);
              const nwChange=old.netWorth!=null?currentNW-old.netWorth:null;
              const btcChangePct=(old.btcPrice&&finalBp)?((finalBp-old.btcPrice)/old.btcPrice*100):null;
              setLastVisitBanner({sinceDate:old.date,incomeSinceUSD,expenseSinceUSD,nwChange,btcChangePct});
            }
            if(!old.date||old.date<todayStr){
              await saveSetting("last_visit",JSON.stringify({date:todayStr,netWorth:currentNW,btcPrice:finalBp}));
            }
          }else{
            await saveSetting("last_visit",JSON.stringify({date:todayStr,netWorth:currentNW,btcPrice:finalBp}));
          }
        }catch(lvErr){ console.error("Since-last-checked calc error:",lvErr); }

        setSyncError(false);
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

  async function addSupply(item){
    const tempId="tmp-"+Date.now();
    setSupplies(s=>[{...item,id:tempId},...s]);
    try{
      const saved=await sb("supplies","POST",{
        name:item.name,category:item.category,item_type:item.itemType,in_use:item.inUse!==false,
        qty:item.qty,unit:item.unit,daily_dose:item.dailyDose,
        concentration_mg_ml:item.concentrationMgMl,vial_volume_ml:item.vialVolumeMl,
        mg_per_vial:item.mgPerVial,vials_on_hand:item.vialsOnHand,weekly_usage_mg:item.weeklyUsageMg,
        restock_cost_idr:item.restockCostIDR,restock_qty:item.restockQty,notes:item.notes||"",
      });
      const realId=saved?.[0]?.id;
      if(realId) setSupplies(s=>s.map(x=>x.id===tempId?{...x,id:realId}:x));
      showToast("✓ Added to Supply Tracker");
    }catch(e){ console.error("Supply add error:",e); showToast("⚠ Saved locally — Supabase error"); }
  }

  async function restockSupply(item){
    const isOil=item.itemType==="oil";
    if(isOil){
      const newVials=item.restockQty>0?item.restockQty:item.vialsOnHand;
      setSupplies(s=>s.map(x=>x.id===item.id?{...x,vialsOnHand:newVials,runsOutOverride:null}:x));
      try{
        await sb(`supplies?id=eq.${item.id}`,"PATCH",{vials_on_hand:newVials,runs_out_override:null});
        showToast(`✓ ${item.name} restocked`);
      }catch(e){ console.error("Restock error:",e); }
    }else{
      const newQty=item.restockQty>0?item.restockQty:item.qty;
      setSupplies(s=>s.map(x=>x.id===item.id?{...x,qty:newQty,runsOutOverride:null}:x));
      try{
        await sb(`supplies?id=eq.${item.id}`,"PATCH",{qty:newQty,runs_out_override:null});
        showToast(`✓ ${item.name} restocked`);
      }catch(e){ console.error("Restock error:",e); }
    }
  }

  async function toggleSupplyInUse(item,inUse){
    setSupplies(s=>s.map(x=>x.id===item.id?{...x,inUse}:x));
    try{
      await sb(`supplies?id=eq.${item.id}`,"PATCH",{in_use:inUse});
      showToast(inUse?`✓ ${item.name} — countdown started`:`✓ ${item.name} moved to reserve`);
    }catch(e){ console.error("Toggle in-use error:",e); }
  }

  async function deleteSupply(id){
    setSupplies(s=>s.filter(x=>x.id!==id));
    try{ await sb(`supplies?id=eq.${id}`,"DELETE"); }
    catch(e){ console.error("Supply delete error:",e); }
  }

  async function addPlanned(item){
    const tempId="tmp-"+Date.now();
    setPlanned(p=>[{...item,id:tempId,purchased:false},...p]);
    try{
      const saved=await sb("planned_items","POST",{category:item.category,name:item.name,amount_idr:item.amountIDR,purchased:false});
      const realId=saved?.[0]?.id;
      if(realId) setPlanned(p=>p.map(x=>x.id===tempId?{...x,id:realId}:x));
      showToast("✓ Added to plan");
    }catch(e){ console.error("Add planned error:",e); showToast("⚠ Saved locally — Supabase error"); }
  }

  async function togglePlanned(item){
    setPlanned(p=>p.map(x=>x.id===item.id?{...x,purchased:true}:x));
    try{
      await sb(`planned_items?id=eq.${item.id}`,"PATCH",{purchased:true});
      showToast(`✓ ${item.name} marked as bought`);
    }catch(e){ console.error("Toggle planned error:",e); }
  }

  async function deletePlanned(id){
    setPlanned(p=>p.filter(x=>x.id!==id));
    try{ await sb(`planned_items?id=eq.${id}`,"DELETE"); }
    catch(e){ console.error("Delete planned error:",e); }
  }

  async function applyTransactions(txs){
    const newEntries=txs.map(t=>({
      ...t,
      amount:Math.abs(parseFloat(t.amount)),
      btcPriceAtTime: (t.currency==="BTC"&&t.type==="income") ? (btcPrice||null) : undefined,
    }));
    const newW={...wallets};
    newEntries.forEach(e=>{const amt=Math.abs(parseFloat(e.amount));if(!e.account||!newW.hasOwnProperty(e.account))return;if(e.type==="income") newW[e.account]=(newW[e.account]||0)+amt;
    else if(e.type==="expense") newW[e.account]=Math.max(0,(newW[e.account]||0)-amt);
    else if(e.type==="transfer"&&e.label?.startsWith("Transfer →")) newW[e.account]=Math.max(0,(newW[e.account]||0)-amt);
    else if(e.type==="transfer"&&e.label?.startsWith("Transfer ←")) newW[e.account]=(newW[e.account]||0)+amt;});
    try{
      for(const e of newEntries){const saved=await sb("ledger","POST",{type:e.type,category:e.category,tag:e.tag||null,amount:e.amount,currency:e.currency,account:e.account,label:e.label,date:e.date,btc_price_at_time:e.btcPriceAtTime||null});const id=saved?.[0]?.id||crypto.randomUUID();setLedger(l=>[{...e,id,btcPriceAtTime:e.btcPriceAtTime},...l]);}
      await saveWallets(newW);showToast(`✓ ${newEntries.length} transaction(s) saved`);
    }catch(err){console.error("Transaction save error:",err);setLedger(l=>[...newEntries.map(e=>({...e,id:Date.now()+Math.random()})),...l]);setWallets(newW);showToast("Saved locally (Supabase error)");}
  }

  function currencyToAccountNative(amt,fromCurrency,account){
    if(account==="revolut_sgd"||account==="uob_sgd"){
      if(fromCurrency==="USD"||fromCurrency==="USDT") return amt*rates.USDSGD;
      if(fromCurrency==="IDR") return amt*(rates.USDSGD/(rates.USDIDR||16200));
      if(fromCurrency==="BTC") return amt*(btcPrice||0)*rates.USDSGD;
      return amt;
    }
    if(account==="bca_idr"){
      if(fromCurrency==="USD"||fromCurrency==="USDT") return amt*(rates.USDIDR||16200);
      if(fromCurrency==="SGD") return amt*(rates.USDIDR||16200)/rates.USDSGD;
      if(fromCurrency==="BTC") return amt*(btcPrice||0)*(rates.USDIDR||16200);
      return amt;
    }
    if(account==="coinbase_btc"||account==="metamask_btc"){
      if(fromCurrency==="USD"||fromCurrency==="USDT") return amt/(btcPrice||1);
      if(fromCurrency==="SGD") return amt/rates.USDSGD/(btcPrice||1);
      if(fromCurrency==="IDR") return amt/(rates.USDIDR||16200)/(btcPrice||1);
      return amt;
    }
    if(account==="coinbase_usdt"||account==="metamask_usdt"){
      if(fromCurrency==="SGD") return amt/rates.USDSGD;
      if(fromCurrency==="IDR") return amt/(rates.USDIDR||16200);
      if(fromCurrency==="BTC") return amt*(btcPrice||0);
      return amt;
    }
    return amt;
  }

  async function bulkRecategorize(ids,category,tag){
    setLedger(l=>l.map(e=>ids.includes(e.id)?{...e,category,tag}:e));
    try{
      for(const id of ids){
        await sb(`ledger?id=eq.${id}`,"PATCH",{category,tag:tag||null});
      }
      showToast(`✓ Recategorized ${ids.length} entr${ids.length>1?"ies":"y"}`);
    }catch(err){
      console.error("Bulk recategorize error:",err);
      showToast("⚠ Some entries failed to save — check console");
    }
  }

  async function editEntry(original,updated){
    const newW={...wallets};

    // 1. Reverse the original entry's effect on its account
    if(original.account&&newW.hasOwnProperty(original.account)){
      const origNative=currencyToAccountNative(Math.abs(parseFloat(original.amount)||0),original.currency,original.account);
      if(original.type==="income"){
        newW[original.account]=Math.max(0,(newW[original.account]||0)-origNative);
      } else if(original.type==="expense"){
        newW[original.account]=(newW[original.account]||0)+origNative;
      } else if(original.type==="transfer"){
        if(original.label?.startsWith("Transfer →")) newW[original.account]=(newW[original.account]||0)+origNative;
        else if(original.label?.startsWith("Transfer ←")) newW[original.account]=Math.max(0,(newW[original.account]||0)-origNative);
      }
    }

    // 2. Apply the updated entry's effect on its (possibly new) account
    const newAccount=updated.account||original.account;
    const newAmt=Math.abs(parseFloat(updated.amount)||0);
    if(newAccount&&newW.hasOwnProperty(newAccount)){
      const newNative=currencyToAccountNative(newAmt,updated.currency,newAccount);
      if(original.type==="income"){
        newW[newAccount]=(newW[newAccount]||0)+newNative;
      } else if(original.type==="expense"){
        newW[newAccount]=Math.max(0,(newW[newAccount]||0)-newNative);
      } else if(original.type==="transfer"){
        if(original.label?.startsWith("Transfer →")) newW[newAccount]=Math.max(0,(newW[newAccount]||0)-newNative);
        else newW[newAccount]=(newW[newAccount]||0)+newNative;
      }
    }

    await saveWallets(newW);

    // 3. Update the existing Supabase row in place — no delete, no duplicate risk
    try{
      await sb(`ledger?id=eq.${original.id}`,"PATCH",{
        category:updated.category,
        tag:updated.tag||null,
        amount:newAmt,
        currency:updated.currency,
        account:newAccount,
        label:updated.label,
        date:updated.date,
      });
    }catch(err){ console.error("Edit save error:",err); }

    // 4. Update local state in place
    setLedger(l=>l.map(e=>e.id===original.id?{...e,category:updated.category,tag:updated.tag,amount:newAmt,currency:updated.currency,account:newAccount,label:updated.label,date:updated.date}:e));

    showToast("✓ Entry updated");
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

  // Reverse transfer
    if(entry&&entry.type==="transfer"){ 
      const amt=Math.abs(parseFloat(entry.amount)||0);
      const acc=entry.account||"revolut_sgd";
      let convertedAmt=amt;
      const newW={...wallets};
      if(entry.label?.startsWith("Transfer →")){
  // This was the outgoing leg — restore it
       newW[acc]=(newW[acc]||0)+convertedAmt;
     } else if(entry.label?.startsWith("Transfer ←")){
  // This was the incoming leg — remove it
      newW[acc]=Math.max(0,(newW[acc]||0)-convertedAmt);
   }
    await saveWallets(newW);
  showToast("✓ Transfer entry removed · balance restored");
  return;
}
    showToast("✓ Entry removed");
  }

  async function addOrder(o){
    setOrders(os=>[o,...os]);
    try{
      await sb("orders","POST",{
        id: o.id,
        client: o.client,
        item: o.items,
        items: o.items,
        vendor: o.vendor,
        platform: o.platform || "",
        currency: o.currency || "BTC",
        cost: o.costBTC,
        sale_price: o.saleBTC,
        btc_amount: o.saleBTC,
        date: o.date,
        status: o.status,
        delivered: o.delivered,
        delivery_days: null,
      });
      const currency=o.currency||"BTC";
      const profit=(parseFloat(o.saleBTC)||0)-(parseFloat(o.costBTC)||0);
      if(profit>0){
        const account=currency==="USDT"?"metamask_usdt":"metamask_btc";
        const incomeEntry={type:"income",category:"Dropshipping",amount:profit,currency,account,label:`ORD-${o.id} — ${o.client} (${o.vendor})`,date:o.date};
        await applyTransactions([incomeEntry]);
        const displayAmt=currency==="USDT"?`$${profit.toFixed(2)}`:`${profit.toFixed(6)} ₿`;
        showToast(`✓ Order saved · +${displayAmt} → ${currency==="USDT"?"MetaMask USDT":"MetaMask BTC"}`);
      }
    }catch(e){
      console.error("Order save error:",e);
      showToast("⚠ Order save failed — check console");
    }
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
      const currency=order.currency||"BTC";
      const account=currency==="USDT"?"metamask_usdt":"metamask_btc";
      const profit=Math.abs(parseFloat(order.saleBTC||0))-Math.abs(parseFloat(order.costBTC||0));
      if(profit>0){const newW={...wallets,[account]:Math.max(0,(wallets[account]||0)-profit)};await saveWallets(newW);}
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

  async function handleReconcile(newWallets){
    await saveWallets(newWallets);
    const now=new Date().toISOString();
    setLastReconciled(now);
    await saveSetting("last_reconciled",now);
  }

  async function handleSaveTarget(value){
    setIncomeTarget(value);
    await saveSetting("net_worth_target",value);
  }

  async function handleBTCFetch(){
    setBtcLoading(true);
    const[price,fx]=await Promise.all([fetchBTCPrice(),fetchFXRates()]);
    if(price){setBtcPrice(price);showToast(`₿ ${cu(price)} · FX updated`);}
    if(fx)setRates(fx);
    setBtcLoading(false);
  }

  const autoCostBasis = computeAvgCostBasis(ledger, btcCostBasis);
  const st={wallets,rates,btcCostBasis:autoCostBasis,ledger,orders,lastReconciled,netWorthTarget,lastVisitBanner:bannerDismissed?null:lastVisitBanner};
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

          {/* Current section trigger — opens the popup nav grid */}
          <button onClick={()=>setNavOpen(true)}
            style={{display:"flex",alignItems:"center",gap:8,background:"#F3F4F6",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",cursor:"pointer"}}>
            <span style={{fontSize:13}}>{NAV_ICONS[NAV_ITEMS.indexOf(view)]}</span>
            <span style={{fontSize:12,fontWeight:600,color:T.text,fontFamily:T.mono,letterSpacing:"0.04em"}}>{view}</span>
            <span style={{fontSize:9,color:T.textD}}>▾</span>
          </button>

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

      {/* Popup nav overlay */}
      {navOpen&&(
        <div onClick={()=>setNavOpen(false)}
          style={{position:"fixed",inset:0,background:"rgba(10,10,10,0.4)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"70px 20px 20px",overflowY:"auto"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:"#fff",borderRadius:12,padding:16,maxWidth:420,width:"100%",boxShadow:"0 12px 40px rgba(0,0,0,0.25)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,padding:"0 4px"}}>
              <span style={{fontSize:10,color:T.textM,letterSpacing:"0.14em",textTransform:"uppercase",fontFamily:T.mono,fontWeight:600}}>Go to</span>
              <button onClick={()=>setNavOpen(false)} style={{background:"none",border:"none",color:T.textD,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {NAV_ITEMS.map((n,i)=>(
                <button key={n} onClick={()=>{setView(n);setNavOpen(false);}}
                  style={{display:"flex",alignItems:"center",gap:10,background:view===n?T.text:"#F9FAFB",border:`1px solid ${view===n?T.text:T.border}`,borderRadius:8,padding:"14px 14px",cursor:"pointer",textAlign:"left"}}>
                  <span style={{fontSize:18,color:view===n?"#fff":T.textM}}>{NAV_ICONS[i]}</span>
                  <span style={{fontSize:13,fontWeight:view===n?600:500,color:view===n?"#fff":T.text,fontFamily:T.sans}}>{n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:1200,margin:"0 auto"}}>
        {view==="Dashboard"&&<Dashboard st={st} bp={btcPrice} onDismissBanner={()=>setBannerDismissed(true)}/>}
        {view==="Ledger"   &&<Ledger st={st} bp={btcPrice} onDelete={deleteEntry} onEdit={editEntry} onBulkRecategorize={bulkRecategorize}/>}
        {view==="Calendar" &&<CalendarView st={st} bp={btcPrice} onSaveTarget={handleSaveTarget}/>}
        {view==="Orders"   &&<Orders st={st} bp={btcPrice} onUpdateOrder={updateOrder} onAddOrder={addOrder} onDeleteOrder={deleteOrder}/>}
        {view==="Analytics"&&<Analytics st={st} bp={btcPrice}/>}
        {view==="Wallets"  &&<Wallets st={st} bp={btcPrice} onUpdate={handleUpdate} onTransfer={applyTransactions} showToast={showToast} onReconcile={handleReconcile}/>}
        {view==="Budget"&&<Budget st={st} bp={btcPrice} budgets={budgets} onSaveBudgets={saveBudgets} supplies={supplies} planned={planned} onAddPlanned={addPlanned} onTogglePlanned={togglePlanned} onDeletePlanned={deletePlanned}/>}
        {view==="Inventory"&&<SupplyTracker supplies={supplies} onAdd={addSupply} onRestock={restockSupply} onDelete={deleteSupply} onToggleInUse={toggleSupplyInUse} rates={rates} bp={btcPrice}/>}
      </div>

      {/* ── Floating AI Chat widget — bubble instead of a full tab ── */}
      {chatOpen&&(
        <div style={{position:"fixed",bottom:88,right:20,width:"min(400px, calc(100vw - 32px))",height:"min(620px, calc(100vh - 140px))",background:T.bg,border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 12px 40px rgba(0,0,0,0.22)",zIndex:250,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderBottom:`1px solid ${T.border}`,background:T.white,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{width:22,height:22,borderRadius:"50%",background:T.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontFamily:T.sans,fontWeight:700}}>AI</span>
              <span style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:T.sans}}>Financial Assistant</span>
            </div>
            <button onClick={()=>setChatOpen(false)} style={{background:"none",border:"none",color:T.textD,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
          </div>
          <div style={{flex:1,minHeight:0}}>
            <AIChat st={st} bp={btcPrice} onTransactions={applyTransactions} onBTCFetch={handleBTCFetch} btcLoading={btcLoading}/>
          </div>
        </div>
      )}
      <button onClick={()=>setChatOpen(v=>!v)}
        style={{position:"fixed",bottom:20,right:20,width:56,height:56,borderRadius:"50%",background:T.text,border:"none",color:"#fff",fontSize:22,cursor:"pointer",boxShadow:"0 6px 20px rgba(0,0,0,0.25)",zIndex:251,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {chatOpen?"×":"✦"}
      </button>

      {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}