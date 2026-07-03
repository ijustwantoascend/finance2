import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://jhfvkgxzdvyowaehzooj.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZnZrZ3h6ZHZ5b3dhZWh6b29qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MTk3MzMsImV4cCI6MjA5ODQ5NTczM30.5Gf8RYH6qXdJkm7NJHaIOxsiEAEGpeKy_84q1KjQRzM";

const sb = async (path, method="GET", body=null) => {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=representation",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const EXPENSE_CATS = ["Dad","Mom","Sam","Glenn","Personal","Dating","Gas","Gear","Miscellaneous","Family","Debt Repayment"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_KEYS   = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const NAV_ITEMS    = ["Dashboard","Ledger","Calendar","Orders","Analytics","Wallets","AI Chat"];
const NAV_ICONS    = ["◈","≡","▦","⊞","∿","◎","✦"];

const HISTORICAL = {
  "2026-04": { inc:4684.00, cost:2416.15, cats:{Dad:315.07,Mom:62.21,Sam:30.23,Glenn:0,Personal:232.24,Dating:188.05,Gas:94.19,Gear:242.63,Miscellaneous:37.87,Family:216.08,"Debt Repayment":0}},
  "2026-05": { inc:5533.35, cost:3075.17, cats:{Dad:1034.88,Mom:87.21,Sam:612.62,Glenn:0,Personal:563.49,Dating:198.31,Gas:81.40,Gear:395.35,Miscellaneous:145.35,Family:7.97,"Debt Repayment":0}},
  "2026-06": { inc:6446.00, cost:1617.49, cats:{Dad:309.40,Mom:130.95,Sam:130.95,Glenn:0,Personal:205.71,Dating:231.85,Gas:61.66,Gear:363.22,Miscellaneous:140.13,Family:44.84,"Debt Repayment":0}},
};


const DEFAULT_WALLETS = {coinbase_btc:0.07610612,metamask_btc:0.0569,coinbase_usdt:641.79,uob_sgd:4439,revolut_sgd:23,bca_idr:2981000};
const DEFAULT_RATES   = {USDSGD:1.354,USDIDR:16200};

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
const cu  = (n,d=2) => "$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
const csg = n => "S$"+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const cid = n => "Rp "+Math.round(n||0).toLocaleString("id-ID");
const cbt = n => Number(n||0).toFixed(6)+" ₿";
const cp  = n => (Number(n||0)*100).toFixed(1)+"%";
const pct = (a,b) => b?((a-b)/b*100).toFixed(1):"0.0";

function toUSD(amount,currency,rates,bp){
  const a=parseFloat(amount||0);
  if(currency==="BTC") return a*(bp||0);
  if(currency==="SGD") return a/(rates.USDSGD||1.354);
  if(currency==="IDR") return a/(rates.USDIDR||16200);
  return a;
}
function totalBTC(w){return(w.coinbase_btc||0)+(w.metamask_btc||0);}
function netWorth(w,bp,rates){
  return totalBTC(w)*(bp||0)+(w.coinbase_usdt||0)+(w.uob_sgd||0)/(rates.USDSGD||1.354)+(w.revolut_sgd||0)/(rates.USDSGD||1.354)+(w.bca_idr||0)/(rates.USDIDR||16200);
}
function buildMonth(ym,ledger,bp,rates){
  const hist=HISTORICAL[ym];
  const entries=ledger.filter(e=>e.date?.startsWith(ym));
  const incE=entries.filter(e=>e.type==="income");
  const expE=entries.filter(e=>e.type==="expense");
  const liveInc=incE.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const liveExp=expE.reduce((s,e)=>s+toUSD(e.amount,e.currency,rates,bp),0);
  const liveCats={};EXPENSE_CATS.forEach(c=>liveCats[c]=0);
  expE.forEach(e=>{if(e.category)liveCats[e.category]=(liveCats[e.category]||0)+toUSD(e.amount,e.currency,rates,bp);});
  const inc=(hist?.inc||0)+liveInc,cost=(hist?.cost||0)+liveExp;
  const cats={};EXPENSE_CATS.forEach(c=>cats[c]=(hist?.cats[c]||0)+(liveCats[c]||0));
  return{inc,cost,net:inc-cost,margin:inc>0?(inc-cost)/inc:0,cats,liveEntries:entries.length};
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ENGINE
// ─────────────────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.REACT_APP_ANTHROPIC_API_KEY;

async function callClaude(messages,system,tools=[]){
  const body={model:"claude-sonnet-4-6",max_tokens:1500,system,messages};
  if(tools.length) body.tools=tools;
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{
      "Content-Type":"application/json",
      "x-api-key":ANTHROPIC_KEY,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true",
    },body:JSON.stringify(body),
  });
  const d=await r.json();
  if(d.error) throw new Error(d.error.message);
  return d.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"";
}

async function parseTransaction(text,rates,bp){
  const today=new Date().toISOString().slice(0,10);
  const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const sys=`You are a financial transaction parser for a crypto entrepreneur based in Singapore/Indonesia.
 
FINANCIAL FLOW:
- INCOME: always crypto. BTC goes to metamask_btc or coinbase_btc. USDT goes to coinbase_usdt or metamask_usdt.
- EXPENSES: always fiat. SGD from revolut_sgd. IDR from bca_idr. Never deduct from crypto for expenses.
- TRANSFERS: moving money between accounts (not income or expense). Parse as two entries: expense from source + income to destination.
 
ACCOUNTS:
- metamask_btc → BTC wallet
- coinbase_btc → BTC on Coinbase
- coinbase_usdt → USDT on Coinbase
- metamask_usdt → USDT on MetaMask
- uob_sgd → UOB bank (SGD)
- revolut_sgd → Revolut (SGD) ← default for SGD expenses
- bca_idr → BCA bank (IDR) ← for IDR expenses
 
EXPENSE CATEGORIES (use EXACTLY one, no variations):
Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Miscellaneous, Family, Debt Repayment
 
CATEGORY MAPPING:
- dad, father, papa → Dad
- mom, mother, mama, mum → Mom
- sam → Sam
- glenn → Glenn
- gear, steroids, mast, test, tren, testosterone, anavar, winstrol, deca, eq, npp, bloodwork, blood test, labs, needles, syringes, pins, vials, any PED or steroid → Gear
- gas, fuel, petrol, transport, grab, taxi, uber, gojek → Gas
- dating, date, girlfriend, flowers, restaurant date → Dating
- personal, haircut, grooming, supplements, supps, vitamins, protein, creatine, pre workout → Personal
- family, food, groceries, dinner, lunch, breakfast → Family
- debt, loan, repayment, installment → Debt Repayment
- anything else → Miscellaneous
 
CURRENCY RULES:
- "$", "dollar", "usd" in EXPENSES = SGD (expenses are always fiat, revolut_sgd)
- "IDR", "ribu", "rb", "ribu", "juta" = IDR → bca_idr
- "SGD", "S$" = SGD → revolut_sgd
- BTC income → metamask_btc by default (unless user says coinbase)
- USDT income → coinbase_usdt by default (unless user says metamask)
 
TRANSFER DETECTION:
If user says "transfer", "withdraw", "move", "send" between accounts, create TWO entries:
1. expense from source account
2. income to destination account
Both with same amount and date.
Transfer pairs:
- metamask → coinbase: metamask_btc → coinbase_btc
- coinbase → uob: coinbase_usdt or coinbase_btc → uob_sgd (convert to SGD)
- uob → revolut: uob_sgd → revolut_sgd
- revolut → bca: revolut_sgd → bca_idr (convert to IDR)
 
CRITICAL:
- date = YYYY-MM-DD always. Today = ${today}. Yesterday = ${yesterday}. Never write "today".
- account must never be null. Default expenses to revolut_sgd.
- amount must be positive.
- type must be exactly "income" or "expense".
 
Return ONLY valid JSON array, no markdown.
[{"type":"income|expense","category":"...","amount":0,"currency":"BTC|USDT|SGD|IDR","account":"...","label":"...","date":"YYYY-MM-DD"}]`;
  const txt=await callClaude([{role:"user",content:text}],sys);
  const clean=txt.replace(/```json[\s\S]*?```|```/g,"").trim();
  const parsed=JSON.parse(clean);
  return parsed.map(e=>({
    ...e,
    type: e.type==="income"?"income":"expense",
    amount: Math.abs(parseFloat(e.amount)||0),
    currency: e.currency||"SGD",
    account: e.account||"revolut_sgd",
    category: (()=>{
      if(!e.category) return "Miscellaneous";
      const raw=e.category.toLowerCase().trim();
      const exact=EXPENSE_CATS.find(c=>c.toLowerCase()===raw);
      if(exact) return exact;
      const partial=EXPENSE_CATS.find(c=>raw.includes(c.toLowerCase())||c.toLowerCase().includes(raw));
      if(partial) return partial;
      return "Miscellaneous";
    })(),
    date: (e.date&&/^\d{4}-\d{2}-\d{2}$/.test(e.date))?e.date:today,
  }));
}

async function aiChat(userMsg,state,bp,chatHistory){
  const nw=netWorth(state.wallets,bp,state.rates);
  const thisM=new Date().toISOString().slice(0,7);
  const md=buildMonth(thisM,state.ledger,bp,state.rates);
  const btcTotal=totalBTC(state.wallets);
  const btcPnL=bp&&state.btcCostBasis?(bp-state.btcCostBasis)*btcTotal:0;
  const recentTx=state.ledger.slice(0,5).map(e=>`${e.date} [${e.type}] ${e.label||e.category} ${e.amount} ${e.currency}`).join("\n")||"none";
  const sys=`You are Jo's personal finance AI — sharp, direct, data-driven.
 
  FINANCIAL FLOW:
  - INCOME: BTC (→ metamask_btc or coinbase_btc) or USDT (→ coinbase_usdt or metamask_usdt)
  - EXPENSES: SGD from revolut_sgd, IDR from bca_idr. "$" in expenses = SGD not USD.
  - TRANSFERS: metamask→coinbase, coinbase→UOB, UOB→Revolut, Revolut→BCA
   
  ACCOUNTS: metamask_btc, coinbase_btc, coinbase_usdt, metamask_usdt, uob_sgd, revolut_sgd, bca_idr
  EXPENSE CATEGORIES: Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Miscellaneous, Family, Debt Repayment
   
  LIVE STATE:
  - BTC: ${bp?cu(bp):"unknown"} | Cost basis: ${cu(state.btcCostBasis)} | BTC PnL: ${cu(btcPnL)}
  - Total BTC: ${cbt(btcTotal)} = ${bp?cu(btcTotal*bp):"?"}
  - Net worth: ${cu(nw)} = ${csg(nw*state.rates.USDSGD)}
  - MetaMask BTC: ${cbt(state.wallets.metamask_btc)} | Coinbase BTC: ${cbt(state.wallets.coinbase_btc)}
  - Coinbase USDT: ${cu(state.wallets.coinbase_usdt)} | MetaMask USDT: ${cu(state.wallets.metamask_usdt)}
  - UOB: ${csg(state.wallets.uob_sgd)} | Revolut: ${csg(state.wallets.revolut_sgd)} | BCA: Rp ${Math.round(state.wallets.bca_idr||0).toLocaleString()}
  - This month: ${cu(md.inc)} income | ${cu(md.cost)} costs | ${cp(md.margin)} margin
  - FX: 1 USD = ${state.rates.USDSGD?.toFixed(4)} SGD (live)
  - Recent: ${recentTx}
   
  If the user describes income, expenses, or transfers — output at the very end:
  <TRANSACTIONS>[{"type":"income|expense","category":"...","amount":0,"currency":"BTC|USDT|SGD|IDR","account":"metamask_btc|coinbase_btc|coinbase_usdt|metamask_usdt|uob_sgd|revolut_sgd|bca_idr","label":"...","date":"YYYY-MM-DD"}]</TRANSACTIONS>
   
  TRANSACTION RULES:
  - "$" or "dollar" in expenses = SGD → revolut_sgd
  - IDR amounts → bca_idr
  - BTC income → metamask_btc
  - Transfers = two entries (expense from source + income to destination)
  - date must be YYYY-MM-DD, never "today". Today = ${new Date().toISOString().slice(0,10)}
  - account must never be null
  - category must be exactly one of: Dad, Mom, Sam, Glenn, Personal, Dating, Gas, Gear, Miscellaneous, Family, Debt Repayment
   
  Be concise, data-driven, give real advice.`;
  return await callClaude([...chatHistory.slice(-8),{role:"user",content:userMsg}],sys);
}

async function fetchBTCPrice(){
  try{
    const r=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const d=await r.json();
    return d.bitcoin?.usd||null;
  }catch{
    try{
      const r2=await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      const d2=await r2.json();
      return parseFloat(d2.price)||null;
    }catch{ return null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function Metric({label,value,sub,color="#F5F5F0",trend}){
  return(
    <div style={{padding:"20px 24px",borderRight:"1px solid #1C1C1C",borderBottom:"1px solid #1C1C1C"}}>
      <div style={{fontSize:10,color:"#4A4A4A",letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:10,fontFamily:"'SF Mono',monospace"}}>{label}</div>
      <div style={{fontSize:22,fontWeight:700,color,lineHeight:1,letterSpacing:"-0.02em"}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:"#3A3A3A",marginTop:6,fontFamily:"'SF Mono',monospace"}}>{sub}</div>}
      {trend!==undefined&&<div style={{fontSize:11,color:trend>=0?"#4ADE80":"#F87171",marginTop:4}}>{trend>=0?"↑":"↓"} {Math.abs(trend).toFixed(1)}%</div>}
    </div>
  );
}
function Badge({children,color="#4ADE80"}){
  return<span style={{display:"inline-block",background:color+"18",color,border:`1px solid ${color}30`,borderRadius:3,padding:"2px 7px",fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,fontFamily:"'SF Mono',monospace"}}>{children}</span>;
}
function Card({children,style={}}){
  return<div style={{background:"#0F0F0F",border:"1px solid #1C1C1C",borderRadius:10,overflow:"hidden",...style}}>{children}</div>;
}
function CardHeader({title,action}){
  return(
    <div style={{padding:"14px 20px",borderBottom:"1px solid #1C1C1C",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:10,color:"#4A4A4A",letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"'SF Mono',monospace"}}>{title}</span>
      {action}
    </div>
  );
}
function Pill({label,value,color="#C0C0C0"}){
  return(
    <div style={{display:"flex",justifyContent:"space-between",padding:"11px 20px",borderBottom:"1px solid #111"}}>
      <span style={{fontSize:13,color:"#555",fontFamily:"'SF Mono',monospace"}}>{label}</span>
      <span style={{fontSize:13,fontWeight:600,color,fontFamily:"'SF Mono',monospace"}}>{value}</span>
    </div>
  );
}
const CustomTooltip=({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:"#151515",border:"1px solid #2A2A2A",borderRadius:6,padding:"10px 14px"}}>
      <div style={{fontSize:11,color:"#666",marginBottom:4}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{fontSize:13,color:p.color,fontWeight:600}}>{p.name}: {cu(p.value)}</div>)}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────
function Toast({msg,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,3000);return()=>clearTimeout(t);},[]);
  return(
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1C1C1C",border:"1px solid #2A2A2A",borderRadius:8,padding:"10px 20px",fontSize:12,color:"#F5F5F0",fontFamily:"'SF Mono',monospace",zIndex:9999,whiteSpace:"nowrap"}}>
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEWS
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({st,bp}){
  const{wallets:w,rates,ledger,orders,btcCostBasis}=st;
  const nw=netWorth(w,bp,rates);
  const btcTotal=totalBTC(w);
  const btcPnL=bp&&btcCostBasis?(bp-btcCostBasis)*btcTotal:0;
  const btcPnLPct=btcCostBasis?((bp||0)-btcCostBasis)/btcCostBasis*100:0;
  const thisM=new Date().toISOString().slice(0,7);
  const md=buildMonth(thisM,ledger,bp,rates);
  const chartData=["2026-04","2026-05","2026-06",thisM].filter((v,i,a)=>a.indexOf(v)===i).map(ym=>{
    const m=buildMonth(ym,ledger,bp,rates);
    return{month:MONTHS_SHORT[parseInt(ym.split("-")[1])-1],income:Math.round(m.inc),costs:Math.round(m.cost),net:Math.round(m.net)};
  });
  const pieData=EXPENSE_CATS.map(c=>({name:c,value:md.cats[c]||0})).filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,6);
  const COLORS=["#F87171","#FB923C","#FBBF24","#4ADE80","#60A5FA","#A78BFA"];
  const openOrders=orders.filter(o=>o.status!=="delivered");
  return(
    <div style={{paddingBottom:24}}>
      <div style={{padding:"28px 24px 0"}}>
        <div style={{fontSize:10,color:"#3A3A3A",letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:8,fontFamily:"'SF Mono',monospace"}}>Total net worth</div>
        <div style={{display:"flex",alignItems:"baseline",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:44,fontWeight:800,letterSpacing:"-0.04em",color:"#F5F5F0",lineHeight:1}}>{bp?cu(nw):"—"}</div>
          {bp&&<div style={{fontSize:13,color:btcPnL>=0?"#4ADE80":"#F87171",fontFamily:"'SF Mono',monospace"}}>{btcPnL>=0?"▲":"▼"} {cu(Math.abs(btcPnL))} BTC PnL ({btcPnLPct.toFixed(1)}%)</div>}
        </div>
        <div style={{display:"flex",gap:16,marginTop:6,flexWrap:"wrap"}}>
          <span style={{fontSize:11,color:"#2A2A2A",fontFamily:"'SF Mono',monospace"}}>{cbt(btcTotal)} @ {bp?cu(bp):"—"}/BTC</span>
          {bp&&<span style={{fontSize:11,color:"#2A2A2A",fontFamily:"'SF Mono',monospace"}}>{csg(nw*rates.USDSGD)} SGD</span>}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",marginTop:20}}>
        <Metric label="Income (mo)" value={cu(md.inc)} color="#4ADE80" trend={parseFloat(pct(md.inc,5533))}/>
        <Metric label="Expenses (mo)" value={cu(md.cost)} color="#F87171"/>
        <Metric label="Net (mo)" value={cu(md.net)} color={md.net>=0?"#4ADE80":"#F87171"}/>
        <Metric label="Margin" value={cp(md.margin)} color={md.margin>0.5?"#4ADE80":"#FBBF24"}/>
        <Metric label="Open Orders" value={openOrders.length} color="#60A5FA" sub={cu(openOrders.reduce((s,o)=>s+(o.salePrice-o.cost),0))+" pending"}/>
        <Metric label="Order P&L" value={cu(orders.reduce((s,o)=>s+(o.salePrice-o.cost),0))} color="#A78BFA"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,padding:"16px 16px 0"}}>
        <Card>
          <CardHeader title="Monthly P&L"/>
          <div style={{padding:"12px 0 8px"}}>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} barGap={2}>
                <XAxis dataKey="month" tick={{fill:"#3A3A3A",fontSize:10,fontFamily:"SF Mono"}} axisLine={false} tickLine={false}/>
                <YAxis hide/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="income" fill="#4ADE8040" stroke="#4ADE80" strokeWidth={1} radius={[3,3,0,0]} name="Income"/>
                <Bar dataKey="costs"  fill="#F8717140" stroke="#F87171" strokeWidth={1} radius={[3,3,0,0]} name="Costs"/>
                <Bar dataKey="net"    fill="#60A5FA40" stroke="#60A5FA" strokeWidth={1} radius={[3,3,0,0]} name="Net"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Spend by Category"/>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} dataKey="value" paddingAngle={2}>
                {pieData.map((e,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={v=>cu(v)}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{padding:"0 16px 10px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
            {pieData.slice(0,4).map((d,i)=>(
              <div key={d.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:"#444"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:COLORS[i],flexShrink:0}}/>
                <span style={{fontFamily:"'SF Mono',monospace"}}>{d.name} {cu(d.value,0)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,padding:"12px 16px 0"}}>
        <Card>
          <CardHeader title="Accounts"/>
          <Pill label="Coinbase BTC" value={cbt(w.coinbase_btc)} color="#FBBF24"/>
          <Pill label="MetaMask BTC" value={cbt(w.metamask_btc)} color="#FBBF24"/>
          <Pill label="Coinbase USDT" value={cu(w.coinbase_usdt)} color="#4ADE80"/>
          <Pill label="UOB SGD" value={csg(w.uob_sgd)}/>
          <Pill label="Revolut SGD" value={csg(w.revolut_sgd)}/>
          <Pill label="BCA IDR" value={cid(w.bca_idr)}/>
        </Card>
        <Card>
          <CardHeader title="Open Orders"/>
          {openOrders.length===0&&<div style={{padding:"24px 20px",color:"#2A2A2A",fontSize:13,fontFamily:"'SF Mono',monospace"}}>No open orders.</div>}
          {openOrders.map(o=>(
            <div key={o.id} style={{padding:"12px 20px",borderBottom:"1px solid #111"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:13,color:"#F5F5F0",fontWeight:500,marginBottom:2}}>{o.item}</div>
                  <div style={{fontSize:11,color:"#444",fontFamily:"'SF Mono',monospace"}}>{o.client} · {o.date}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:13,color:"#4ADE80",fontWeight:700,fontFamily:"'SF Mono',monospace"}}>{cu(o.salePrice-o.cost)}</div>
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

function Ledger({st,bp,onDelete}){
  const[typeF,setTypeF]=useState("all");
  const[catF,setCatF]=useState("all");
  const[monthF,setMonthF]=useState("all");
  const{ledger,rates}=st;
  const filtered=ledger.filter(e=>{
    const tOk=typeF==="all"||e.type===typeF;
    const cOk=catF==="all"||e.category===catF;
    const mOk=monthF==="all"||e.date?.startsWith(monthF);
    return tOk&&cOk&&mOk;
  });
  const sel={background:"#111",border:"1px solid #222",color:"#888",borderRadius:5,padding:"6px 10px",fontSize:11,fontFamily:"'SF Mono',monospace",outline:"none"};
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
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
          {MONTH_KEYS.map((mk,i)=><option key={mk} value={`2026-${mk}`}>{MONTHS_SHORT[i]} 2026</option>)}
        </select>
        <span style={{fontSize:11,color:"#333",fontFamily:"'SF Mono',monospace",alignSelf:"center"}}>{filtered.length} entries</span>
      </div>
      {filtered.length===0?(
        <Card style={{padding:"48px 24px",textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:10}}>≡</div>
          <div style={{color:"#333",fontSize:13,fontFamily:"'SF Mono',monospace"}}>No entries yet.</div>
          <div style={{color:"#222",fontSize:11,marginTop:4,fontFamily:"'SF Mono',monospace"}}>Use AI Chat to log transactions.</div>
        </Card>
      ):(
        <Card>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"'SF Mono',monospace",minWidth:600}}>
              <thead>
                <tr style={{borderBottom:"1px solid #1C1C1C"}}>
                  {["Date","Description","Category","Amount","≈ USD","Account","Type",""].map(h=>(
                    <th key={h} style={{textAlign:"left",padding:"10px 14px",color:"#333",fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:500}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(e=>{
                  const usd=toUSD(e.amount,e.currency,rates,bp);
                  return(
                    <tr key={e.id} style={{borderBottom:"1px solid #0D0D0D"}}>
                      <td style={{padding:"10px 14px",color:"#444"}}>{e.date}</td>
                      <td style={{padding:"10px 14px",color:"#C0C0C0",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.label||"—"}</td>
                      <td style={{padding:"10px 14px",color:"#555"}}>{e.category||"—"}</td>
                      <td style={{padding:"10px 14px",color:e.type==="income"?"#4ADE80":"#F87171",fontWeight:700}}>{e.type==="income"?"+":"-"}{e.amount} {e.currency}</td>
                      <td style={{padding:"10px 14px",color:"#444"}}>{cu(usd)}</td>
                      <td style={{padding:"10px 14px",color:"#333",fontSize:11}}>{e.account||"—"}</td>
                      <td style={{padding:"10px 14px"}}><Badge color={e.type==="income"?"#4ADE80":"#F87171"}>{e.type}</Badge></td>
                      <td style={{padding:"10px 14px"}}>
                        <button onClick={()=>onDelete(e.id)} style={{background:"none",border:"none",color:"#2A2A2A",cursor:"pointer",fontSize:13}}>✕</button>
                      </td>
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

function CalendarView({st,bp}){
  const[year,setYear]=useState(2026);
  const{ledger,rates}=st;
  const thisM=new Date().toISOString().slice(0,7);
  const yearData=MONTH_KEYS.map((mk,i)=>{
    const ym=`${year}-${mk}`;
    const md=buildMonth(ym,ledger,bp,rates);
    const prevMd=i>0?buildMonth(`${year}-${MONTH_KEYS[i-1]}`,ledger,bp,rates):null;
    const lastBal=i===0?8900:(prevMd?.net||0);
    return{...md,month:MONTHS_SHORT[i],ym,lastBal,endBal:lastBal+md.net,hasData:md.inc>0||md.cost>0};
  });
  const totals=yearData.reduce((acc,m)=>({inc:acc.inc+m.inc,cost:acc.cost+m.cost}),{inc:0,cost:0});
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:10,color:"#3A3A3A",letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"'SF Mono',monospace"}}>Annual Earnings Calendar</span>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>setYear(y=>y-1)} style={{background:"#111",border:"1px solid #222",color:"#666",borderRadius:4,padding:"4px 10px",cursor:"pointer"}}>‹</button>
          <span style={{fontSize:13,fontWeight:700,color:"#F5F5F0",fontFamily:"'SF Mono',monospace",padding:"0 8px"}}>{year}</span>
          <button onClick={()=>setYear(y=>y+1)} style={{background:"#111",border:"1px solid #222",color:"#666",borderRadius:4,padding:"4px 10px",cursor:"pointer"}}>›</button>
        </div>
      </div>
      <Card style={{marginBottom:16,overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"'SF Mono',monospace",minWidth:650}}>
          <thead>
            <tr style={{borderBottom:"1px solid #1C1C1C"}}>
              {["Month","Last Bal","Earnings","Costs","Net","End Balance","Margin","SGD Net"].map(h=>(
                <th key={h} style={{textAlign:h==="Month"?"left":"right",padding:"10px 12px",color:"#333",fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,whiteSpace:"nowrap"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {yearData.map(m=>{
              const isCur=m.ym===thisM;
              return(
                <tr key={m.ym} style={{borderBottom:"1px solid #0D0D0D",background:isCur?"#111":"transparent",opacity:m.hasData?1:0.2}}>
                  <td style={{padding:"10px 12px",color:isCur?"#FBBF24":"#888",fontWeight:isCur?700:400}}>{m.month}{isCur?" ●":""}</td>
                  <td style={{padding:"10px 12px",color:"#444",textAlign:"right"}}>{m.hasData?cu(m.lastBal):"—"}</td>
                  <td style={{padding:"10px 12px",color:"#4ADE80",textAlign:"right",fontWeight:600}}>{m.hasData?cu(m.inc):"—"}</td>
                  <td style={{padding:"10px 12px",color:"#F87171",textAlign:"right"}}>{m.cost>0?cu(m.cost):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.net>=0?"#4ADE80":"#F87171",textAlign:"right",fontWeight:600}}>{m.hasData?cu(m.net):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.endBal>=0?"#60A5FA":"#F87171",textAlign:"right",fontWeight:700}}>{m.hasData?cu(m.endBal):"—"}</td>
                  <td style={{padding:"10px 12px",color:m.margin>0.5?"#4ADE80":"#888",textAlign:"right"}}>{m.hasData?cp(m.margin):"—"}</td>
                  <td style={{padding:"10px 12px",color:"#555",textAlign:"right"}}>{m.hasData?csg(m.net*rates.USDSGD):"—"}</td>
                </tr>
              );
            })}
            <tr style={{borderTop:"1px solid #2A2A2A"}}>
              <td style={{padding:"12px 12px",fontWeight:700,color:"#F5F5F0"}}>TOTAL {year}</td>
              <td style={{padding:"12px 12px",textAlign:"right",color:"#444"}}>—</td>
              <td style={{padding:"12px 12px",color:"#4ADE80",textAlign:"right",fontWeight:700}}>{cu(totals.inc)}</td>
              <td style={{padding:"12px 12px",color:"#F87171",textAlign:"right",fontWeight:700}}>{cu(totals.cost)}</td>
              <td style={{padding:"12px 12px",color:totals.inc-totals.cost>=0?"#4ADE80":"#F87171",textAlign:"right",fontWeight:700}}>{cu(totals.inc-totals.cost)}</td>
              <td style={{padding:"12px 12px",textAlign:"right",color:"#555"}}>—</td>
              <td style={{padding:"12px 12px",color:"#4ADE80",textAlign:"right",fontWeight:700}}>{cp(totals.inc>0?(totals.inc-totals.cost)/totals.inc:0)}</td>
              <td style={{padding:"12px 12px",color:"#555",textAlign:"right"}}>{csg((totals.inc-totals.cost)*rates.USDSGD)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
      <Card style={{overflowX:"auto"}}>
        <CardHeader title={`Expense Categories · ${year}`}/>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"'SF Mono',monospace",minWidth:800}}>
            <thead>
              <tr style={{borderBottom:"1px solid #1C1C1C"}}>
                <th style={{textAlign:"left",padding:"8px 12px",color:"#333",fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:500,width:120}}>Category</th>
                {MONTHS_SHORT.map(m=><th key={m} style={{textAlign:"right",padding:"8px 6px",color:"#333",fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:500,minWidth:50}}>{m}</th>)}
                <th style={{textAlign:"right",padding:"8px 12px",color:"#555",fontSize:10,fontWeight:600}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {EXPENSE_CATS.map(cat=>{
                const vals=MONTH_KEYS.map(mk=>buildMonth(`${year}-${mk}`,ledger,bp,rates).cats[cat]||0);
                const total=vals.reduce((a,b)=>a+b,0);
                return(
                  <tr key={cat} style={{borderBottom:"1px solid #0D0D0D"}}>
                    <td style={{padding:"8px 12px",color:"#555"}}>{cat}</td>
                    {vals.map((v,i)=><td key={i} style={{padding:"8px 6px",textAlign:"right",color:v>0?"#F87171":"#1C1C1C"}}>{v>0?cu(v,0):"—"}</td>)}
                    <td style={{padding:"8px 12px",textAlign:"right",color:"#F87171",fontWeight:700}}>{total>0?cu(total):"—"}</td>
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

function Orders({ st, bp, onUpdateOrder, onAddOrder, onDeleteOrder }) {
  const { orders } = st;
  const [showForm, setShowForm] = useState(false);
  const [vendors, setVendors] = useState(["Violet", "Fiona", "Zhongshui"]);
  const [newVendor, setNewVendor] = useState("");
  const [showVendorInput, setShowVendorInput] = useState(false);
  const [form, setForm] = useState({
    client: "", platform: "", vendor: "Violet",
    items: "", costBTC: "", saleBTC: "",
    date: new Date().toISOString().slice(0, 10),
    delivered: false, note: "",
  });

  function orderStats(o) {
    const costBTC   = parseFloat(o.costBTC  || o.cost      || 0);
    const saleBTC   = parseFloat(o.saleBTC  || o.salePrice || 0);
    const profitBTC = saleBTC - costBTC;
    const profitUSD = profitBTC * (bp || 0);
    const margin    = saleBTC > 0 ? profitBTC / saleBTC : 0;
    return { costBTC, saleBTC, profitBTC, profitUSD, margin };
  }

  const totals = orders.reduce((acc, o) => {
    const s = orderStats(o);
    return { costBTC: acc.costBTC + s.costBTC, saleBTC: acc.saleBTC + s.saleBTC, profitBTC: acc.profitBTC + s.profitBTC, profitUSD: acc.profitUSD + s.profitUSD };
  }, { costBTC: 0, saleBTC: 0, profitBTC: 0, profitUSD: 0 });

  const avgMargin  = totals.saleBTC > 0 ? totals.profitBTC / totals.saleBTC : 0;
  const openCount  = orders.filter(o => !o.delivered).length;
  const doneCount  = orders.filter(o => o.delivered).length;

  function addVendor() {
    if (!newVendor.trim()) return;
    setVendors(v => [...v, newVendor.trim()]);
    setNewVendor("");
    setShowVendorInput(false);
  }

  function removeVendor(v) {
    setVendors(vs => vs.filter(x => x !== v));
  }

  function submitOrder() {
    if (!form.client || !form.saleBTC) return;
    const o = {
      id: "ORD-" + Date.now(),
      client:    form.client,
      platform:  form.platform,
      vendor:    form.vendor,
      items:     form.items,
      costBTC:   parseFloat(form.costBTC) || 0,
      saleBTC:   parseFloat(form.saleBTC) || 0,
      cost:      parseFloat(form.costBTC) || 0,
      salePrice: parseFloat(form.saleBTC) || 0,
      btcAmount: parseFloat(form.saleBTC) || 0,
      date:      form.date,
      delivered: form.delivered,
      status:    form.delivered ? "delivered" : "pending",
      note:      form.note,
      deliveryDays: null,
    };
    onAddOrder(o);
    setShowForm(false);
    setForm({ client:"", platform:"", vendor: vendors[0]||"Violet", items:"", costBTC:"", saleBTC:"", date: new Date().toISOString().slice(0,10), delivered:false, note:"" });
  }

  const cbt6 = n => Number(n||0).toFixed(6) + " ₿";
  const cbt4 = n => Number(n||0).toFixed(4) + " ₿";

  const inp  = { background:"#111", border:"1px solid #222", color:"#F5F5F0", borderRadius:5, padding:"7px 10px", fontSize:12, fontFamily:"'SF Mono',monospace", outline:"none", width:"100%" };
  const lbl  = { fontSize:10, color:"#444", letterSpacing:"0.14em", textTransform:"uppercase", marginBottom:5, display:"block", fontFamily:"'SF Mono',monospace" };
  const td   = { padding:"11px 14px", borderBottom:"1px solid #0D0D0D", verticalAlign:"middle", fontFamily:"'SF Mono',monospace", fontSize:12 };
  const th   = { textAlign:"left", padding:"9px 14px", color:"#2A2A2A", fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:500, fontFamily:"'SF Mono',monospace", whiteSpace:"nowrap", borderBottom:"1px solid #1C1C1C" };

  const profitPreview = (parseFloat(form.saleBTC)||0) - (parseFloat(form.costBTC)||0);

  return (
    <div style={{ padding:"20px 16px" }}>

      {/* Metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:1, marginBottom:16, border:"1px solid #1C1C1C", borderRadius:10, overflow:"hidden" }}>
        <Metric label="Total Revenue" value={cbt4(totals.saleBTC)}   color="#4ADE80" sub={bp ? cu(totals.saleBTC*(bp||0))   : "—"} />
        <Metric label="Total Cost"    value={cbt4(totals.costBTC)}   color="#F87171" sub={bp ? cu(totals.costBTC*(bp||0))   : "—"} />
        <Metric label="Total Profit"  value={cbt4(totals.profitBTC)} color="#60A5FA" sub={bp ? cu(totals.profitUSD)          : "—"} />
        <Metric label="Avg Margin"    value={cp(avgMargin)}           color="#FBBF24" />
        <Metric label="Pending"       value={openCount}               color="#F87171" sub={`${doneCount} delivered`} />
        {bp && <Metric label="Live Profit USD" value={cu(totals.profitUSD)} color="#A78BFA" sub={`@ ${cu(bp)}/BTC`} />}
      </div>

      {/* Vendor manager */}
      <div style={{ background:"#0F0F0F", border:"1px solid #1C1C1C", borderRadius:8, padding:"12px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <span style={{ fontSize:10, color:"#333", letterSpacing:"0.14em", textTransform:"uppercase", fontFamily:"'SF Mono',monospace", marginRight:4 }}>Vendors:</span>
        {vendors.map(v => (
          <div key={v} style={{ display:"flex", alignItems:"center", gap:4, background:"#151515", border:"1px solid #222", borderRadius:4, padding:"3px 10px" }}>
            <span style={{ fontSize:11, color:"#888", fontFamily:"'SF Mono',monospace" }}>{v}</span>
            <button onClick={() => removeVendor(v)} style={{ background:"none", border:"none", color:"#333", cursor:"pointer", fontSize:11, padding:"0 0 0 4px", lineHeight:1 }}>✕</button>
          </div>
        ))}
        {showVendorInput ? (
          <div style={{ display:"flex", gap:6 }}>
            <input value={newVendor} onChange={e=>setNewVendor(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVendor()} placeholder="Vendor name" autoFocus
              style={{ ...inp, width:130, padding:"4px 8px" }} />
            <button onClick={addVendor} style={{ background:"#1C1C1C", border:"1px solid #2A2A2A", color:"#F5F5F0", borderRadius:4, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"'SF Mono',monospace" }}>Add</button>
            <button onClick={()=>setShowVendorInput(false)} style={{ background:"none", border:"none", color:"#444", cursor:"pointer", fontSize:12 }}>✕</button>
          </div>
        ) : (
          <button onClick={()=>setShowVendorInput(true)} style={{ background:"#111", border:"1px solid #1C1C1C", color:"#444", borderRadius:4, padding:"3px 10px", fontSize:10, cursor:"pointer", fontFamily:"'SF Mono',monospace", letterSpacing:"0.1em" }}>+ Add vendor</button>
        )}
      </div>

      {/* New order form */}
      {showForm && (
        <div style={{ background:"#0F0F0F", border:"1px solid #2A2A2A", borderRadius:10, padding:"20px", marginBottom:16 }}>
          <div style={{ fontSize:10, color:"#444", letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:16, fontFamily:"'SF Mono',monospace" }}>New Order</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div><label style={lbl}>Client</label><input value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))} placeholder="Name" style={inp}/></div>
            <div>
              <label style={lbl}>Platform</label>
              <select value={form.platform} onChange={e=>setForm(f=>({...f,platform:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                <option value="">—</option>
                {["Discord","Telegram","WhatsApp","Instagram","Email"].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Vendor</label>
              <select value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} style={{ ...inp, cursor:"pointer" }}>
                {vendors.map(v=><option key={v}>{v}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Items</label>
            <input value={form.items} onChange={e=>setForm(f=>({...f,items:e.target.value}))} placeholder="RT10, CU100*2, BA10*3, TSM5..." style={inp}/>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <label style={lbl}>Cost (BTC)</label>
              <input type="number" step="0.000001" value={form.costBTC} onChange={e=>setForm(f=>({...f,costBTC:e.target.value}))} placeholder="0.004200" style={inp}/>
              {form.costBTC && bp && <div style={{ fontSize:10, color:"#555", marginTop:3, fontFamily:"'SF Mono',monospace" }}>≈ {cu(parseFloat(form.costBTC)*(bp||0))}</div>}
            </div>
            <div>
              <label style={lbl}>Sale (BTC)</label>
              <input type="number" step="0.000001" value={form.saleBTC} onChange={e=>setForm(f=>({...f,saleBTC:e.target.value}))} placeholder="0.005800" style={inp}/>
              {form.saleBTC && bp && <div style={{ fontSize:10, color:"#555", marginTop:3, fontFamily:"'SF Mono',monospace" }}>≈ {cu(parseFloat(form.saleBTC)*(bp||0))}</div>}
            </div>
            <div>
              <label style={lbl}>Profit (auto)</label>
              <div style={{ background:"#0A0A0A", border:"1px solid #1C1C1C", borderRadius:5, padding:"7px 10px", fontSize:12, fontFamily:"'SF Mono',monospace", color: profitPreview > 0 ? "#4ADE80" : "#555" }}>
                {form.saleBTC || form.costBTC ? cbt6(profitPreview) : "—"}
              </div>
              {(form.saleBTC || form.costBTC) && bp && <div style={{ fontSize:10, color:"#555", marginTop:3, fontFamily:"'SF Mono',monospace" }}>≈ {cu(profitPreview*(bp||0))}</div>}
            </div>
            <div><label style={lbl}>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/></div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:12, alignItems:"end", marginBottom:16 }}>
            <div><label style={lbl}>Note (optional)</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="Special instructions, payment note..." style={inp}/></div>
            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", paddingBottom:2 }}>
              <input type="checkbox" checked={form.delivered} onChange={e=>setForm(f=>({...f,delivered:e.target.checked}))} style={{ width:14, height:14 }}/>
              <span style={{ fontSize:12, color:"#666", fontFamily:"'SF Mono',monospace" }}>Delivered</span>
            </label>
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={submitOrder} style={{ background:"#F5F5F0", color:"#0A0A0A", border:"none", borderRadius:5, padding:"8px 20px", fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'SF Mono',monospace" }}>Save Order</button>
            <button onClick={()=>setShowForm(false)} style={{ background:"transparent", color:"#555", border:"1px solid #2A2A2A", borderRadius:5, padding:"8px 16px", fontSize:11, cursor:"pointer", fontFamily:"'SF Mono',monospace" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Order table */}
      <div style={{ background:"#0F0F0F", border:"1px solid #1C1C1C", borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"13px 20px", borderBottom:"1px solid #1C1C1C", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#3A3A3A", letterSpacing:"0.18em", textTransform:"uppercase", fontFamily:"'SF Mono',monospace" }}>Order Book · {orders.length} orders</span>
          <button onClick={()=>setShowForm(true)} style={{ background:"#1C1C1C", border:"1px solid #2A2A2A", color:"#F5F5F0", borderRadius:5, padding:"5px 14px", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'SF Mono',monospace" }}>+ New Order</button>
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:860 }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Client</th>
                <th style={th}>Platform</th>
                <th style={th}>Vendor</th>
                <th style={th}>Items</th>
                <th style={{ ...th, textAlign:"right" }}>Cost ₿</th>
                <th style={{ ...th, textAlign:"right" }}>Sale ₿</th>
                <th style={{ ...th, textAlign:"right" }}>Profit ₿</th>
                <th style={{ ...th, textAlign:"right" }}>Profit $</th>
                <th style={{ ...th, textAlign:"right" }}>Margin</th>
                <th style={{ ...th, textAlign:"center" }}>Del.</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={12} style={{ ...td, textAlign:"center", color:"#222", padding:"48px" }}>No orders yet.</td></tr>
              )}
              {orders.map(o => {
                const s = orderStats(o);
                return (
                  <tr key={o.id} style={{ opacity: o.delivered ? 0.45 : 1, transition:"opacity 0.2s" }}>
                    <td style={{ ...td, color:"#444" }}>{o.date}</td>
                    <td style={{ ...td, color:"#C0C0C0", fontWeight:500 }}>{o.client}</td>
                    <td style={{ ...td, color:"#555" }}>{o.platform||"—"}</td>
                    <td style={{ ...td, color:"#666" }}>{o.vendor||"—"}</td>
                    <td style={{ ...td, color:"#777", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={o.items||o.item||""}>{o.items||o.item||"—"}</td>
                    <td style={{ ...td, textAlign:"right", color:"#F87171" }}>{cbt6(s.costBTC)}</td>
                    <td style={{ ...td, textAlign:"right", color:"#4ADE80" }}>{cbt6(s.saleBTC)}</td>
                    <td style={{ ...td, textAlign:"right", color:"#60A5FA", fontWeight:700 }}>{cbt6(s.profitBTC)}</td>
                    <td style={{ ...td, textAlign:"right", color: bp ? "#A78BFA" : "#2A2A2A", fontWeight:700 }}>{bp ? cu(s.profitUSD) : "—"}</td>
                    <td style={{ ...td, textAlign:"right", color: s.margin > 0.2 ? "#4ADE80" : "#FBBF24" }}>{cp(s.margin)}</td>
                    <td style={{ ...td, textAlign:"center" }}>
                      <button onClick={() => onUpdateOrder(o.id, { delivered: !o.delivered, status: !o.delivered ? "delivered" : "pending" })}
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:17, lineHeight:1, color: o.delivered ? "#4ADE80" : "#2A2A2A", transition:"color 0.2s" }}>
                        {o.delivered ? "✓" : "○"}
                      </button>
                    </td>
                    <td style={td}>
                      <button onClick={() => onDeleteOrder && onDeleteOrder(o.id)} style={{ background:"none", border:"none", color:"#222", cursor:"pointer", fontSize:12 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {orders.length > 0 && (
              <tfoot>
                <tr style={{ borderTop:"1px solid #2A2A2A" }}>
                  <td colSpan={5} style={{ ...td, color:"#555", fontWeight:700, fontSize:11 }}>TOTAL</td>
                  <td style={{ ...td, textAlign:"right", color:"#F87171", fontWeight:700 }}>{cbt6(totals.costBTC)}</td>
                  <td style={{ ...td, textAlign:"right", color:"#4ADE80", fontWeight:700 }}>{cbt6(totals.saleBTC)}</td>
                  <td style={{ ...td, textAlign:"right", color:"#60A5FA", fontWeight:700 }}>{cbt6(totals.profitBTC)}</td>
                  <td style={{ ...td, textAlign:"right", color:"#A78BFA", fontWeight:700 }}>{bp ? cu(totals.profitUSD) : "—"}</td>
                  <td style={{ ...td, textAlign:"right", color:"#FBBF24", fontWeight:700 }}>{cp(avgMargin)}</td>
                  <td style={td}></td><td style={td}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Live BTC profit bar */}
      {bp && totals.profitBTC > 0 && (
        <div style={{ marginTop:10, background:"#0F0F0F", border:"1px solid #1C1C1C", borderRadius:8, padding:"10px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:10, color:"#2A2A2A", fontFamily:"'SF Mono',monospace", letterSpacing:"0.1em", textTransform:"uppercase" }}>Profit adjusted to live BTC</span>
          <div style={{ display:"flex", gap:20, alignItems:"baseline" }}>
            <span style={{ fontSize:11, color:"#444", fontFamily:"'SF Mono',monospace" }}>{cbt6(totals.profitBTC)}</span>
            <span style={{ fontSize:14, color:"#A78BFA", fontWeight:700, fontFamily:"'SF Mono',monospace" }}>= {cu(totals.profitUSD)}</span>
            <span style={{ fontSize:11, color:"#333", fontFamily:"'SF Mono',monospace" }}>@ {cu(bp)}/BTC</span>
          </div>
        </div>
      )}
    </div>
  );
}


function Analytics({st,bp}){
  const{ledger,rates}=st;
  const chartData=["2026-04","2026-05","2026-06"].map(ym=>{
    const md=buildMonth(ym,ledger,bp,rates);
    return{month:MONTHS_SHORT[parseInt(ym.split("-")[1])-1],income:Math.round(md.inc),cost:Math.round(md.cost),net:Math.round(md.net),margin:Math.round(md.margin*100)};
  });
  const catTotals=EXPENSE_CATS.map(c=>{
    const val=["2026-04","2026-05","2026-06"].reduce((s,ym)=>s+(buildMonth(ym,ledger,bp,rates).cats[c]||0),0);
    return{name:c,value:Math.round(val)};
  }).filter(d=>d.value>0).sort((a,b)=>b.value-a.value);
  const COLORS=["#F87171","#FB923C","#FBBF24","#4ADE80","#60A5FA","#A78BFA","#F472B6","#34D399","#818CF8","#FCD34D","#6EE7B7"];
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <Card>
          <CardHeader title="Income vs Costs vs Net"/>
          <div style={{padding:"12px 0 8px"}}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{fill:"#3A3A3A",fontSize:11,fontFamily:"SF Mono"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#3A3A3A",fontSize:10,fontFamily:"SF Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>"$"+v.toLocaleString()}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Bar dataKey="income" fill="#4ADE8030" stroke="#4ADE80" strokeWidth={1} radius={[3,3,0,0]} name="Income"/>
                <Bar dataKey="cost"   fill="#F8717130" stroke="#F87171" strokeWidth={1} radius={[3,3,0,0]} name="Cost"/>
                <Bar dataKey="net"    fill="#60A5FA30" stroke="#60A5FA" strokeWidth={1} radius={[3,3,0,0]} name="Net"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Margin % Trend"/>
          <div style={{padding:"12px 0 8px"}}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ADE80" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4ADE80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{fill:"#3A3A3A",fontSize:11,fontFamily:"SF Mono"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:"#3A3A3A",fontSize:10,fontFamily:"SF Mono"}} axisLine={false} tickLine={false} tickFormatter={v=>v+"%"}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Area type="monotone" dataKey="margin" stroke="#4ADE80" strokeWidth={2} fill="url(#mg)" name="Margin %" dot={{fill:"#4ADE80",strokeWidth:0,r:4}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card style={{marginBottom:12}}>
        <CardHeader title="Cumulative Spend by Category (Apr–Jun 2026)"/>
        <div style={{padding:"16px 20px"}}>
          {catTotals.map((c,i)=>{
            const pctVal=catTotals[0]?.value>0?c.value/catTotals[0].value:0;
            return(
              <div key={c.name} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4,fontFamily:"'SF Mono',monospace"}}>
                  <span style={{color:"#555"}}>{c.name}</span>
                  <span style={{color:COLORS[i%COLORS.length],fontWeight:600}}>{cu(c.value)}</span>
                </div>
                <div style={{height:2,background:"#151515",borderRadius:2}}>
                  <div style={{height:2,background:COLORS[i%COLORS.length],borderRadius:2,width:Math.min(100,pctVal*100)+"%"}}/>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        {[
          {label:"Best Month",val:"Jun 2026",sub:"$6,446 income · 74.9% margin"},
          {label:"Total 3-Month P&L",val:cu(16663.35-7108.81),sub:"Apr+May+Jun combined"},
          {label:"Avg Monthly Income",val:cu((4684+5533.35+6446)/3),sub:"3-month trailing average"},
        ].map(s=>(
          <Card key={s.label} style={{padding:"20px"}}>
            <div style={{fontSize:10,color:"#444",letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:10,fontFamily:"'SF Mono',monospace"}}>{s.label}</div>
            <div style={{fontSize:18,fontWeight:700,color:"#F5F5F0"}}>{s.val}</div>
            <div style={{fontSize:11,color:"#333",marginTop:6,fontFamily:"'SF Mono',monospace"}}>{s.sub}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TransferForm({wallets,rates,bp,onTransfer,showToast}){
  const[form,setForm]=useState({
    from:"metamask_btc",to:"coinbase_btc",
    amount:"",date:new Date().toISOString().slice(0,10),
  });
 
  const ACCOUNTS=[
    {key:"metamask_btc",  label:"MetaMask BTC",   currency:"BTC",  fmt:n=>Number(n||0).toFixed(6)+" ₿"},
    {key:"coinbase_btc",  label:"Coinbase BTC",   currency:"BTC",  fmt:n=>Number(n||0).toFixed(6)+" ₿"},
    {key:"metamask_usdt", label:"MetaMask USDT",  currency:"USDT", fmt:n=>"$"+Number(n||0).toFixed(2)},
    {key:"coinbase_usdt", label:"Coinbase USDT",  currency:"USDT", fmt:n=>"$"+Number(n||0).toFixed(2)},
    {key:"uob_sgd",       label:"UOB (SGD)",      currency:"SGD",  fmt:n=>"S$"+Number(n||0).toFixed(2)},
    {key:"revolut_sgd",   label:"Revolut (SGD)",  currency:"SGD",  fmt:n=>"S$"+Number(n||0).toFixed(2)},
  ];
 
  // Common transfer paths
  const QUICK=[
    {from:"metamask_btc", to:"coinbase_btc",  label:"MetaMask → Coinbase BTC"},
    {from:"coinbase_btc", to:"metamask_btc",  label:"Coinbase → MetaMask BTC"},
    {from:"coinbase_usdt",to:"uob_sgd",       label:"USDT → UOB"},
    {from:"uob_sgd",      to:"revolut_sgd",   label:"UOB → Revolut"},
    {from:"revolut_sgd",  to:"uob_sgd",       label:"Revolut → UOB"},
  ];
 
  const fromAcc=ACCOUNTS.find(a=>a.key===form.from);
  const toAcc=ACCOUNTS.find(a=>a.key===form.to);
  const amt=parseFloat(form.amount)||0;
  const bal=wallets[form.from]||0;
  const insufficient=amt>0&&amt>bal;
 
  const inp={background:"#111",border:"1px solid #1C1C1C",color:"#F5F5F0",borderRadius:5,padding:"8px 10px",fontSize:12,fontFamily:"'SF Mono',monospace",outline:"none",width:"100%"};
  const lbl={fontSize:10,color:"#333",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:5,display:"block",fontFamily:"'SF Mono',monospace"};
 
  async function submit(){
    if(!amt||amt<=0||form.from===form.to||insufficient) return;
    const entries=[
      {
        type:"expense",category:"Miscellaneous",
        amount:amt,currency:fromAcc.currency,account:form.from,
        label:`Transfer → ${toAcc.label}`,date:form.date,
      },
      {
        type:"income",category:"Miscellaneous",
        amount:amt,currency:toAcc.currency,account:form.to,
        label:`Transfer ← ${fromAcc.label}`,date:form.date,
      },
    ];
    await onTransfer(entries);
    setForm(f=>({...f,amount:""}));
    showToast(`✓ Transferred ${amt} ${fromAcc.currency} · ${fromAcc.label} → ${toAcc.label}`);
  }
 
  return(
    <div style={{padding:"14px 18px"}}>
      {/* Quick transfer buttons */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
        {QUICK.map(q=>(
          <button key={q.label} onClick={()=>setForm(f=>({...f,from:q.from,to:q.to}))}
            style={{background:form.from===q.from&&form.to===q.to?"#1C1C1C":"#111",border:`1px solid ${form.from===q.from&&form.to===q.to?"#2A2A2A":"#1C1C1C"}`,color:form.from===q.from&&form.to===q.to?"#F5F5F0":"#333",borderRadius:5,padding:"5px 10px",fontSize:10,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em"}}>
            {q.label}
          </button>
        ))}
      </div>
 
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:10,alignItems:"end",marginBottom:12}}>
        <div>
          <label style={lbl}>From</label>
          <select value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))} style={{...inp,cursor:"pointer"}}>
            {ACCOUNTS.map(a=>(
              <option key={a.key} value={a.key}>{a.label} — {a.fmt(wallets[a.key])}</option>
            ))}
          </select>
        </div>
        <div style={{fontSize:16,color:"#2A2A2A",paddingBottom:8,textAlign:"center",userSelect:"none"}}>→</div>
        <div>
          <label style={lbl}>To</label>
          <select value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))} style={{...inp,cursor:"pointer"}}>
            {ACCOUNTS.filter(a=>a.key!==form.from).map(a=>(
              <option key={a.key} value={a.key}>{a.label} — {a.fmt(wallets[a.key])}</option>
            ))}
          </select>
        </div>
      </div>
 
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <label style={lbl}>Amount ({fromAcc?.currency})</label>
          <input type="number" step="any" value={form.amount}
            onChange={e=>setForm(f=>({...f,amount:e.target.value}))}
            placeholder={fromAcc?.currency==="BTC"?"0.005000":"100.00"}
            style={{...inp,borderColor:insufficient?"#F87171":"#1C1C1C"}}/>
          {insufficient&&<div style={{fontSize:10,color:"#F87171",marginTop:3,fontFamily:"'SF Mono',monospace"}}>Insufficient — balance: {fromAcc?.fmt(bal)}</div>}
          {amt>0&&!insufficient&&<div style={{fontSize:10,color:"#555",marginTop:3,fontFamily:"'SF Mono',monospace"}}>Available: {fromAcc?.fmt(bal)}</div>}
          {amt>0&&bp&&fromAcc?.currency==="BTC"&&<div style={{fontSize:10,color:"#FBBF24",marginTop:2,fontFamily:"'SF Mono',monospace"}}>≈ ${(amt*bp).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>}
        </div>
        <div>
          <label style={lbl}>Date</label>
          <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inp}/>
        </div>
      </div>
 
      <button onClick={submit} disabled={!amt||amt<=0||form.from===form.to||insufficient}
        style={{background:"#F5F5F0",color:"#0A0A0A",border:"none",borderRadius:5,padding:"9px 24px",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'SF Mono',monospace"}}>
        Transfer →
      </button>
 
      {form.from!==form.to&&amt>0&&!insufficient&&(
        <div style={{marginTop:10,fontSize:11,color:"#2A2A2A",fontFamily:"'SF Mono',monospace"}}>
          {fromAcc?.fmt(amt)} from {fromAcc?.label} → {toAcc?.label}
        </div>
      )}
    </div>
  );
}

function Wallets({st,bp,onUpdate,onTransfer,showToast}){
  const{wallets:w,rates,btcCostBasis}=st;
  const nw=netWorth(w,bp,rates);
  const btcTotal=totalBTC(w);
  const btcPnL=bp&&btcCostBasis?(bp-btcCostBasis)*btcTotal:0;
  const inp={background:"#111",border:"1px solid #222",color:"#F5F5F0",borderRadius:5,padding:"7px 10px",fontSize:12,width:150,textAlign:"right",fontFamily:"'SF Mono',monospace",outline:"none"};
  return(
    <div style={{padding:"20px 16px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:1,marginBottom:16,border:"1px solid #1C1C1C",borderRadius:10,overflow:"hidden"}}>
        <Metric label="Net Worth USD" value={bp?cu(nw):"—"} color="#F5F5F0" sub={bp?csg(nw*rates.USDSGD)+" SGD":undefined}/>
        <Metric label="BTC Holdings" value={cbt(btcTotal)} color="#FBBF24" sub={bp?cu(btcTotal*bp):undefined}/>
        <Metric label="BTC P&L" value={bp?cu(btcPnL):"—"} color={btcPnL>=0?"#4ADE80":"#F87171"} sub={bp&&btcCostBasis?`basis ${cu(btcCostBasis)}/BTC`:undefined}/>
        <Metric label="Liquid" value={cu((w.coinbase_usdt||0)+(w.uob_sgd||0)/rates.USDSGD+(w.revolut_sgd||0)/rates.USDSGD+(w.bca_idr||0)/rates.USDIDR)} color="#60A5FA"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Card>
          <CardHeader title="Crypto Wallets"/>
          {[{key:"coinbase_btc",label:"Coinbase BTC",step:"0.000001",type:"BTC"},{key:"metamask_btc",label:"MetaMask BTC",step:"0.000001",type:"BTC"},{key:"coinbase_usdt",label:"Coinbase USDT",step:"0.01",type:"USDT"}].map(a=>(
            <div key={a.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:"1px solid #111"}}>
              <div>
                <div style={{fontSize:13,color:"#777",fontFamily:"'SF Mono',monospace"}}>{a.label}</div>
                {a.type==="BTC"&&bp&&<div style={{fontSize:11,color:"#2A2A2A",marginTop:2,fontFamily:"'SF Mono',monospace"}}>≈ {cu(w[a.key]*bp)}</div>}
              </div>
              <input type="number" step={a.step} value={w[a.key]||0} onChange={e=>onUpdate("wallets",{...w,[a.key]:parseFloat(e.target.value)||0})} style={inp}/>
            </div>
          ))}
        </Card>
        <Card>
          <CardHeader title="Bank Accounts"/>
          {[{key:"uob_sgd",label:"UOB (SGD)",step:"0.01",type:"SGD"},{key:"revolut_sgd",label:"Revolut (SGD)",step:"0.01",type:"SGD"},{key:"bca_idr",label:"BCA (IDR)",step:"1000",type:"IDR"}].map(a=>(
            <div key={a.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:"1px solid #111"}}>
              <div>
                <div style={{fontSize:13,color:"#777",fontFamily:"'SF Mono',monospace"}}>{a.label}</div>
                <div style={{fontSize:11,color:"#2A2A2A",marginTop:2,fontFamily:"'SF Mono',monospace"}}>≈ {cu(toUSD(w[a.key],a.type,rates,bp))}</div>
              </div>
              <input type="number" step={a.step} value={w[a.key]||0} onChange={e=>onUpdate("wallets",{...w,[a.key]:parseFloat(e.target.value)||0})} style={inp}/>
            </div>
          ))}
        </Card>
      </div>
      <Card style={{marginTop:12}}>
        <CardHeader title="FX Rates & Settings"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr"}}>
          {[["USDSGD","USD/SGD","0.0001"],["USDIDR","USD/IDR","1"]].map(([k,l,step])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderRight:"1px solid #111"}}>
              <span style={{fontSize:12,color:"#555",fontFamily:"'SF Mono',monospace"}}>{l}</span>
              <input type="number" step={step} value={rates[k]} onChange={e=>onUpdate("rates",{...rates,[k]:parseFloat(e.target.value)||rates[k]})} style={{...inp,width:110}}/>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px"}}>
            <span style={{fontSize:12,color:"#555",fontFamily:"'SF Mono',monospace"}}>BTC Cost Basis</span>
            <input type="number" step="1" value={st.btcCostBasis||0} onChange={e=>onUpdate("btcCostBasis",parseFloat(e.target.value)||0)} style={{...inp,width:120}}/>
          </div>
        </div>
      </Card>
      <Card style={{marginTop:12}}>
        <CardHeader title="Net Worth Breakdown"/>
        {[
          {label:"BTC (Coinbase + MetaMask)",val:btcTotal*(bp||0),display:cbt(btcTotal),color:"#FBBF24"},
          {label:"Coinbase USDT",val:w.coinbase_usdt||0,display:cu(w.coinbase_usdt),color:"#4ADE80"},
          {label:"UOB + Revolut (SGD)",val:((w.uob_sgd||0)+(w.revolut_sgd||0))/rates.USDSGD,display:csg((w.uob_sgd||0)+(w.revolut_sgd||0)),color:"#60A5FA"},
          {label:"BCA (IDR)",val:(w.bca_idr||0)/rates.USDIDR,display:cid(w.bca_idr),color:"#A78BFA"},
        ].map(r=>(
          <div key={r.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",borderBottom:"1px solid #111"}}>
            <div>
              <div style={{fontSize:13,color:"#777",fontFamily:"'SF Mono',monospace"}}>{r.label}</div>
              <div style={{fontSize:11,color:"#2A2A2A",marginTop:2,fontFamily:"'SF Mono',monospace"}}>{r.display}</div>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:r.color,fontFamily:"'SF Mono',monospace"}}>{cu(r.val)}</div>
          </div>
        ))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"16px 20px"}}>
          <span style={{fontSize:14,fontWeight:700,color:"#F5F5F0"}}>Total</span>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#F5F5F0",fontFamily:"'SF Mono',monospace"}}>{cu(nw)}</div>
            <div style={{fontSize:11,color:"#2A2A2A",marginTop:3,fontFamily:"'SF Mono',monospace"}}>{csg(nw*rates.USDSGD)} · {cid(nw*rates.USDIDR)}</div>
          </div>
        </div>
      </Card> 
      <Card style={{marginTop:12}}>
  <CardHeader title="Transfer Between Accounts"/>
  <TransferForm wallets={w} rates={rates} bp={bp} onTransfer={onTransfer} showToast={showToast}/>
</Card>
    </div>
  );
}

function AIChat({st,bp,onTransactions,onBTCFetch,btcLoading}){
  const[input,setInput]=useState("");
  const[msgs,setMsgs]=useState([{role:"assistant",content:"I'm your financial OS. Tell me what happened today, ask for analysis, or log a transaction.\n\nExamples:\n• \"revolut $30 dinner last night\"\n• \"made 0.004 BTC from dropshipping today\"\n• \"BCA 500 ribu for gas\"\n• \"how's my margin trending?\""}]);
  const[loading,setLoading]=useState(false);
  const[pendingTx,setPendingTx]=useState(null);
  const[chatHistory,setChatHistory]=useState([]);
  const scrollRef=useRef(null);
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[msgs,loading]);

  async function send(){
    if(!input.trim()||loading)return;
    const userMsg=input.trim();
    setInput("");
    const newHistory=[...chatHistory,{role:"user",content:userMsg}];
    setMsgs(m=>[...m,{role:"user",content:userMsg}]);
    setLoading(true);
    try{
      const reply=await aiChat(userMsg,st,bp,newHistory);
      const txMatch=reply.match(/<TRANSACTIONS>([\s\S]*?)<\/TRANSACTIONS>/);
      let cleanReply=reply.replace(/<TRANSACTIONS>[\s\S]*?<\/TRANSACTIONS>/g,"").trim();
      if(txMatch){
        try{
          const today=new Date().toISOString().slice(0,10);
          let txs=JSON.parse(txMatch[1].trim());
          // Sanitize
          txs=txs.map(t=>({
            ...t,
            type: t.type==="income"?"income":"expense",
            amount: Math.abs(parseFloat(t.amount)||0),
            currency: (t.type==="expense"&&t.currency==="USD")?"SGD":t.currency||"SGD",
            account: t.account||"revolut_sgd",
            category: (()=>{
              if(!t.category) return "Miscellaneous";
              const raw=t.category.toLowerCase().trim();
              // exact match first
              const exact=EXPENSE_CATS.find(c=>c.toLowerCase()===raw);
              if(exact) return exact;
              // partial match — if any category name is contained in what AI returned
              const partial=EXPENSE_CATS.find(c=>raw.includes(c.toLowerCase())||c.toLowerCase().includes(raw));
              if(partial) return partial;
              return "Miscellaneous";
            })(),
            date: (t.date&&/^\d{4}-\d{2}-\d{2}$/.test(t.date))?t.date:new Date().toISOString().slice(0,10),
          }));
          setPendingTx(txs);
          cleanReply+="\n\n*Transactions parsed above — confirm to save.*";
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
    setMsgs(m=>[...m,{role:"user",content:txt},{role:"assistant",content:"Parsing..."}]);
    setLoading(true);
    try{
      const txs=await parseTransaction(txt,st.rates,bp);
      setPendingTx(txs);
      setMsgs(m=>[...m.slice(0,-1),{role:"assistant",content:`Parsed ${txs.length} transaction(s). Confirm to save.`}]);
    }catch(e){setMsgs(m=>[...m.slice(0,-1),{role:"assistant",content:"Parse error: "+e.message}]);}
    setLoading(false);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 130px)",padding:"0 16px 16px"}}>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",paddingTop:16,paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:12}}>
            {m.role==="assistant"&&<div style={{width:22,height:22,borderRadius:"50%",background:"#1C1C1C",border:"1px solid #2A2A2A",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,marginRight:8,flexShrink:0,marginTop:2,color:"#FBBF24"}}>✦</div>}
            <div style={{maxWidth:"78%",background:m.role==="user"?"#1C1C1C":"#111",border:`1px solid ${m.role==="user"?"#2A2A2A":"#1C1C1C"}`,borderRadius:m.role==="user"?"10px 10px 2px 10px":"10px 10px 10px 2px",padding:"11px 15px",fontSize:13,color:"#C0C0C0",lineHeight:1.65,whiteSpace:"pre-wrap",fontFamily:"'SF Mono',monospace"}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",gap:6,padding:"0 0 12px 30px"}}>
          {[0,1,2].map(i=><div key={i} style={{width:5,height:5,borderRadius:"50%",background:"#FBBF24",animation:"pulse 1.2s infinite",animationDelay:`${i*0.2}s`,opacity:0.6}}/>)}
        </div>}
        {pendingTx&&(
          <div style={{background:"#0F0F0F",border:"1px solid #2A2A2A",borderRadius:8,padding:"12px 16px",marginBottom:12,marginLeft:30}}>
            <div style={{fontSize:10,color:"#444",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8,fontFamily:"'SF Mono',monospace"}}>Confirm transactions</div>
            {pendingTx.map((t,i)=>(
              <div key={i} style={{fontSize:12,color:"#C0C0C0",padding:"5px 0",borderBottom:"1px solid #151515",fontFamily:"'SF Mono',monospace",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <span><Badge color={t.type==="income"?"#4ADE80":"#F87171"}>{t.type}</Badge> <span style={{marginLeft:6,color:"#555"}}>{t.date}</span> <span style={{marginLeft:6}}>{t.label||t.category}</span></span>
                <span style={{color:t.type==="income"?"#4ADE80":"#F87171",fontWeight:700}}>{t.amount} {t.currency} → {t.account}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={()=>{onTransactions(pendingTx);setPendingTx(null);setMsgs(m=>[...m,{role:"assistant",content:"✓ Saved to Supabase. Ledger & balances updated."}]);}}
                style={{background:"#F5F5F0",color:"#0A0A0A",border:"none",borderRadius:5,padding:"7px 16px",fontSize:11,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'SF Mono',monospace"}}>
                Confirm & Save
              </button>
              <button onClick={()=>setPendingTx(null)} style={{background:"transparent",color:"#555",border:"1px solid #2A2A2A",borderRadius:5,padding:"7px 14px",fontSize:11,cursor:"pointer",fontFamily:"'SF Mono',monospace"}}>Discard</button>
            </div>
          </div>
        )}
      </div>
      <div style={{borderTop:"1px solid #1C1C1C",paddingTop:12}}>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <button onClick={onBTCFetch} disabled={btcLoading} style={{background:"#111",border:"1px solid #222",color:"#FBBF24",borderRadius:6,padding:"7px 14px",fontSize:11,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em",whiteSpace:"nowrap"}}>
            {btcLoading?"fetching…":"↻ BTC price"}
          </button>
          <div style={{flex:1,display:"flex",gap:6}}>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
              rows={2} placeholder='"0.003 BTC dropshipping today" · "revolut $45 dating" · "how is my margin?"'
              style={{flex:1,background:"#111",border:"1px solid #222",borderRadius:8,padding:"10px 14px",color:"#F0F0F0",fontSize:12,fontFamily:"'SF Mono',monospace",outline:"none",resize:"none"}}/>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <button onClick={send} disabled={loading||!input.trim()} style={{background:"#F5F5F0",color:"#0A0A0A",border:"none",borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em"}}>Ask →</button>
              <button onClick={quickLog} disabled={loading||!input.trim()} style={{background:"#FBBF2420",color:"#FBBF24",border:"1px solid #FBBF2430",borderRadius:6,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'SF Mono',monospace",letterSpacing:"0.08em"}}>Log ↗</button>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {["0.003 BTC dropshipping today","revolut $45 dating Fri","BCA 200rb for gas","how's my margin trending?"].map(s=>(
            <button key={s} onClick={()=>setInput(s)} style={{background:"#0F0F0F",border:"1px solid #1C1C1C",color:"#333",borderRadius:4,padding:"4px 10px",fontSize:10,cursor:"pointer",fontFamily:"'SF Mono',monospace"}}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP ROOT — SUPABASE CONNECTED
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const[ledger,setLedger]=useState([]);
  const[orders,setOrders]=useState([]);
  const[wallets,setWallets]=useState(DEFAULT_WALLETS);
  const[rates,setRates]=useState(DEFAULT_RATES);
  const[btcCostBasis,setBtcCostBasis]=useState(58200);
  const[btcPrice,setBtcPrice]=useState(null);
  const[view,setView]=useState("Dashboard");
  const[btcLoading,setBtcLoading]=useState(false);
  const[dbLoading,setDbLoading]=useState(true);
  const[toast,setToast]=useState(null);
  const[syncError,setSyncError]=useState(false);
  const[walletRowId,setWalletRowId]=useState(null);
  
  const showToast=msg=>setToast(msg);

  // ── Load from Supabase on mount ──
  useEffect(()=>{
    async function loadAll(){
      setDbLoading(true);
      try{
        // Load ledger
        const ledgerData=await sb("ledger?order=created_at.desc");
        if(ledgerData) setLedger(ledgerData.map(e=>({...e,id:e.id,amount:parseFloat(e.amount)})));
        // Load orders
        const orderData=await sb("orders?order=created_at.desc");
        if(orderData&&orderData.length>0) setOrders(orderData.map(o=>({...o,cost:parseFloat(o.cost),salePrice:parseFloat(o.sale_price),btcAmount:parseFloat(o.btc_amount)})));
        // Load wallets
        const walletData=await sb("wallets?order=updated_at.desc&limit=1");
        if(walletData&&walletData[0]){
         const wd=walletData[0];
          setWalletRowId(wd.id);  // ← add this
         setWallets({coinbase_btc:parseFloat(wd.coinbase_btc),metamask_btc:parseFloat(wd.metamask_btc),coinbase_usdt:parseFloat(wd.coinbase_usdt),uob_sgd:parseFloat(wd.uob_sgd),revolut_sgd:parseFloat(wd.revolut_sgd),bca_idr:parseFloat(wd.bca_idr)});
         }
        // Load settings
        const settingsData=await sb("settings");
        if(settingsData){
          settingsData.forEach(s=>{
            if(s.key==="btc_cost_basis") setBtcCostBasis(parseFloat(s.value));
            if(s.key==="usd_sgd") setRates(r=>({...r,USDSGD:parseFloat(s.value)}));
            if(s.key==="usd_idr") setRates(r=>({...r,USDIDR:parseFloat(s.value)}));
          });
        }
        setSyncError(false);
      }catch(e){
        console.error("Supabase load error:",e);
        setSyncError(true);
      }
      setDbLoading(false);
    }
    loadAll();
  },[]);

  // ── Save wallets to Supabase ──
  async function saveWallets(newW){
    setWallets(newW);
    try{
      if(walletRowId){
        await sb(`wallets?id=eq.${walletRowId}`,"PATCH",{...newW,updated_at:new Date().toISOString()});
      }else{
        const res=await sb("wallets","POST",{...newW,updated_at:new Date().toISOString()});
        if(res&&res[0]) setWalletRowId(res[0].id);
      }
    }catch(e){console.error("Wallet save error:",e);}
  }

  // ── Save settings to Supabase ──
  async function saveSetting(key,value){
    try{
      await sb(`settings?key=eq.${key}`,"DELETE");
      await sb("settings","POST",{key,value:String(value),updated_at:new Date().toISOString()});
    }catch(e){console.error("Setting save error:",e);}
  }

  // ── Apply & save transactions ──
  async function applyTransactions(txs){
    const newEntries=txs.map(t=>({...t,amount:parseFloat(t.amount)}));
    const newW={...wallets};
    newEntries.forEach(e=>{
      const amt=Math.abs(parseFloat(e.amount));
      if(!e.account||!newW.hasOwnProperty(e.account))return;
      newW[e.account]=e.type==="income"?(newW[e.account]||0)+amt:Math.max(0,(newW[e.account]||0)-amt);
    });
// Save to Supabase
try{
  for(const e of newEntries){
    const saved=await sb("ledger","POST",{type:e.type,category:e.category,amount:e.amount,currency:e.currency,account:e.account,label:e.label,date:e.date});
    const id=saved?.[0]?.id||crypto.randomUUID();
    setLedger(l=>[{...e,id},...l]);
  }
      await saveWallets(newW);
      showToast(`✓ ${newEntries.length} transaction(s) saved to Supabase`);
    }catch(err){
      console.error("Transaction save error:",err);
      // Fallback to local state
      setLedger(l=>[...newEntries.map(e=>({...e,id:Date.now()+Math.random()})),...l]);
      setWallets(newW);
      showToast("Saved locally (Supabase error)");
    }
  }

  // ── Delete ledger entry ──
  async function deleteEntry(id){
    // Check if this ledger entry is linked to an order
    const entry = ledger.find(e => e.id === id);
    
    // Remove from ledger state and Supabase
    setLedger(l => l.filter(e => e.id !== id));
    try{ await sb(`ledger?id=eq.${id}`,"DELETE"); }catch(e){ console.error(e); }
  
    // If it's a dropshipping income entry, find and delete the linked order
    if(entry && entry.category === "Dropshipping" && entry.type === "income"){
      const linkedOrder = orders.find(o => entry.label?.includes(o.id));
      if(linkedOrder){
        const profitBTC=Math.abs(parseFloat(linkedOrder.saleBTC||linkedOrder.salePrice||0))-Math.abs(parseFloat(linkedOrder.costBTC||linkedOrder.cost||0));
        if(profitBTC>0){
          const newW={...wallets,metamask_btc:Math.max(0,(wallets.metamask_btc||0)-profitBTC)};
          await saveWallets(newW);
        }
        setOrders(os=>os.filter(o=>o.id!==linkedOrder.id));
        try{ await sb(`orders?id=eq.${linkedOrder.id}`,"DELETE"); }catch(e){ console.error(e); }
        showToast("✓ Ledger entry + linked order removed · balance reversed");
        return;
      }
    }
  // Reverse balance for expenses
  if(entry && entry.type==="expense"){
    const acc=entry.account||"revolut_sgd";
    let amt=Math.abs(parseFloat(entry.amount)||0);
    if(acc==="revolut_sgd"||acc==="uob_sgd"){
      if(entry.currency==="USD"||entry.currency==="USDT") amt=amt*rates.USDSGD;
      if(entry.currency==="IDR") amt=amt*(rates.USDSGD/(rates.USDIDR||16200));
      if(entry.currency==="BTC") amt=amt*(btcPrice||0)*rates.USDSGD;
    }
    if(acc==="bca_idr"){
      if(entry.currency==="USD"||entry.currency==="USDT") amt=amt*(rates.USDIDR||16200);
      if(entry.currency==="SGD") amt=amt*(rates.USDIDR||16200)/rates.USDSGD;
      if(entry.currency==="BTC") amt=amt*(btcPrice||0)*(rates.USDIDR||16200);
    }
    if(acc==="coinbase_btc"||acc==="metamask_btc"){
      if(entry.currency==="USD"||entry.currency==="USDT") amt=amt/(btcPrice||1);
      if(entry.currency==="SGD") amt=amt/rates.USDSGD/(btcPrice||1);
      if(entry.currency==="IDR") amt=amt/(rates.USDIDR||16200)/(btcPrice||1);
    }
    if(acc==="coinbase_usdt"||acc==="metamask_usdt"){
      if(entry.currency==="SGD") amt=amt/rates.USDSGD;
      if(entry.currency==="IDR") amt=amt/(rates.USDIDR||16200);
      if(entry.currency==="BTC") amt=amt*(btcPrice||0);
    }
    const newW={...wallets,[acc]:(wallets[acc]||0)+amt};
    await saveWallets(newW);
    showToast("✓ Entry removed · balance restored");
    return;
  }
  showToast("✓ Entry removed");
  }
  // ── Add order ──
  async function addOrder(o){
    setOrders(os=>[o,...os]);
    try{
      await sb("orders","POST",{id:o.id,client:o.client,item:o.items,items:o.items,vendor:o.vendor,cost:o.costBTC,sale_price:o.saleBTC,btc_amount:o.saleBTC,date:o.date,status:o.status,delivered:o.delivered,delivery_days:null});
      
      // Auto-log profit to metamask_btc immediately on order creation
      const profitBTC = (parseFloat(o.saleBTC)||0) - (parseFloat(o.costBTC)||0);
      if(profitBTC > 0){
        const incomeEntry = {
          type: "income",
          category: "Dropshipping",
          amount: profitBTC,
          currency: "BTC",
          account: "metamask_btc",
          label: `ORD-${o.id} — ${o.client} (${o.vendor})`,
          date: o.date,
        };
        await applyTransactions([incomeEntry]);
        showToast(`✓ Order saved · +${profitBTC.toFixed(6)} ₿ → MetaMask`);
      }
    }catch(e){ console.error("Order save error:",e); }
  }

  // ── Update order status ──
  async function updateOrder(id, patch) {
    setOrders(os => os.map(o => o.id === id ? { ...o, ...patch } : o));
    try {
      const dbPatch = {};
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.delivered !== undefined) dbPatch.delivered = patch.delivered;
      await sb(`orders?id=eq.${id}`, "PATCH", dbPatch);
    }catch(e) { console.error("Order update error:", e); }
  }

  async function deleteOrder(id){
    const order = orders.find(o => o.id === id);
    setOrders(os => os.filter(o => o.id !== id));
  
    // Reverse profit from metamask_btc
    if(order){
      const profitBTC = Math.abs(parseFloat(order.saleBTC||order.salePrice||0)) - Math.abs(parseFloat(order.costBTC||order.cost||0));
      if(profitBTC > 0){
        const newW = { ...wallets, metamask_btc: Math.max(0,(wallets.metamask_btc||0) - profitBTC) };
        await saveWallets(newW);
      }
      // Find and delete linked ledger entry
      const matchingEntry = ledger.find(e => e.label && e.label.includes(id));
      if(matchingEntry){
        setLedger(l => l.filter(e => e.id !== matchingEntry.id));
        try{ await sb(`ledger?id=eq.${matchingEntry.id}`,"DELETE"); }catch(e){ console.error(e); }
      }
    }
  
    try{ await sb(`orders?id=eq.${id}`,"DELETE"); }catch(e){ console.error(e); }
    showToast("✓ Order + ledger entry removed · balance reversed");
  
  // Reverse profit from metamask_btc
  if(order){
    const profitBTC = (parseFloat(order.saleBTC||order.salePrice||0)) - (parseFloat(order.costBTC||order.cost||0));
    if(profitBTC > 0){
      const newW = { ...wallets, metamask_btc: Math.max(0,(wallets.metamask_btc||0) - profitBTC) };
      await saveWallets(newW);
    }
    // Remove matching ledger entry
    const matchingEntry = ledger.find(e => e.label && e.label.includes(id));
    if(matchingEntry){
      setLedger(l => l.filter(e => e.id !== matchingEntry.id));
      try{ await sb(`ledger?id=eq.${matchingEntry.id}`,"DELETE"); }catch(e){ console.error(e); }
    }
  }

  try{ await sb(`orders?id=eq.${id}`,"DELETE"); }catch(e){ console.error(e); }
  showToast("✓ Order removed · balance reversed");
}
  // ── Handle wallet/rate/setting updates ──
  function handleUpdate(key,value){
    if(key==="wallets") saveWallets(value);
    if(key==="rates"){
      setRates(value);
      saveSetting("usd_sgd",value.USDSGD);
      saveSetting("usd_idr",value.USDIDR);
    }
    if(key==="btcCostBasis"){
      setBtcCostBasis(value);
      saveSetting("btc_cost_basis",value);
    }
  }

  // ── BTC fetch ──
  async function handleBTCFetch(){
    setBtcLoading(true);
    const price=await fetchBTCPrice();
    if(price){setBtcPrice(price);showToast(`₿ BTC price updated: $${price.toLocaleString()}`);}
    setBtcLoading(false);
  }

  const st={wallets,rates,btcCostBasis,ledger,orders};
  const nw=netWorth(wallets,btcPrice,rates);

  if(dbLoading) return(
    <div style={{background:"#080808",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'SF Mono',monospace"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:24,color:"#FBBF24",marginBottom:12}}>✦</div>
        <div style={{fontSize:12,color:"#333",letterSpacing:"0.2em",textTransform:"uppercase"}}>Loading from Supabase…</div>
      </div>
    </div>
  );

  return(
    <div style={{background:"#080808",minHeight:"100vh",color:"#F5F5F0"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        button{cursor:pointer;transition:opacity 0.15s;}
        button:hover:not(:disabled){opacity:0.8;}
        button:disabled{opacity:0.4;cursor:not-allowed;}
        input,select,textarea{color:#F5F5F0;}
        input:focus,textarea:focus{border-color:#333 !important;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:#080808;}
        ::-webkit-scrollbar-thumb{background:#1C1C1C;border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
      `}</style>

      {/* Top bar */}
      <div style={{position:"sticky",top:0,zIndex:100,background:"#080808",borderBottom:"1px solid #131313"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 20px",height:50}}>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:14,fontWeight:800,letterSpacing:"0.1em",color:"#F5F5F0",fontFamily:"'SF Mono',monospace"}}>JJ</span>
            <span style={{fontSize:9,color:"#1C1C1C",letterSpacing:"0.2em",textTransform:"uppercase",fontFamily:"'SF Mono',monospace"}}>Financial OS</span>
            {syncError&&<span style={{fontSize:9,color:"#F87171",letterSpacing:"0.1em",fontFamily:"'SF Mono',monospace"}}>· offline</span>}
            {!syncError&&<span style={{fontSize:9,color:"#1C1C1C",letterSpacing:"0.1em",fontFamily:"'SF Mono',monospace"}}>· supabase ✓</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,overflowX:"auto"}}>
            {NAV_ITEMS.map((n,i)=>(
              <button key={n} onClick={()=>setView(n)}
                style={{background:view===n?"#141414":"transparent",border:"none",color:view===n?"#F5F5F0":"#2A2A2A",fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",padding:"6px 10px",borderRadius:5,fontFamily:"'SF Mono',monospace",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                <span style={{marginRight:4,fontSize:11}}>{NAV_ICONS[i]}</span>{n}
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            {btcPrice&&<div style={{fontSize:11,color:"#FBBF24",fontFamily:"'SF Mono',monospace"}}>₿ {cu(btcPrice)}</div>}
            {!btcPrice&&<button onClick={handleBTCFetch} disabled={btcLoading} style={{background:"#FBBF2415",color:"#FBBF24",border:"1px solid #FBBF2425",borderRadius:5,padding:"4px 10px",fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'SF Mono',monospace"}}>
              {btcLoading?"…":"₿ fetch"}
            </button>}
            <div style={{fontSize:11,color:"#1C1C1C",fontFamily:"'SF Mono',monospace"}}>{btcPrice?cu(nw):"—"}</div>
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
        {view==="AI Chat"  &&<AIChat st={st} bp={btcPrice} onTransactions={applyTransactions} onBTCFetch={handleBTCFetch} btcLoading={btcLoading}/>}
      </div>

      {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}