import { useState, Fragment, useEffect, useRef } from "react";

const DEFAULT_PASSWORD = "taelim2024";
const CO_ADDR = "우08377 서울특별시 구로구 디지털로 33길 58";
const CO_TEL  = "02-867-2000";
const CO_FAX  = "02-863-6750";

const INITIAL_TENANTS = [
  { id:'wedgwood', name:'한국웨지우드', fullName:'한국웨지우드마케팅㈜', floor:'1층', suffix:'01', rent:5400000, mgmtArea:133, elevator:0,    deposit:54000000, area:439.67, contractStart:'2024-12-11', contractEnd:'2025-12-10', mgmtFee:400000 },
  { id:'taeha',   name:'태하무역',    fullName:'㈜태하무역',            floor:'2층', suffix:'02', rent:3750000, mgmtArea:160, elevator:44353,  deposit:45650000, area:481.16, contractStart:'2024-11-01', contractEnd:'2025-10-31' },
  { id:'yuyeon',  name:'유연어패럴',  fullName:'유연어패럴',            floor:'3층', suffix:'03', rent:4125000, mgmtArea:200, elevator:44353,  deposit:35000000, area:481.3,  contractStart:'', contractEnd:'' },
];

const INITIAL_ACCOUNTS = {
  mmf:     { label:'MMF',    prev:0, curr:0 },
  acct018: { label:'보통018', prev:0, curr:0 },
  acct032: { label:'보통032', prev:0, curr:0 },
  cash:    { label:'현금',   prev:0, curr:0 },
};

const SAMPLE_READING = {
  periodStart:'2026-03-08', periodEnd:'2026-04-07', images:{},
  elec:{
    w1_220:{prev:3868,curr:3875}, t2_220:{prev:5705,curr:5713},
    t2_380:{prev:8332,curr:8373}, y3_220:{prev:5160,curr:5164},
    y3_380:{prev:36910,curr:36925}, o4_220:{prev:5346,curr:5357},
  },
  waterCalc:'O',
  water:{
    w1:{prev:1893,curr:1899}, t2:{prev:3310,curr:3323},
    y3:{prev:3456,curr:3488}, o4:{prev:925,curr:929},
  },
  elecBill:{basicFee:974700, powerFund:49600, totalAmount:2072910, vat:183711, safetyFee:300000},
  waterBill:{totalAmount:80440, basicFee:32000},
};

// 초기 히스토리 데이터 (localStorage 비어있을 때만 사용)
const INITIAL_HISTORY = [
  // 4월 검침 → 5월 청구
  {
    periodStart:'2026-04-08', periodEnd:'2026-05-07', waterCalc:'O',
    elec:{ w1_220:{prev:3868,curr:3875}, t2_220:{prev:5705,curr:5713}, t2_380:{prev:8332,curr:8373}, y3_220:{prev:5160,curr:5164}, y3_380:{prev:36910,curr:36925}, o4_220:{prev:5346,curr:5357} },
    water:{ w1:{prev:1899,curr:1902}, t2:{prev:3323,curr:3329}, y3:{prev:3488,curr:3489}, o4:{prev:929,curr:932} },
    elecBill:{basicFee:974700,powerFund:49600,totalAmount:2072910,vat:183711,safetyFee:300000},
    waterBill:{totalAmount:80440,basicFee:32000},
    images:{}, savedAt:'2026-05-08T00:00:00.000Z',
  },
  // 3월 검침 → 4월 청구 (waterCalc=X)
  {
    periodStart:'2026-03-08', periodEnd:'2026-04-07', waterCalc:'X',
    elec:{ w1_220:{prev:3855,curr:3868}, t2_220:{prev:5685,curr:5705}, t2_380:{prev:8275,curr:8332}, y3_220:{prev:5119,curr:5160}, y3_380:{prev:34267,curr:36910}, o4_220:{prev:5323,curr:5346} },
    water:{ w1:{prev:1895,curr:1899}, t2:{prev:3314,curr:3323}, y3:{prev:3471,curr:3488}, o4:{prev:927,curr:929} },
    elecBill:{basicFee:974700,powerFund:69690,totalAmount:2911800,vat:258146,safetyFee:300000},
    waterBill:{totalAmount:0,basicFee:32000},
    images:{}, savedAt:'2026-04-08T00:00:00.000Z',
    amounts:{ wedgwood:6882561, taeha:5571118, yuyeon:6375165 },
  },
  // 2월 검침 → 3월 청구
  {
    periodStart:'2026-02-08', periodEnd:'2026-03-07', waterCalc:'O',
    elec:{ w1_220:{prev:3825,curr:3855}, t2_220:{prev:5648,curr:5685}, t2_380:{prev:8147,curr:8257}, y3_220:{prev:5045,curr:5119}, y3_380:{prev:25920,curr:34267}, o4_220:{prev:5285,curr:5323} },
    water:{ w1:{prev:1893,curr:1895}, t2:{prev:3310,curr:3314}, y3:{prev:3456,curr:3471}, o4:{prev:925,curr:927} },
    elecBill:{basicFee:974700,powerFund:121080,totalAmount:5056520,vat:448450,safetyFee:300000},
    waterBill:{totalAmount:98830,basicFee:32000},
    images:{}, savedAt:'2026-03-08T00:00:00.000Z',
    amounts:{ wedgwood:7109628, taeha:6022916, yuyeon:7878090 },
  },
  // 1월 검침 → 2월 청구
  {
    periodStart:'2026-01-08', periodEnd:'2026-02-07', waterCalc:'O',
    elec:{ w1_220:{prev:3809,curr:3825}, t2_220:{prev:5626,curr:5648}, t2_380:{prev:8144,curr:8147}, y3_220:{prev:5012,curr:5045}, y3_380:{prev:20661,curr:25420}, o4_220:{prev:5258,curr:5285} },
    water:{ w1:{prev:1889,curr:1893}, t2:{prev:3303,curr:3310}, y3:{prev:3428,curr:3456}, o4:{prev:919,curr:925} },
    elecBill:{basicFee:974700,powerFund:97140,totalAmount:4057480,vat:359804,safetyFee:300000},
    waterBill:{totalAmount:60800,basicFee:32000},
    images:{}, savedAt:'2026-02-08T00:00:00.000Z',
    amounts:{ wedgwood:6993266, taeha:5238684, yuyeon:7288290 },
  },
];

const store = {
  get:(key)=>{ try{ const v=localStorage.getItem(key); return v?JSON.parse(v):null; }catch{ return null; } },
  set:(key,val)=>{ try{ localStorage.setItem(key,JSON.stringify(val)); }catch{} },
};

// ─── 이미지 압축 (Canvas, JPEG 75%) ──────────────────────────
async function compressImage(file, maxWidth=1400, quality=0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ─── Anthropic 고지서 이미지 분석 ─────────────────────────────
async function analyzeInvoiceImage(base64, type) {
  const apiKey = store.get('tl_anthropic_key');
  if (!apiKey) throw new Error('API 키가 없습니다. 설정 탭에서 Anthropic API 키를 먼저 입력해주세요.');

  const mediaType = 'image/jpeg';

  const elecPrompt = `이 이미지는 한국전력공사(KEPCO) 전기 고지서입니다. 다음 항목의 금액을 찾아 JSON으로 반환해주세요. 숫자만 포함(쉼표 없이):
{
  "basicFee": 기본요금(원),
  "powerFund": 전력산업기반기금(원),
  "totalAmount": 당월 청구금액 또는 전기요금 합계(VAT 포함 총액)(원),
  "vat": 부가가치세(원),
  "safetyFee": 전기안전관리비 또는 전기안전대행료(원, 없으면 0)
}
항목을 찾지 못하면 0. JSON 코드블록만 반환.`;

  const waterPrompt = `이 이미지는 수도 고지서입니다. 다음 항목을 찾아 JSON으로 반환해주세요. 숫자만 포함(쉼표 없이):
{
  "totalAmount": 납부할 금액 또는 당월 청구 합계(원),
  "basicFee": 기본요금(원)
}
항목을 찾지 못하면 0. JSON 코드블록만 반환.`;

  const res = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type:'image', source:{ type:'base64', media_type:mediaType, data:base64.split(',')[1]||base64 } },
          { type:'text', text: type === 'elec' ? elecPrompt : waterPrompt },
        ]
      }]
    })
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`API 오류 ${res.status}: ${msg.slice(0,120)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(match[0]);
}

// ─── Design System ────────────────────────────────────────────
const C = {
  navy:'#3730a3', navyDark:'#312e81', navyMid:'#4f46e5', navyLight:'#6366f1',
  navyBg:'#eef2ff', navyBg2:'#c7d2fe',
  amber:'#92400e', amberBg:'#fffbeb', amberBorder:'#fde68a',
  green:'#166534', greenBg:'#f0fdf4', greenBorder:'#bbf7d0',
  red:'#dc2626', redBg:'#fef2f2', redBorder:'#fecaca',
  orange:'#9a3412', orangeBg:'#fff7ed', orangeBorder:'#fed7aa',
  blue:'#1d4ed8', blueBg:'#eff6ff', blueBorder:'#bfdbfe',
  text:'#0f172a', textMid:'#334155', textSub:'#64748b', textHint:'#94a3b8',
  pageBg:'#f1f5f9', white:'#ffffff', border:'#e2e8f0', borderLight:'#f8fafc',
  tHead:'#f8fafc', tBorder:'#e2e8f0', tAlt:'#f8fafc',
};

const sh = {
  card:'0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05)',
  invoice:'0 8px 32px rgba(49,46,129,0.14)',
};

const btn = (variant='secondary', extra={}) => {
  const base = { display:'inline-flex', alignItems:'center', justifyContent:'center', height:34, padding:'0 18px', borderRadius:20, fontSize:13, fontWeight:500, cursor:'pointer', fontFamily:'inherit', border:'none', gap:6, whiteSpace:'nowrap', letterSpacing:'-0.1px', transition:'all 0.15s ease' };
  const map = {
    primary:   { background:`linear-gradient(135deg,${C.navyDark},${C.navyMid})`, color:'#fff', boxShadow:'0 2px 8px rgba(49,46,129,0.3)' },
    secondary: { background:C.white, color:C.textMid, border:`1px solid ${C.border}`, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' },
    success:   { background:'linear-gradient(135deg,#166534,#16a34a)', color:'#fff', boxShadow:'0 2px 8px rgba(22,101,52,0.25)' },
    amber:     { background:C.amberBg, color:C.amber, border:`1px solid ${C.amberBorder}` },
    danger:    { background:C.redBg, color:C.red, border:`1px solid ${C.redBorder}` },
    ghost:     { background:'transparent', color:C.textSub, border:`1px solid ${C.border}` },
    navyGhost: { background:C.navyBg, color:C.navyMid, border:`1px solid ${C.navyBg2}` },
    active:    { background:`linear-gradient(135deg,${C.navyDark},${C.navyMid})`, color:'#fff', boxShadow:'0 2px 8px rgba(49,46,129,0.3)' },
    inactive:  { background:C.white, color:C.textSub, border:`1px solid ${C.border}` },
  };
  return { ...base, ...(map[variant]||map.secondary), ...extra };
};

const TH = (align='left', width) => ({ fontSize:11, fontWeight:600, color:C.textSub, textAlign:align, padding:'9px 12px', background:C.tHead, borderBottom:`1px solid ${C.tBorder}`, letterSpacing:'0.3px', whiteSpace:'nowrap', ...(width?{width}:{}) });
const TD = (align='left', opts={}) => ({ fontSize:13, color:C.text, padding:'10px 12px', borderBottom:`1px solid ${C.tBorder}`, verticalAlign:'middle', textAlign:align, ...(align==='right'?{fontVariantNumeric:'tabular-nums'}:{}), ...opts });
const CARD = { background:C.white, border:`1px solid ${C.border}`, borderRadius:16, padding:'20px 24px', marginBottom:12, boxShadow:sh.card };

const SecHead = ({ icon, title, action }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, paddingBottom:14, borderBottom:`1px solid ${C.tBorder}` }}>
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ width:28, height:28, borderRadius:8, background:C.navyBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{icon}</div>
      <span style={{ fontSize:14, fontWeight:600, color:C.navy, letterSpacing:'-0.2px' }}>{title}</span>
    </div>
    {action}
  </div>
);

const baseInput = { border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 10px', fontSize:13, width:'100%', boxSizing:'border-box', background:'#FAFBFF', color:C.text, fontFamily:'inherit', outline:'none', transition:'border-color 0.15s' };

// ─── Business helpers ─────────────────────────────────────────
function calcAll(reading) {
  const e = reading.elec;
  const kwh = {
    w1:(e.w1_220.curr-e.w1_220.prev)*60,
    t2:(e.t2_220.curr-e.t2_220.prev)*60+(e.t2_380.curr-e.t2_380.prev)*30,
    y3:(e.y3_220.curr-e.y3_220.prev)*60+(e.y3_380.curr-e.y3_380.prev)*1,
    o4:(e.o4_220.curr-e.o4_220.prev)*80-(e.w1_220.curr-e.w1_220.prev)*60,
  };
  const totalKwh = kwh.w1+kwh.t2+kwh.y3+kwh.o4;
  const {basicFee,powerFund,totalAmount,vat,safetyFee} = reading.elecBill;
  const netElecFee = totalAmount-vat-basicFee-powerFund;
  const elecPerFloor = Math.round(basicFee/4);
  const powerFundPerFloor = Math.round(powerFund/4);
  const safetyPerFloor = Math.round(safetyFee/4);
  const elecUsageFee = (k) => totalKwh>0 ? Math.round(netElecFee*k/totalKwh) : 0;
  const floorElec = {
    w1: elecPerFloor+powerFundPerFloor+elecUsageFee(kwh.w1)+safetyPerFloor,
    t2: elecPerFloor+powerFundPerFloor+elecUsageFee(kwh.t2)+safetyPerFloor,
    y3: elecPerFloor+powerFundPerFloor+elecUsageFee(kwh.y3)+safetyPerFloor,
  };
  const elecDetail = {elecPerFloor,powerFundPerFloor,safetyPerFloor,netElecFee,elecUsageFee};
  let waterCharges={w1:0,t2:0,y3:0};
  let waterDetail={usage:{w1:0,t2:0,y3:0,o4:0},totalUsage:0,basicPerFloor:0,netWaterFee:0};
  if (reading.waterCalc==='O') {
    const wu={w1:reading.water.w1.curr-reading.water.w1.prev, t2:reading.water.t2.curr-reading.water.t2.prev, y3:reading.water.y3.curr-reading.water.y3.prev, o4:reading.water.o4.curr-reading.water.o4.prev};
    const totalWater=wu.w1+wu.t2+wu.y3+wu.o4;
    const basicPerFloor=Math.round(reading.waterBill.basicFee/4);
    const netWaterFee=reading.waterBill.totalAmount-reading.waterBill.basicFee;
    const waterUsageFee=(u)=>totalWater>0?Math.round(netWaterFee*u/totalWater):0;
    waterCharges={
      w1:Math.round(basicPerFloor+waterUsageFee(wu.w1)),
      t2:Math.round(basicPerFloor+waterUsageFee(wu.t2)),
      y3:Math.round(basicPerFloor+waterUsageFee(wu.y3)),
    };
    waterDetail={usage:wu,totalUsage:totalWater,basicPerFloor,netWaterFee};
  }
  return {kwh,totalKwh,elecDetail,floorElec,waterCharges,waterDetail};
}

function getBillingNo(periodEnd) {
  const d=periodEnd?new Date(periodEnd):new Date();
  return `F-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
}
function getBillingMonth(periodEnd) {
  const d=periodEnd?new Date(periodEnd):new Date();
  return `${d.getFullYear()}년 ${d.getMonth()+1}월`;
}
function fmt(n) { return Math.round(n||0).toLocaleString('ko-KR'); }

function getDday(dateStr) {
  if (!dateStr) return null;
  const t=new Date(); t.setHours(0,0,0,0);
  const e=new Date(dateStr); e.setHours(0,0,0,0);
  return Math.round((e-t)/86400000);
}

// ─── Shared components ────────────────────────────────────────
function NumInput({ value, onChange }) {
  return <input type="number" value={value||''} onChange={e=>onChange(Number(e.target.value)||0)} style={{ ...baseInput, textAlign:'right', fontVariantNumeric:'tabular-nums' }} />;
}

function TLLogo({ size=32, bw=false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="9" fill={bw?'#111':C.navyDark} />
      <rect x="2" y="2" width="36" height="36" rx="7" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      <text x="20" y="27" textAnchor="middle" fill="white" fontSize="17" fontWeight="800" fontFamily="Arial,sans-serif" letterSpacing="-0.5">TL</text>
    </svg>
  );
}

function DdayBadge({ dateStr }) {
  const d = getDday(dateStr);
  let label, bg, color, brd;
  if (d===null)       { label='기간 미설정';              bg=C.tHead;     color=C.textHint; brd=C.tBorder; }
  else if (d<0)       { label=`만료 ${Math.abs(d)}일 경과`; bg=C.redBg;    color=C.red;      brd=C.redBorder; }
  else if (d===0)     { label='D-DAY!';                  bg=C.red;       color='#fff';     brd=C.red; }
  else if (d<=30)     { label=`D-${d}`;                  bg=C.redBg;     color=C.red;      brd=C.redBorder; }
  else if (d<=60)     { label=`D-${d}`;                  bg=C.orangeBg;  color=C.orange;   brd=C.orangeBorder; }
  else                { label=`D-${d}`;                  bg=C.greenBg;   color=C.green;    brd=C.greenBorder; }
  return <span style={{ display:'inline-block', padding:'3px 11px', borderRadius:20, fontSize:12, fontWeight:700, background:bg, color, border:`1px solid ${brd}` }}>{label}</span>;
}

// ─── Login ────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [pw,setPw]=useState(''); const [err,setErr]=useState('');
  const go=()=>{ if(!onLogin(pw)) setErr('비밀번호가 올바르지 않습니다.'); };
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:`linear-gradient(145deg,${C.navyDark} 0%,${C.navyMid} 100%)` }}>
      <div style={{ background:C.white, borderRadius:20, padding:'2.5rem 2.5rem 2rem', width:340, boxShadow:'0 24px 64px rgba(0,0,0,0.22)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}><TLLogo size={52} /></div>
          <div style={{ fontSize:17, fontWeight:700, color:C.navyDark, letterSpacing:'-0.3px' }}>태림전자공업㈜</div>
          <div style={{ fontSize:12, color:C.textSub, marginTop:4 }}>관리비 청구 시스템 v6.0</div>
        </div>
        <input type="password" placeholder="비밀번호" value={pw} onChange={e=>{setPw(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&go()}
          style={{ ...baseInput, background:'#F8FAFC', padding:'11px 14px', fontSize:14, marginBottom:8, border:`1.5px solid ${err?C.red:C.border}` }} />
        {err && <div style={{ fontSize:12, color:C.red, marginBottom:8 }}>⚠ {err}</div>}
        <button onClick={go} style={{ ...btn('primary'), width:'100%', height:44, fontSize:14, fontWeight:600 }}>로그인</button>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────
function Header({ page, setPage, onLogout }) {
  const tabs=[['input','검침 입력'],['invoice','청구서'],['quarterly','분기 현황'],['history','히스토리'],['tenant','임차인 현황'],['finance','자금현황'],['notice','공문'],['settings','설정']];
  return (
    <header className="tl-header" style={{ background:'rgba(49,46,129,0.97)', backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:54, position:'sticky', top:0, zIndex:100, boxShadow:'0 1px 0 rgba(255,255,255,0.06),0 4px 24px rgba(0,0,0,0.2)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0, marginRight:12 }}>
        <TLLogo size={28} />
        <div>
          <div style={{ fontWeight:700, fontSize:13, letterSpacing:'-0.3px' }}>태림전자공업㈜</div>
          <div style={{ fontSize:9, opacity:0.4, letterSpacing:'0.8px', marginTop:1 }}>MANAGEMENT SYSTEM</div>
        </div>
      </div>
      <nav style={{ display:'flex', gap:1, alignItems:'center', overflowX:'auto' }}>
        {tabs.map(([id,label])=>(
          <button key={id} onClick={()=>setPage(id)} style={{ background:page===id?'rgba(255,255,255,0.14)':'transparent', border:page===id?'1px solid rgba(255,255,255,0.18)':'1px solid transparent', borderRadius:8, padding:'5px 11px', fontSize:12, cursor:'pointer', color:page===id?'#fff':'rgba(255,255,255,0.58)', fontFamily:'inherit', fontWeight:page===id?600:400, whiteSpace:'nowrap', transition:'all 0.15s' }}>{label}</button>
        ))}
        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.12)', margin:'0 6px', flexShrink:0 }} />
        <button onClick={onLogout} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'5px 12px', fontSize:12, cursor:'pointer', color:'rgba(255,255,255,0.5)', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>로그아웃</button>
      </nav>
    </header>
  );
}

// ─── Input Page ───────────────────────────────────────────────
function InputPage({ reading, onChange, onSave, saveMsg }) {
  const [analyzing,setAnalyzing]=useState(null);
  const [analyzeErr,setAnalyzeErr]=useState('');
  const [imgModal,setImgModal]=useState(null);
  const fileRef=useRef(null);
  const pendingTypeRef=useRef(null);

  const up=(path,val)=>{
    const keys=path.split('.');
    const next=JSON.parse(JSON.stringify(reading));
    let ref=next;
    for(let i=0;i<keys.length-1;i++) ref=ref[keys[i]];
    ref[keys[keys.length-1]]=val;
    onChange(next);
  };

  const triggerAnalyze=(type)=>{
    pendingTypeRef.current=type;
    setAnalyzeErr('');
    fileRef.current.value='';
    fileRef.current.click();
  };

  const handleFileChange=async(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    const type=pendingTypeRef.current;
    setAnalyzing(type);
    setAnalyzeErr('');
    try {
      // 1. 압축 → dataUrl
      const dataUrl=await compressImage(file);
      if(!dataUrl) throw new Error('이미지 압축 실패');

      // 2. 이미지 reading에 저장
      const next=JSON.parse(JSON.stringify(reading));
      next.images={ ...(next.images||{}), [type]:dataUrl };

      // 3. API 키 있으면 자동 분석
      const apiKey=store.get('tl_anthropic_key');
      if(apiKey){
        const result=await analyzeInvoiceImage(dataUrl, type);
        if(type==='elec'){
          if(result.basicFee)    next.elecBill.basicFee=result.basicFee;
          if(result.powerFund)   next.elecBill.powerFund=result.powerFund;
          if(result.totalAmount) next.elecBill.totalAmount=result.totalAmount;
          if(result.vat)         next.elecBill.vat=result.vat;
          if(result.safetyFee)   next.elecBill.safetyFee=result.safetyFee;
        } else {
          if(result.totalAmount) next.waterBill.totalAmount=result.totalAmount;
          if(result.basicFee)    next.waterBill.basicFee=result.basicFee;
        }
      }
      onChange(next);
    } catch(err) {
      setAnalyzeErr(err.message);
    } finally {
      setAnalyzing(null);
    }
  };
  const elecRows=[
    {key:'w1_220',label:'1층 웨지우드',  meter:'220V × 60',mult:60},
    {key:'t2_220',label:'2층 태하무역',  meter:'220V × 60',mult:60},
    {key:'t2_380',label:'2층 태하무역',  meter:'380V × 30',mult:30},
    {key:'y3_220',label:'3층 유연어패럴',meter:'220V × 60',mult:60},
    {key:'y3_380',label:'3층 유연어패럴',meter:'380V × 1', mult:1 },
    {key:'o4_220',label:'4층 사무실',    meter:'220V × 80',mult:80},
  ];
  const waterRows=[{key:'w1',label:'1층 웨지우드'},{key:'t2',label:'2층 태하무역'},{key:'y3',label:'3층 유연어패럴'},{key:'o4',label:'4층 사무실'}];
  const FL=({text})=><div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>{text}</div>;
  return (
    <div>
      <div style={CARD}>
        <SecHead icon="📅" title="적용 기간 및 청구 번호" />
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          {[['periodStart','시작일'],['periodEnd','종료일']].map(([key,label])=>(
            <div key={key} style={{ flex:1, minWidth:140 }}>
              <FL text={label} />
              <input type="date" value={reading[key]} onChange={e=>up(key,e.target.value)} style={{ ...baseInput, background:C.white, padding:'8px 10px' }} />
            </div>
          ))}
          <div style={{ background:C.navyBg, border:`1px solid ${C.navyBg2}`, borderRadius:12, padding:'11px 20px', textAlign:'center', minWidth:130 }}>
            <div style={{ fontSize:11, color:C.textSub, marginBottom:3 }}>청구번호</div>
            <div style={{ fontSize:19, fontWeight:700, color:C.navy, letterSpacing:'-0.5px' }}>{getBillingNo(reading.periodEnd)}</div>
            <div style={{ fontSize:12, color:C.navyLight, marginTop:2 }}>{getBillingMonth(reading.periodEnd)}</div>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="⚡" title="전기 검침값" />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <colgroup><col style={{ width:140 }}/><col style={{ width:110 }}/><col style={{ width:130 }}/><col style={{ width:130 }}/><col style={{ width:80 }}/><col style={{ width:110 }}/></colgroup>
            <thead><tr>{[['층/업체','left'],['계량기','left'],['전월','right'],['금월','right'],['사용량','right'],['환산kWh','right']].map(([h,a])=><th key={h} style={TH(a)}>{h}</th>)}</tr></thead>
            <tbody>
              {elecRows.map(({key,label,meter,mult},i)=>{
                const diff=(reading.elec[key].curr||0)-(reading.elec[key].prev||0);
                return (
                  <tr key={key} style={{ background:i%2===0?C.white:C.tAlt }}>
                    <td style={TD('left',{fontWeight:500})}>{label}</td>
                    <td style={TD('left',{color:C.textSub,fontSize:12})}>{meter}</td>
                    <td style={TD('right')}><NumInput value={reading.elec[key].prev} onChange={v=>up(`elec.${key}.prev`,v)} /></td>
                    <td style={TD('right')}><NumInput value={reading.elec[key].curr} onChange={v=>up(`elec.${key}.curr`,v)} /></td>
                    <td style={TD('right',{fontWeight:500,color:diff<0?C.red:C.textMid})}>{fmt(diff)}</td>
                    <td style={TD('right',{fontWeight:700,color:diff<0?C.red:C.green})}>{fmt(diff*mult)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="💧" title="수도 검침값" action={<button onClick={()=>up('waterCalc',reading.waterCalc==='O'?'X':'O')} style={btn(reading.waterCalc==='O'?'navyGhost':'danger')}>수도 계산: {reading.waterCalc==='O'?'포함':'제외'}</button>} />
        {reading.waterCalc==='O' ? (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{[['층/업체','left'],['전전월 검침','right'],['금월 검침','right'],['사용량(m³)','right']].map(([h,a])=><th key={h} style={TH(a)}>{h}</th>)}</tr></thead>
            <tbody>
              {waterRows.map(({key,label},i)=>{
                const diff=(reading.water[key].curr||0)-(reading.water[key].prev||0);
                return (
                  <tr key={key} style={{ background:i%2===0?C.white:C.tAlt }}>
                    <td style={TD('left',{fontWeight:500})}>{label}</td>
                    <td style={TD('right')}><NumInput value={reading.water[key].prev} onChange={v=>up(`water.${key}.prev`,v)} /></td>
                    <td style={TD('right')}><NumInput value={reading.water[key].curr} onChange={v=>up(`water.${key}.curr`,v)} /></td>
                    <td style={TD('right',{fontWeight:700,color:C.blue})}>{fmt(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:10, padding:'13px 16px', fontSize:13, color:C.red, textAlign:'center' }}>수도 계산 제외 — 이번 달 수도료 미청구</div>
        )}
      </div>

      {/* 숨김 파일 입력 */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFileChange} />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {[
          { icon:'📄', title:'전기 고지서 (한전)', type:'elec', rows:[['basicFee','기본요금'],['powerFund','전력산업기반기금'],['totalAmount','전기 고지 총액 ★'],['vat','부가가치세'],['safetyFee','전기안전대행료(월)']], obj:'elecBill' },
          { icon:'💧', title:'수도 고지서', type:'water', rows:reading.waterCalc==='O'?[['totalAmount','수도 고지 총액 ★'],['basicFee','수도 기본요금 (전체)']]:[],  obj:'waterBill' },
        ].map(({icon,title,type,rows,obj})=>(
          <div key={obj} style={CARD}>
            <SecHead icon={icon} title={title} action={
              <button onClick={()=>triggerAnalyze(type)} disabled={!!analyzing}
                style={{ ...btn('navyGhost'), height:30, padding:'0 12px', fontSize:12, opacity:analyzing?0.6:1 }}>
                {analyzing===type ? '⏳ 인식 중…' : '📸 이미지 자동 인식'}
              </button>
            } />
            {rows.length>0 ? rows.map(([k,label])=>(
              <div key={k} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:9 }}>
                <div style={{ fontSize:12.5, color:C.textSub, minWidth:148, flexShrink:0 }}>{label}</div>
                <NumInput value={reading[obj][k]} onChange={v=>up(`${obj}.${k}`,v)} />
                <span style={{ fontSize:11.5, color:C.textHint, flexShrink:0 }}>원</span>
              </div>
            )) : <div style={{ color:C.textHint, fontSize:13, padding:'10px 0' }}>수도 계산 제외 (X)</div>}
            {/* 첨부 이미지 썸네일 */}
            {reading.images?.[type] && (
              <div style={{ marginTop:10, position:'relative', display:'inline-block', width:'100%' }}>
                <img src={reading.images[type]} alt="고지서"
                  style={{ width:'100%', maxHeight:140, objectFit:'cover', borderRadius:8, border:`1px solid ${C.border}`, cursor:'pointer', display:'block' }}
                  onClick={()=>setImgModal(reading.images[type])} />
                <button onClick={()=>{ const n={...reading,images:{...reading.images,[type]:null}}; onChange(n); }}
                  style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                <div style={{ fontSize:11, color:C.textSub, marginTop:4 }}>클릭하면 크게 볼 수 있습니다</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {analyzeErr && (
        <div style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:10, padding:'10px 14px', fontSize:13, color:C.red, marginTop:4 }}>
          ⚠ {analyzeErr}
        </div>
      )}

      {/* 이미지 모달 */}
      {imgModal && (
        <div onClick={()=>setImgModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={imgModal} alt="고지서 원본" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8, boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()} />
          <button onClick={()=>setImgModal(null)} style={{ position:'fixed', top:18, right:22, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:'50%', width:36, height:36, fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
      )}

      <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:8 }}>
        <button onClick={onSave} style={btn('success')}>💾 히스토리 저장</button>
        {saveMsg && <span style={{ fontSize:12.5, color:C.green, fontWeight:500 }}>✓ {saveMsg}</span>}
      </div>
    </div>
  );
}

// ─── Invoice Card ─────────────────────────────────────────────
function InvoiceCard({ tenant, reading, calc, colorMode=true, onPrintReady }) {
  const billingNo=getBillingNo(reading.periodEnd);
  const billingMonth=getBillingMonth(reading.periodEnd);
  const fKey=tenant.id==='wedgwood'?'w1':tenant.id==='taeha'?'t2':'y3';
  const {kwh,totalKwh,elecDetail:ed,floorElec,waterCharges}=calc;
  const elecFee=floorElec[fKey]||0;
  const waterFee=reading.waterCalc==='O'?(waterCharges[fKey]||0):0;
  const mgmtFee=tenant.mgmtFee!=null?tenant.mgmtFee:tenant.mgmtArea*2500;
  const elevatorFee=tenant.elevator||0;
  const mgmtTotal=elecFee+waterFee+mgmtFee+elevatorFee;
  const mgmtVat=Math.round(mgmtTotal*0.1);
  const rentVat=Math.round(tenant.rent*0.1);
  const grandTotal=tenant.rent+rentVat+mgmtTotal+mgmtVat;
  const elecUsage=totalKwh>0?Math.round(ed.netElecFee*(kwh[fKey]||0)/totalKwh):0;

  const buildPrintHtml=(bw)=>{
    const elecDetailRows=[
      ['기본요금',`${fmt(reading.elecBill.basicFee)}원 ÷ 4층`,ed.elecPerFloor,true],
      ['전력산업기반기금',`${fmt(reading.elecBill.powerFund)}원 ÷ 4층`,ed.powerFundPerFloor,true],
      ['사용요금',`${fmt(kwh[fKey]||0)} kWh / ${fmt(totalKwh)} kWh`,elecUsage,true],
      ['전기안전대행료',`${fmt(reading.elecBill.safetyFee)}원 ÷ 4층`,ed.safetyPerFloor,true],
      ['전기료 소계','',elecFee,false,true],
      ['수도료',reading.waterCalc==='O'?'사용비율 배분':'미청구',waterFee,false],
      ['관리비',tenant.mgmtFee!=null?`${fmt(tenant.mgmtFee)}원 (고정)`:`${tenant.mgmtArea}평 × 2,500원`,mgmtFee,false],
      ...(elevatorFee>0?[['승강기','',elevatorFee,false]]:[]),
    ];

    if(bw){
      // ── 흑백: 배경색 완전 없음, 테두리+텍스트만 ──────────────────
      const detHtml=elecDetailRows.map(([label,desc,amt,indent,isTotal])=>
        `<tr>
          <td style="padding:6px 10px;padding-left:${indent?22:10}px;font-weight:${isTotal?700:400};font-size:12.5px;border-bottom:1px solid #bbb;">${indent?'└ ':''}${label}</td>
          <td style="padding:6px 10px;font-size:11px;color:#555;border-bottom:1px solid #bbb;">${desc}</td>
          <td style="padding:6px 10px;text-align:right;font-weight:${isTotal?700:500};font-size:12.5px;border-bottom:1px solid #bbb;font-variant-numeric:tabular-nums;">${fmt(amt)} 원</td>
        </tr>`
      ).join('');
      return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#000;background:#fff;}
.page{max-width:680px;margin:16px auto;}
.hdr{border:2.5px solid #000;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
.hdr>div:first-child{flex:1;min-width:0;}
.co{font-size:18px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.co-sub{font-size:10.5px;color:#333;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.inv{border:2px solid #000;padding:9px 15px;text-align:right;flex-shrink:0;}
.inv-lbl{font-size:10px;font-weight:700;letter-spacing:0.5px;}
.inv-no{font-size:17px;font-weight:900;margin-top:2px;letter-spacing:1px;}
.info{border:2.5px solid #000;border-top:none;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;}
.info>div:first-child{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.body{border:2.5px solid #000;border-top:none;padding:18px 20px;}
.banner{border:3px solid #000;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.b-lbl{font-size:12px;font-weight:700;}.b-sub{font-size:10px;color:#333;margin-top:2px;}
.b-amt{font-size:27px;font-weight:900;font-variant-numeric:tabular-nums;}
table{width:100%;border-collapse:collapse;margin-bottom:16px;}
th{border:1.5px solid #000;padding:9px 10px;font-size:11px;font-weight:800;background:#fff;color:#000;}
th.l{text-align:left;}th.r{text-align:right;}
td{border:1px solid #aaa;padding:9px 10px;font-size:13px;}
td.l{text-align:left;}td.r{text-align:right;font-variant-numeric:tabular-nums;}
.tot td{border-top:3px double #000;font-weight:800;font-size:14px;padding:11px 10px;}
.det{border:2px solid #888;padding:14px;margin-bottom:16px;}
.det-title{font-size:13px;font-weight:800;border-bottom:2px solid #888;padding-bottom:8px;margin-bottom:10px;}
.footer{text-align:center;font-size:11px;color:#444;padding-top:10px;border-top:1px solid #ccc;}
@media print{@page{margin:15mm;}}
</style></head><body>
<div class="page">
<div class="hdr">
  <div><div class="co">태림전자공업㈜</div><div class="co-sub">TAE LIM ELECTRONICS · ${CO_ADDR}</div></div>
  <div class="inv"><div class="inv-lbl">청구서 · INVOICE</div><div class="inv-no">${billingNo}-${tenant.suffix}</div></div>
</div>
<div class="info">
  <div><span style="font-size:11px;color:#444;">수신 </span><span style="font-size:14.5px;font-weight:700;">${tenant.fullName}</span><span style="font-size:11px;color:#555;margin-left:6px;">${tenant.floor}</span></div>
  <div style="text-align:right;"><div style="font-size:14px;font-weight:700;">${billingMonth}</div><div style="font-size:11px;color:#444;">${reading.periodStart} ~ ${reading.periodEnd}</div></div>
</div>
<div class="body">
  <div class="banner">
    <div><div class="b-lbl">이번 달 청구 총액 (VAT 포함)</div><div class="b-sub">임대료 + 관리비</div></div>
    <div class="b-amt">${fmt(grandTotal)} 원</div>
  </div>
  <table>
    <tr><th class="l">구분</th><th class="r">공급가액</th><th class="r">부가가치세</th><th class="r">합계</th></tr>
    <tr><td class="l">임대료</td><td class="r">${fmt(tenant.rent)}</td><td class="r">${fmt(rentVat)}</td><td class="r">${fmt(tenant.rent+rentVat)}</td></tr>
    <tr><td class="l">관리비</td><td class="r">${fmt(mgmtTotal)}</td><td class="r">${fmt(mgmtVat)}</td><td class="r">${fmt(mgmtTotal+mgmtVat)}</td></tr>
    <tr class="tot"><td class="l" colspan="3">합 계</td><td class="r">${fmt(grandTotal)} 원</td></tr>
  </table>
  <div class="det">
    <div class="det-title">◆ 관리비 산출 내역</div>
    <table style="margin:0;">${detHtml}
      <tr><td colspan="2" style="padding:10px;font-weight:800;font-size:13px;border-top:2.5px solid #888;">관리비 합계 (부가세 별도)</td>
      <td style="padding:10px;text-align:right;font-weight:900;font-size:15px;border-top:2.5px solid #888;font-variant-numeric:tabular-nums;">${fmt(mgmtTotal)} 원</td></tr>
    </table>
  </div>
  <div class="footer">발행인: 태림전자공업㈜ (인) · 발행일: ${new Date().toLocaleDateString('ko-KR')} · ${CO_ADDR}</div>
</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),500);}</script>
</body></html>`;
    }

    // ── 컬러: 각 요소에 inline print-color-adjust 직접 적용 ─────────
    const PC='print-color-adjust:exact;-webkit-print-color-adjust:exact;';
    const hBg=C.navyDark;
    const detHtml=elecDetailRows.map(([label,desc,amt,indent,isTotal])=>
      `<tr style="${isTotal?`background:rgba(180,83,9,0.06);${PC}`:''}" >
        <td style="padding:7px 12px;padding-left:${indent?26:12}px;font-size:12px;color:${isTotal?C.amber:'#555'};font-weight:${isTotal?700:400};border-bottom:1px solid ${C.amberBorder};">${indent?'└ ':''}${label}</td>
        <td style="padding:7px 12px;font-size:11px;color:#888;border-bottom:1px solid ${C.amberBorder};">${desc}</td>
        <td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:${isTotal?700:500};color:${isTotal?C.amber:C.navy};border-bottom:1px solid ${C.amberBorder};font-variant-numeric:tabular-nums;">${fmt(amt)} 원</td>
      </tr>`
    ).join('');
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body,*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#111;background:#fff;}
.page{max-width:680px;margin:20px auto;}
table{width:100%;border-collapse:collapse;margin-bottom:18px;}
td{padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;}
td.l{text-align:left;}td.r{text-align:right;font-variant-numeric:tabular-nums;}
.note{background:#fef9c3;border:2px solid #ca8a04;padding:10px 16px;text-align:center;font-size:12px;color:#713f12;margin-bottom:14px;border-radius:6px;}
@media print{.note{display:none!important;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}}
</style></head><body style="-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;">
<div class="page">
<div class="note">🖨️ 컬러 출력: 프린트 창 → <strong>배경 그래픽</strong> 체크 후 인쇄</div>
<div style="background:${hBg};color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;${PC}">
  <div>
    <div style="font-size:17px;font-weight:700;">태림전자공업㈜</div>
    <div style="font-size:10px;opacity:0.65;margin-top:3px;">TAE LIM ELECTRONICS · ${CO_ADDR}</div>
  </div>
  <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:7px;padding:9px 16px;text-align:right;${PC}">
    <div style="font-size:10px;opacity:0.8;letter-spacing:0.5px;">청구서 · INVOICE</div>
    <div style="font-size:17px;font-weight:800;margin-top:2px;letter-spacing:1px;">${billingNo}-${tenant.suffix}</div>
  </div>
</div>
<div style="background:${C.navyBg};padding:10px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${C.navyBg2};${PC}">
  <div><span style="font-size:11px;color:#666;">수신 </span><span style="font-size:13.5px;font-weight:700;color:${C.navy};">${tenant.fullName}</span><span style="font-size:11px;color:#777;margin-left:6px;">${tenant.floor}</span></div>
  <div style="text-align:right;"><div style="font-size:14px;font-weight:700;color:${C.navy};">${billingMonth}</div><div style="font-size:11px;color:#666;">${reading.periodStart} ~ ${reading.periodEnd}</div></div>
</div>
<div style="padding:20px 24px;border:1px solid ${C.navyBg2};border-top:none;">
  <div style="background:${hBg};color:#fff;padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;${PC}">
    <div><div style="font-size:11px;opacity:0.8;">이번 달 청구 총액 (VAT 포함)</div><div style="font-size:10px;opacity:0.6;margin-top:2px;">임대료 + 관리비</div></div>
    <div style="font-size:24px;font-weight:900;letter-spacing:-1px;font-variant-numeric:tabular-nums;">${fmt(grandTotal)} 원</div>
  </div>
  <table>
    <thead><tr style="background:${hBg};color:#fff;${PC}">
      <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:600;">구분</th>
      <th style="padding:9px 12px;text-align:right;font-size:11px;font-weight:600;">공급가액</th>
      <th style="padding:9px 12px;text-align:right;font-size:11px;font-weight:600;">부가가치세</th>
      <th style="padding:9px 12px;text-align:right;font-size:11px;font-weight:600;">합계</th>
    </tr></thead>
    <tbody>
      <tr><td class="l">임대료</td><td class="r">${fmt(tenant.rent)}</td><td class="r">${fmt(rentVat)}</td><td class="r">${fmt(tenant.rent+rentVat)}</td></tr>
      <tr style="background:#f9fafb;"><td class="l">관리비</td><td class="r">${fmt(mgmtTotal)}</td><td class="r">${fmt(mgmtVat)}</td><td class="r">${fmt(mgmtTotal+mgmtVat)}</td></tr>
      <tr style="background:${C.navyBg};border-top:2px solid ${C.navy};${PC}">
        <td class="l" colspan="3" style="padding:10px 12px;font-weight:700;color:${C.navy};">합 계</td>
        <td class="r" style="padding:10px 12px;font-weight:900;font-size:15px;color:${C.navy};font-variant-numeric:tabular-nums;">${fmt(grandTotal)} 원</td>
      </tr>
    </tbody>
  </table>
  <div style="background:${C.amberBg};border:1px solid ${C.amberBorder};border-radius:7px;padding:14px 16px;margin-bottom:16px;${PC}">
    <div style="font-size:13px;font-weight:700;color:${C.amber};margin-bottom:10px;">◆ 관리비 산출 내역</div>
    <table style="margin:0;">${detHtml}
      <tr style="background:rgba(180,83,9,0.05);border-top:2px solid ${C.amberBorder};${PC}">
        <td colspan="2" style="padding:10px 12px;font-weight:700;color:${C.amber};font-size:13px;">관리비 합계 (부가세 별도)</td>
        <td style="padding:10px 12px;text-align:right;font-weight:900;font-size:15px;color:${C.amber};font-variant-numeric:tabular-nums;">${fmt(mgmtTotal)} 원</td>
      </tr>
    </table>
  </div>
  <div style="text-align:center;font-size:11px;color:#888;padding-top:10px;border-top:1px solid #e0e0e0;">발행인: 태림전자공업㈜ (인) · 발행일: ${new Date().toLocaleDateString('ko-KR')} · ${CO_ADDR}</div>
</div>
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),800);}</script>
</body></html>`;
  };

  // Blob URL 방식으로 열기 (about:blank보다 색상 출력 신뢰도 높음)
  const handlePrint=(bw)=>{
    const html=buildPrintHtml(bw);
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){alert('팝업이 차단되어 있습니다.\n브라우저에서 팝업을 허용해주세요.'); return;}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  // 상단 버튼에서 호출할 수 있도록 등록
  onPrintReady?.(handlePrint);
  const handleEmail=()=>{
    const subject=encodeURIComponent(`[태림전자공업] ${billingMonth} 임대료 및 관리비 청구서 (${billingNo}-${tenant.suffix})`);
    const body=encodeURIComponent(`안녕하세요, ${tenant.fullName} 담당자님.\n\n${billingMonth} 청구서 안내드립니다.\n\n■ 청구번호: ${billingNo}-${tenant.suffix}\n■ 적용기간: ${reading.periodStart} ~ ${reading.periodEnd}\n\n임대료: ${fmt(tenant.rent)}원 (VAT ${fmt(rentVat)}원)\n관리비: ${fmt(mgmtTotal)}원 (VAT ${fmt(mgmtVat)}원)\n합계: ${fmt(grandTotal)}원\n\n감사합니다.\n\n태림전자공업㈜`);
    const to=encodeURIComponent(tenant.email||'');
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`,'_blank');
  };

  const col=colorMode;
  const hdrBg=col?`linear-gradient(135deg,${C.navyDark} 0%,${C.navy} 55%,${C.navyMid} 100%)`:'#111';
  const detailRows=[
    {label:'기본요금',   desc:`${fmt(reading.elecBill.basicFee)}원 ÷ 4층`,        amt:ed.elecPerFloor,      indent:true},
    {label:'전력산업기반기금', desc:`${fmt(reading.elecBill.powerFund)}원 ÷ 4층`, amt:ed.powerFundPerFloor, indent:true},
    {label:'사용요금',   desc:`${fmt(kwh[fKey]||0)} kWh / ${fmt(totalKwh)} kWh`,  amt:elecUsage,            indent:true},
    {label:'전기안전대행료', desc:`${fmt(reading.elecBill.safetyFee)}원 ÷ 4층`,   amt:ed.safetyPerFloor,    indent:true},
    {label:'전기료 소계', desc:'',                                                  amt:elecFee,              sub:true},
    {label:'수도료',     desc:reading.waterCalc==='O'?'사용비율 배분':'미청구',    amt:waterFee},
    {label:'관리비',     desc:tenant.mgmtFee!=null?`${fmt(tenant.mgmtFee)}원 (고정)`:`${tenant.mgmtArea}평 × 2,500원`, amt:mgmtFee},
    ...(elevatorFee>0?[{label:'승강기',desc:'',amt:elevatorFee}]:[]),
  ];
  const dColor=col?C.amber:'#111';
  const dBg=col?C.amberBg:'#f5f5f5';
  const dBrd=col?C.amberBorder:'#ccc';

  return (
    <div style={{ background:C.white, borderRadius:col?14:0, overflow:'hidden', maxWidth:660, boxShadow:col?sh.invoice:'none', border:col?'none':'2px solid #111' }}>
      <div style={{ background:hdrBg, color:'#fff', padding:'18px 22px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <TLLogo size={40} bw={!col} />
          <div>
            <div style={{ fontWeight:700, fontSize:17, letterSpacing:'-0.3px' }}>태림전자공업㈜</div>
            <div style={{ fontSize:10, opacity:0.6, marginTop:2, letterSpacing:'0.5px' }}>TAE LIM ELECTRONICS CO., LTD</div>
          </div>
        </div>
        <div style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:10, padding:'9px 16px', textAlign:'right' }}>
          <div style={{ fontSize:10, opacity:0.7, letterSpacing:'0.5px' }}>청구서 · INVOICE</div>
          <div style={{ fontSize:16, fontWeight:700, letterSpacing:'1px', marginTop:2 }}>{billingNo}-{tenant.suffix}</div>
        </div>
      </div>
      <div style={{ background:col?C.navyBg:'#f0f0f0', padding:'10px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${col?C.navyBg2:'#ccc'}` }}>
        <div><span style={{ fontSize:11, color:C.textSub }}>수신 </span><span style={{ fontSize:13.5, fontWeight:700, color:col?C.navy:'#000' }}>{tenant.fullName}</span><span style={{ fontSize:12, color:C.textSub, marginLeft:6 }}>{tenant.floor}</span></div>
        <div style={{ textAlign:'right' }}><div style={{ fontSize:14, fontWeight:700, color:col?C.navy:'#000' }}>{billingMonth}</div><div style={{ fontSize:11, color:C.textSub }}>{reading.periodStart} ~ {reading.periodEnd}</div></div>
      </div>
      <div style={{ padding:'20px 22px' }}>
        <div style={{ background:hdrBg, color:'#fff', padding:'14px 18px', borderRadius:col?10:0, display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div><div style={{ fontSize:11, opacity:0.75 }}>이번 달 청구 총액 (VAT 포함)</div><div style={{ fontSize:10, opacity:0.55, marginTop:2 }}>임대료 + 관리비</div></div>
          <div style={{ fontSize:22, fontWeight:800, letterSpacing:'-0.5px', fontVariantNumeric:'tabular-nums' }}>{fmt(grandTotal)} 원</div>
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:18 }}>
          <thead><tr style={{ background:col?C.navy:'#111', color:'#fff' }}>{[['구분','left'],['공급가액','right'],['부가가치세','right'],['합계','right']].map(([h,a])=><th key={h} style={{ padding:'9px 12px', textAlign:a, fontSize:11, fontWeight:600 }}>{h}</th>)}</tr></thead>
          <tbody>
            {[{label:'임대료',supply:tenant.rent,vat:rentVat,total:tenant.rent+rentVat},{label:'관리비',supply:mgmtTotal,vat:mgmtVat,total:mgmtTotal+mgmtVat}].map((r,i)=>(
              <tr key={r.label} style={{ background:i%2===0?C.white:C.tAlt }}>
                <td style={{ padding:'10px 12px', fontWeight:500, borderBottom:`1px solid ${C.tBorder}` }}>{r.label}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', borderBottom:`1px solid ${C.tBorder}`, fontVariantNumeric:'tabular-nums' }}>{fmt(r.supply)}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', borderBottom:`1px solid ${C.tBorder}`, fontVariantNumeric:'tabular-nums' }}>{fmt(r.vat)}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:600, borderBottom:`1px solid ${C.tBorder}`, fontVariantNumeric:'tabular-nums' }}>{fmt(r.total)}</td>
              </tr>
            ))}
            <tr style={{ background:col?C.navyBg:'#e8e8e8', borderTop:`2px solid ${col?C.navy:'#111'}` }}>
              <td style={{ padding:'10px 12px', fontWeight:700, color:col?C.navy:'#000' }} colSpan={3}>합계</td>
              <td style={{ padding:'10px 12px', textAlign:'right', fontWeight:800, fontSize:16, color:col?C.navy:'#000', fontVariantNumeric:'tabular-nums' }}>{fmt(grandTotal)} 원</td>
            </tr>
          </tbody>
        </table>
        <div style={{ background:dBg, border:`1px solid ${dBrd}`, borderRadius:col?10:0, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontSize:12.5, fontWeight:700, color:dColor, marginBottom:10 }}>◆ 관리비 산출 내역</div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <tbody>
              {detailRows.map((r,i)=>(
                <tr key={i} style={{ background:r.sub?(col?'rgba(180,83,9,0.07)':'#e8e8e8'):'transparent' }}>
                  <td style={{ padding:'6px 10px', paddingLeft:r.indent?22:10, fontSize:12, borderBottom:`1px solid ${dBrd}`, color:r.sub?dColor:C.textSub, fontWeight:r.sub?700:400 }}>{r.indent&&<span style={{ color:col?C.amberBorder:'#bbb', marginRight:4 }}>└</span>}{r.label}</td>
                  <td style={{ padding:'6px 10px', fontSize:11, borderBottom:`1px solid ${dBrd}`, color:C.textHint }}>{r.desc}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', fontSize:12, fontWeight:r.sub?700:500, borderBottom:`1px solid ${dBrd}`, color:r.sub?dColor:(col?C.navy:'#111'), fontVariantNumeric:'tabular-nums' }}>{fmt(r.amt)} 원</td>
                </tr>
              ))}
              <tr style={{ background:col?'rgba(180,83,9,0.04)':'#efefef', borderTop:`2px solid ${dBrd}` }}>
                <td colSpan={2} style={{ padding:'9px 10px', fontWeight:700, color:dColor, fontSize:13 }}>관리비 합계 (부가세 별도)</td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:800, fontSize:15, color:dColor, fontVariantNumeric:'tabular-nums' }}>{fmt(mgmtTotal)} 원</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="no-print" style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button onClick={handleEmail} style={{ ...btn('success'), flex:1 }}>📧 이메일 발송</button>
        </div>
        <div style={{ fontSize:11.5, color:C.textHint, textAlign:'center', borderTop:`1px solid ${C.tBorder}`, paddingTop:10 }}>발행인: 태림전자공업㈜ (인) · 발행일: {new Date().toLocaleDateString('ko-KR')} · {CO_ADDR}</div>
      </div>
    </div>
  );
}

// ─── Invoice Page ─────────────────────────────────────────────
function InvoicePage({ reading, tenants, calc }) {
  const [active,setActive]=useState(0);
  const printRef=useRef(null); // InvoiceCard가 여기에 handlePrint를 등록

  return (
    <div>
      <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        {/* 업체 선택 탭 */}
        <div style={{ display:'flex', background:C.white, borderRadius:20, border:`1px solid ${C.border}`, overflow:'hidden', boxShadow:sh.card }}>
          {tenants.map((t,i)=>(
            <button key={t.id} onClick={()=>setActive(i)}
              style={{ ...btn(active===i?'active':'inactive'), borderRadius:0, height:36, borderRight:i<2?`1px solid ${C.border}`:'none' }}>
              {t.floor} {t.name}
            </button>
          ))}
        </div>
        {/* PDF 출력 버튼 (상단) */}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>printRef.current?.(false)} style={btn('primary')}>🎨 컬러 PDF 출력</button>
          <button onClick={()=>printRef.current?.(true)}  style={btn('secondary')}>⬜ 흑백 PDF 출력</button>
        </div>
      </div>
      <InvoiceCard
        tenant={tenants[active]}
        reading={reading}
        calc={calc}
        colorMode={true}
        onPrintReady={fn=>{ printRef.current=fn; }}
      />
    </div>
  );
}

// ─── Quarterly Page ───────────────────────────────────────────
function QuarterlyPage({ history, tenants }) {
  // 검침월 = periodEnd 월 - 1 (청구 전달이 검침월)
  const meterMonth=(periodEnd)=>{
    const d=new Date(periodEnd);
    const m=d.getMonth(); // 0-indexed: 0=Jan
    return { year: d.getFullYear()-(m===0?1:0), month: m===0?12:m };
  };
  const allYears=[...new Set(history.map(h=>meterMonth(h.periodEnd).year))].sort((a,b)=>b-a);
  const [selYear,setSelYear]=useState(()=>allYears[0]||new Date().getFullYear());
  const [selQ,setSelQ]=useState(1);

  const qMonths={1:[1,2,3],2:[4,5,6],3:[7,8,9],4:[10,11,12]};
  const qLabel={1:'1~3월',2:'4~6월',3:'7~9월',4:'10~12월'};

  if(!history.length) return <div style={{ ...CARD, padding:'3rem', textAlign:'center', color:C.textSub, fontSize:14 }}>저장된 데이터가 없습니다. 검침 입력 후 저장하세요.</div>;

  // 검침월 기준으로 분류 (periodEnd 기준 전달)
  const processed=history.map(h=>{
    const c=calcAll(h);
    const {year,month}=meterMonth(h.periodEnd);
    const td={};
    tenants.forEach(t=>{
      const fk=t.id==='wedgwood'?'w1':t.id==='taeha'?'t2':'y3';
      const ef=c.floorElec[fk]||0;
      const wf=h.waterCalc==='O'?(c.waterCharges[fk]||0):0;
      const mf=t.mgmtFee!=null?t.mgmtFee:t.mgmtArea*2500;
      const mt=ef+wf+mf+(t.elevator||0);
      const mv=Math.round(mt*0.1), rv=Math.round(t.rent*0.1);
      td[t.id]={
        kwh:c.kwh[fk]||0,
        water:h.waterCalc==='O'?(c.waterDetail.usage[fk]||0):null,
        grandTotal:(h.amounts&&h.amounts[t.id]!=null)?h.amounts[t.id]:(t.rent+rv+mt+mv),
      };
    });
    return {year, month, billingLabel:getBillingMonth(h.periodEnd), td, h};
  });

  const months=qMonths[selQ];
  const monthEntries=months.map(m=>processed.find(p=>p.year===selYear&&p.month===m)||null);

  const handlePrint=(bw)=>{
    const hBg=bw?'#111':C.navyDark;
    const mBrd=bw?'#aaa':'#c7d2fe';

    // Meter section
    let meterRows='';
    tenants.forEach((t,ti)=>{
      const cells=months.map((m,mi)=>{
        const e=monthEntries[mi]; const d=e?e.td[t.id]:null;
        return `<td class="r${mi<2?' bl':''}">${d?fmt(d.kwh):'—'}</td><td class="r bl2">${d?(d.water!==null?fmt(d.water):'미청구'):'—'}</td>`;
      }).join('');
      meterRows+=`<tr style="background:${ti%2===0?'#fff':'#f5f5f5'}"><td class="tn">${t.floor} ${t.name}</td>${cells}</tr>`;
    });
    const mTotCells=months.map((m,mi)=>{
      const e=monthEntries[mi];
      const tk=e?tenants.reduce((s,t)=>s+(e.td[t.id].kwh||0),0):null;
      const tw=e?tenants.reduce((s,t)=>{ const w=e.td[t.id].water; return w!==null?s+w:s; },0):null;
      return `<td class="r tot${mi<2?' bl':''}">${tk!==null?fmt(tk):'—'}</td><td class="r tot bl2">${tw!==null?fmt(tw):'—'}</td>`;
    }).join('');
    meterRows+=`<tr style="background:#EEF2FF;border-top:2px solid ${hBg}"><td class="tn bold">합 계</td>${mTotCells}</tr>`;

    // Billing section
    let billingRows='';
    tenants.forEach((t,ti)=>{
      const vals=months.map((m,mi)=>{ const e=monthEntries[mi]; return e?e.td[t.id].grandTotal:null; });
      const qt=vals.reduce((s,v)=>s+(v||0),0);
      const cells=vals.map((v,mi)=>`<td class="r${mi<2?' bl':''}">${v?fmt(v):'—'}</td>`).join('');
      billingRows+=`<tr style="background:${ti%2===0?'#fff':'#f5f5f5'}"><td class="tn">${t.floor} ${t.name}</td>${cells}<td class="r tot">${qt>0?fmt(qt):'—'}</td></tr>`;
    });
    const mSums=months.map((m,mi)=>{ const e=monthEntries[mi]; return e?tenants.reduce((s,t)=>s+e.td[t.id].grandTotal,0):null; });
    const qGrand=mSums.reduce((s,v)=>s+(v||0),0);
    billingRows+=`<tr style="background:#EEF2FF;border-top:2px solid ${hBg}"><td class="tn bold">3사 합계</td>${mSums.map((v,mi)=>`<td class="r tot${mi<2?' bl':''}">${v?fmt(v):'—'}</td>`).join('')}<td class="r tot" style="font-size:14px;">${qGrand>0?fmt(qGrand):'—'}</td></tr>`;

    const mHead1=months.map((m,mi)=>`<th colspan="2" style="text-align:center;background:${hBg};color:#fff;border-right:${mi<2?'2px solid rgba(255,255,255,0.3)':'none'};">${selYear}년 ${m}월</th>`).join('');
    const mHead2=months.map((m,mi)=>`<th class="r" style="background:#fffbeb;color:#92400e;">전기(kWh)</th><th class="r bl2" style="background:#eff6ff;color:#1d4ed8;">수도(m³)</th>`).join('');
    const bHead=months.map((m,mi)=>`<th class="r${mi<2?' bl':''}">${selYear}년 ${m}월</th>`).join('');

    const html=`<!DOCTYPE html><html lang="ko" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;"><head><meta charset="UTF-8"><style>html,body,*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:12px;background:#fff;}
.page{max-width:900px;margin:20px auto;padding:0 10px;}
h2{font-size:15px;font-weight:700;margin-bottom:3px;}h3{font-size:13px;font-weight:700;margin:18px 0 6px;color:${hBg};}
.sub{color:#777;font-size:11px;margin-bottom:14px;}
table{width:100%;border-collapse:collapse;margin-bottom:4px;}
th,td{border:1px solid #ddd;padding:7px 10px;font-size:11.5px;}
th{background:#f0f0f0;font-weight:600;}
.r{text-align:right;font-variant-numeric:tabular-nums;}
.tn{text-align:left;font-weight:500;min-width:120px;}
.bold{font-weight:700;}
.tot{font-weight:700;}
.bl{border-left:2px solid #bbb;}
.bl2{border-left:1px solid #ddd;}
</style></head><body style="-webkit-print-color-adjust:exact;print-color-adjust:exact;"><div class="page">
<h2>태림전자공업㈜ — ${selYear}년 ${selQ}분기 검침 현황</h2>
<div class="sub">${selYear}년 ${months[0]}월 ~ ${months[2]}월 · 출력일: ${new Date().toLocaleDateString('ko-KR')}</div>
<h3>▶ 전기·수도 사용량</h3>
<table><thead>
<tr><th rowspan="2" style="text-align:left;background:${hBg};color:#fff;">층 / 업체</th>${mHead1}</tr>
<tr>${mHead2}</tr>
</thead><tbody>${meterRows}</tbody></table>
<h3>▶ 청구금액 비교 (VAT 포함)</h3>
<table><thead><tr><th style="text-align:left;background:${hBg};color:#fff;min-width:120px;">층 / 업체</th>${bHead}<th class="r" style="background:${hBg};color:#fff;">분기 합계</th></tr></thead><tbody>${billingRows}</tbody></table>
</div><script>window.onload=()=>window.print();</script></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){alert('팝업이 차단되어 있습니다.\n브라우저에서 팝업을 허용해주세요.'); return;}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };

  const thM=(hasData)=>({
    ...TH('center'),
    background:hasData?C.navy:C.tHead, color:hasData?'#fff':C.textHint,
    borderRight:`2px solid ${C.tBorder}`, fontSize:12, padding:'8px 12px',
  });
  const thSub=(color,bg,isLast)=>({ ...TH('right'), background:bg, color, borderRight:isLast?'none':`1px solid ${C.tBorder}`, fontSize:11 });

  // ── 검침표 출력 ──────────────────────────────────────────────
  const handleMeterPrint=(bw)=>{
    const hBg=bw?'#1a1a1a':C.navyDark;
    const accent=bw?'#444':'#4f46e5';
    const rowAlt=bw?'#f0f0f0':'#eef2ff';
    const brdColor=bw?'#888':'#c7d2fe';
    const today=new Date().toLocaleDateString('ko-KR');

    const elecDef=[
      {key:'w1_220', floor:'1층', name:'웨지우드',   meter:'220V', mult:60,  multLabel:'× 60'},
      {key:'t2_220', floor:'2층', name:'태하무역',   meter:'220V', mult:60,  multLabel:'× 60'},
      {key:'t2_380', floor:'2층', name:'태하무역',   meter:'380V', mult:30,  multLabel:'× 30'},
      {key:'y3_220', floor:'3층', name:'유연어패럴', meter:'220V', mult:60,  multLabel:'× 60'},
      {key:'y3_380', floor:'3층', name:'유연어패럴', meter:'380V', mult:1,   multLabel:'× 1'},
      {key:'o4_220', floor:'4층', name:'사무실',     meter:'220V', mult:80,  multLabel:'× 80'},
    ];
    const waterDef=[
      {key:'w1', floor:'1층', name:'웨지우드'},
      {key:'t2', floor:'2층', name:'태하무역'},
      {key:'y3', floor:'3층', name:'유연어패럴'},
      {key:'o4', floor:'4층', name:'사무실'},
    ];

    // 선택된 분기의 3개월 데이터
    const mDataRows=(section)=>{
      if(section==='elec'){
        return elecDef.map((r,i)=>{
          const rowBg=i%2===0?'#fff':rowAlt;
          const cells=months.map((m,mi)=>{
            const e=monthEntries[mi];
            const val=e?.h?.elec?.[r.key];
            if(!val) return `<td style="text-align:right;color:#bbb;">—</td><td style="text-align:right;color:#bbb;">—</td><td style="text-align:right;color:#bbb;">—</td>`;
            const diff=(val.curr||0)-(val.prev||0);
            const kwh=diff*r.mult;
            return `<td style="text-align:right;font-variant-numeric:tabular-nums;">${val.prev.toLocaleString('ko-KR')}</td><td style="text-align:right;font-variant-numeric:tabular-nums;">${val.curr.toLocaleString('ko-KR')}</td><td style="text-align:right;font-weight:600;color:${bw?'#111':accent};font-variant-numeric:tabular-nums;">${kwh.toLocaleString('ko-KR')}</td>`;
          }).join('');
          return `<tr style="background:${rowBg}"><td>${r.floor}</td><td>${r.name}</td><td style="text-align:center;">${r.meter}</td><td style="text-align:center;font-weight:600;">${r.multLabel}</td>${cells}</tr>`;
        }).join('');
      } else {
        return waterDef.map((r,i)=>{
          const rowBg=i%2===0?'#fff':rowAlt;
          const cells=months.map((m,mi)=>{
            const e=monthEntries[mi];
            if(e?.h?.waterCalc!=='O') return `<td colspan="3" style="text-align:center;color:#bbb;font-size:10px;">수도 미검침</td>`;
            const val=e?.h?.water?.[r.key];
            if(!val) return `<td style="text-align:right;color:#bbb;">—</td><td style="text-align:right;color:#bbb;">—</td><td style="text-align:right;color:#bbb;">—</td>`;
            const diff=(val.curr||0)-(val.prev||0);
            return `<td style="text-align:right;font-variant-numeric:tabular-nums;">${val.prev.toLocaleString('ko-KR')}</td><td style="text-align:right;font-variant-numeric:tabular-nums;">${val.curr.toLocaleString('ko-KR')}</td><td style="text-align:right;font-weight:600;color:${bw?'#111':'#1d4ed8'};font-variant-numeric:tabular-nums;">${diff.toLocaleString('ko-KR')}</td>`;
          }).join('');
          return `<tr style="background:${rowBg}"><td>${r.floor}</td><td>${r.name}</td>${cells}</tr>`;
        }).join('');
      }
    };

    const mHead=months.map((m,mi)=>{
      const e=monthEntries[mi];
      const label=e?`${selYear}년 ${m}월`:`${selYear}년 ${m}월`;
      return `<th colspan="3" style="background:${e?hBg:'#888'};color:#fff;text-align:center;border:1px solid ${brdColor};padding:6px 4px;">${label}${e?'':' (미저장)'}</th>`;
    }).join('');

    const html=`<!DOCTYPE html><html lang="ko" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;"><head><meta charset="UTF-8">
<style>
html,body,*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;background:#fff;color:#111;}
@page{size:A4 portrait;margin:12mm 12mm 14mm;}
.page{width:100%;max-width:780px;margin:0 auto;}
.hdr{background:${hBg};color:#fff;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
.hdr-co{font-size:15px;font-weight:800;letter-spacing:1px;}
.hdr-sub{font-size:9px;opacity:0.7;margin-top:3px;}
.hdr-title{font-size:18px;font-weight:900;letter-spacing:4px;}
.section-title{background:${accent};color:#fff;font-weight:700;font-size:11px;padding:5px 10px;margin:8px 0 0;letter-spacing:1px;}
table{width:100%;border-collapse:collapse;margin-bottom:2px;}
th,td{border:1px solid ${brdColor};padding:5px 6px;font-size:10.5px;vertical-align:middle;}
th{background:${hBg};color:#fff;font-weight:600;text-align:center;}
th.sub{background:${accent};color:#fff;font-size:10px;}
td{text-align:left;}
tr:hover{background:inherit;}
.sig{border:1.5px solid ${brdColor};margin-top:10px;display:grid;grid-template-columns:1fr 1fr 1fr;height:52px;}
.sig-cell{border-right:1.5px solid ${brdColor};padding:5px 10px;display:flex;flex-direction:column;justify-content:space-between;}
.sig-cell:last-child{border-right:none;}
.sig-label{font-size:10px;color:#555;font-weight:600;}
.sig-line{border-bottom:1px solid #999;margin-top:auto;height:1px;}
.note{font-size:9px;color:#888;margin-top:5px;text-align:right;}
@media print{.no-print{display:none!important;}}
</style>
</head><body style="-webkit-print-color-adjust:exact;print-color-adjust:exact;"><div class="page">
<div class="hdr">
  <div><div class="hdr-co">태림전자공업㈜ 검침 기록표</div><div class="hdr-sub">${CO_ADDR} · Tel:${CO_TEL}</div></div>
  <div class="hdr-title">${selYear}년 ${selQ}분기</div>
</div>

<!-- 전기 검침 -->
<div class="section-title">⚡ 전기 검침값 (단위: kWh)</div>
<table>
<thead>
  <tr>
    <th rowspan="2" style="width:42px;">층</th>
    <th rowspan="2" style="width:68px;">업체</th>
    <th rowspan="2" style="width:40px;">계량기</th>
    <th rowspan="2" style="width:38px;">배율</th>
    ${mHead}
  </tr>
  <tr>
    ${months.map(()=>`<th class="sub">전월</th><th class="sub">금월</th><th class="sub">환산kWh</th>`).join('')}
  </tr>
</thead>
<tbody>${mDataRows('elec')}</tbody>
</table>

<!-- 수도 검침 -->
<div class="section-title">💧 수도 검침값 (단위: m³)</div>
<table>
<thead>
  <tr>
    <th rowspan="2" style="width:42px;">층</th>
    <th rowspan="2" style="width:68px;">업체</th>
    ${mHead}
  </tr>
  <tr>
    ${months.map(()=>`<th class="sub">전전월</th><th class="sub">금월</th><th class="sub">사용(m³)</th>`).join('')}
  </tr>
</thead>
<tbody>${mDataRows('water')}</tbody>
</table>

<!-- 서명란 -->
<div class="sig">
  <div class="sig-cell"><div class="sig-label">확인자</div><div class="sig-line"></div></div>
  <div class="sig-cell"><div class="sig-label">검침일</div><div class="sig-line"></div></div>
  <div class="sig-cell"><div class="sig-label">서명</div><div class="sig-line"></div></div>
</div>
<div class="note">출력일: ${today} · 태림전자공업㈜</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;

    const blob2=new Blob([html],{type:'text/html;charset=utf-8'});
    const url2=URL.createObjectURL(blob2);
    const w=window.open(url2,'_blank');
    if(!w){alert('팝업이 차단되어 있습니다.\n브라우저에서 팝업을 허용해주세요.'); return;}
    setTimeout(()=>URL.revokeObjectURL(url2),60000);
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:15, fontWeight:700, color:C.navyDark }}>분기별 검침 현황</span>
          <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}
            style={{ ...baseInput, width:'auto', padding:'5px 14px', fontSize:13, fontWeight:600, color:C.navyDark, background:C.navyBg, border:`1px solid ${C.navyBg2}`, borderRadius:20, cursor:'pointer' }}>
            {allYears.map(y=><option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>handlePrint(false)} style={btn('primary')}>🎨 컬러 PDF</button>
          <button onClick={()=>handlePrint(true)}  style={btn('secondary')}>⬜ 흑백 PDF</button>
        </div>
      </div>

      {/* Quarter tabs + 검침표 출력 */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', background:C.white, border:`1px solid ${C.border}`, borderRadius:20, overflow:'hidden', boxShadow:sh.card }}>
          {[1,2,3,4].map(q=>(
            <button key={q} onClick={()=>setSelQ(q)}
              style={{ ...btn(selQ===q?'active':'inactive'), borderRadius:0, height:48, minWidth:100, borderRight:q<4?`1px solid ${C.border}`:'none', flexDirection:'column', gap:2 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>{q}분기</span>
              <span style={{ fontSize:10, opacity:0.7 }}>{qLabel[q]}</span>
            </button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:C.textSub }}>검침표 인쇄:</span>
          <button onClick={()=>handleMeterPrint(false)} style={btn('primary')}>🖨️ 컬러</button>
          <button onClick={()=>handleMeterPrint(true)}  style={btn('secondary')}>⬜ 흑백</button>
        </div>
      </div>

      {/* Meter comparison — Excel-style */}
      <div style={CARD}>
        <SecHead icon="⚡" title={`${selYear}년 ${selQ}분기 — 전기·수도 사용량`} />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              {/* Month group row */}
              <tr>
                <th style={{ ...TH('left',140), background:C.navyDark, color:'#fff', verticalAlign:'middle' }} rowSpan={2}>층 / 업체</th>
                {months.map((m,mi)=>{
                  const e=monthEntries[mi];
                  return <th key={m} colSpan={2} style={thM(!!e)}>{selYear}년 {m}월{e&&<div style={{ fontSize:10, fontWeight:400, opacity:0.75, marginTop:2 }}>{e.billingLabel}</div>}</th>;
                })}
              </tr>
              {/* Sub-header row */}
              <tr>
                {months.map((m,mi)=>(
                  <Fragment key={m}>
                    <th style={thSub(C.amber,C.amberBg,false)}>전기 kWh</th>
                    <th style={thSub(C.blue,C.blueBg,mi>=2)}>수도 m³</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t,ti)=>(
                <tr key={t.id} style={{ background:ti%2===0?C.white:C.tAlt }}>
                  <td style={TD('left',{fontWeight:600,color:C.navy,borderRight:`2px solid ${C.tBorder}`})}>
                    <span style={{ fontSize:11, background:C.navyBg, color:C.navyMid, borderRadius:6, padding:'1px 7px', marginRight:7 }}>{t.floor}</span>{t.name}
                  </td>
                  {months.map((m,mi)=>{
                    const e=monthEntries[mi]; const d=e?e.td[t.id]:null;
                    return (
                      <Fragment key={m}>
                        <td style={TD('right',{fontWeight:d?600:400, color:d?C.amber:C.textHint, borderLeft:`1px solid ${C.tBorder}`})}>{d?fmt(d.kwh):'—'}</td>
                        <td style={TD('right',{fontWeight:d?600:400, color:d?(d.water!==null?C.blue:C.textSub):C.textHint, borderRight:mi<2?`2px solid ${C.tBorder}`:'none'})}>
                          {d?(d.water!==null?fmt(d.water):'미청구'):'—'}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
              {/* Total */}
              <tr style={{ background:C.navyBg, borderTop:`2px solid ${C.navy}` }}>
                <td style={TD('left',{fontWeight:700,color:C.navyDark,borderRight:`2px solid ${C.tBorder}`})}>합 계</td>
                {months.map((m,mi)=>{
                  const e=monthEntries[mi];
                  const tk=e?tenants.reduce((s,t)=>s+(e.td[t.id].kwh||0),0):null;
                  const tw=e?tenants.reduce((s,t)=>{ const w=e.td[t.id].water; return w!==null?s+w:s; },0):null;
                  return (
                    <Fragment key={m}>
                      <td style={TD('right',{fontWeight:700,color:C.navy,borderLeft:`1px solid ${C.tBorder}`})}>{tk!==null?fmt(tk):'—'}</td>
                      <td style={TD('right',{fontWeight:700,color:C.blue,borderRight:mi<2?`2px solid ${C.tBorder}`:'none'})}>{tw!==null?fmt(tw):'—'}</td>
                    </Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Billing comparison */}
      <div style={CARD}>
        <SecHead icon="💰" title={`${selYear}년 ${selQ}분기 — 청구금액 비교 (VAT 포함)`} />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH('left',140), background:C.navyDark, color:'#fff' }}>층 / 업체</th>
                {months.map((m,mi)=>{
                  const e=monthEntries[mi];
                  return <th key={m} style={{ ...TH('right'), background:e?C.navy:C.tHead, color:e?'#fff':C.textHint, borderRight:mi<2?`2px solid ${C.tBorder}`:'none' }}>{selYear}년 {m}월</th>;
                })}
                <th style={{ ...TH('right'), background:C.navyDark, color:'#fff' }}>분기 합계</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t,ti)=>{
                const vals=months.map((m,mi)=>{ const e=monthEntries[mi]; return e?e.td[t.id].grandTotal:null; });
                const qt=vals.reduce((s,v)=>s+(v||0),0);
                return (
                  <tr key={t.id} style={{ background:ti%2===0?C.white:C.tAlt }}>
                    <td style={TD('left',{fontWeight:600,color:C.navy})}>
                      <span style={{ fontSize:11, background:C.navyBg, color:C.navyMid, borderRadius:6, padding:'1px 7px', marginRight:7 }}>{t.floor}</span>{t.name}
                    </td>
                    {vals.map((v,mi)=>(
                      <td key={mi} style={TD('right',{color:v?C.text:C.textHint, borderRight:mi<2?`2px solid ${C.tBorder}`:'none'})}>
                        {v?`${fmt(v)}원`:'—'}
                      </td>
                    ))}
                    <td style={TD('right',{fontWeight:700,color:C.navyDark})}>{qt>0?`${fmt(qt)}원`:'—'}</td>
                  </tr>
                );
              })}
              {/* 3사 합계 */}
              <tr style={{ background:C.navyBg, borderTop:`2px solid ${C.navy}` }}>
                <td style={TD('left',{fontWeight:700,color:C.navyDark})}>3사 합계</td>
                {months.map((m,mi)=>{
                  const e=monthEntries[mi];
                  const tot=e?tenants.reduce((s,t)=>s+e.td[t.id].grandTotal,0):null;
                  return <td key={m} style={TD('right',{fontWeight:700,color:tot?C.navy:C.textHint, borderRight:mi<2?`2px solid ${C.tBorder}`:'none'})}>{tot?`${fmt(tot)}원`:'—'}</td>;
                })}
                <td style={TD('right',{fontWeight:800,color:C.navyDark,fontSize:15})}>
                  {fmt(months.reduce((s,m,mi)=>{ const e=monthEntries[mi]; return e?s+tenants.reduce((ts,t)=>ts+e.td[t.id].grandTotal,0):s; },0))}원
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Empty quarter notice */}
        {monthEntries.every(e=>!e) && (
          <div style={{ textAlign:'center', color:C.textHint, fontSize:13, padding:'20px 0' }}>
            {selYear}년 {selQ}분기({qLabel[selQ]}) 저장된 데이터가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── History Page ─────────────────────────────────────────────
function HistoryPage({ history, onLoad, onUpdate }) {
  const [expanded, setExpanded] = useState(null);
  const [imgModal, setImgModal] = useState(null);
  const [uploading, setUploading] = useState({});

  const handleImgUpload=async(idx,type,e)=>{
    const file=e.target.files[0]; if(!file) return;
    setUploading(u=>({...u,[`${idx}-${type}`]:true}));
    const dataUrl=await compressImage(file);
    setUploading(u=>({...u,[`${idx}-${type}`]:false}));
    if(!dataUrl) return;
    const updated=history.map((h,i)=>i===idx?{...h,images:{...(h.images||{}),[type]:dataUrl}}:h);
    onUpdate?.(updated);
  };

  const deleteImg=(idx,type)=>{
    const updated=history.map((h,i)=>i===idx?{...h,images:{...(h.images||{}),[type]:null}}:h);
    onUpdate?.(updated);
  };

  if (!history.length) return <div style={{ ...CARD, padding:'3rem', textAlign:'center', color:C.textSub, fontSize:14 }}>저장된 히스토리가 없습니다.</div>;

  const elecFloors=[
    {key:'w1_220',label:'1층 웨지우드', mult:60},
    {key:'t2_220',label:'2층 태하무역 220V', mult:60},
    {key:'t2_380',label:'2층 태하무역 380V', mult:30},
    {key:'y3_220',label:'3층 유연어패럴 220V', mult:60},
    {key:'y3_380',label:'3층 유연어패럴 380V', mult:1},
    {key:'o4_220',label:'4층 사무실', mult:80},
  ];
  const waterFloors=[
    {key:'w1',label:'1층 웨지우드'},
    {key:'t2',label:'2층 태하무역'},
    {key:'y3',label:'3층 유연어패럴'},
    {key:'o4',label:'4층 사무실'},
  ];

  return (
    <div>
      <div style={{ fontSize:12.5, color:C.textSub, marginBottom:10 }}>
        · 행을 클릭하면 검침값 상세가 펼쳐집니다. &nbsp;· <strong>불러오기</strong>는 해당 월 데이터를 검침 입력 탭에 로드합니다.
      </div>
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', boxShadow:sh.card }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr>
            {[['청구월','left'],['적용 기간','left'],['전기 고지액','right',120],['수도 고지액','right',120],['첨부','center',50],['저장일','right',90],['','center',80]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}
          </tr></thead>
          <tbody>
            {history.map((h,i)=>{
              const isExp=expanded===i;
              const hasImg=h.images&&(h.images.elec||h.images.water);
              return (
                <Fragment key={i}>
                  <tr style={{ background:isExp?C.navyBg:(i%2===0?C.white:C.tAlt), cursor:'pointer' }} onClick={()=>setExpanded(isExp?null:i)}>
                    <td style={TD('left',{fontWeight:600,color:C.navy})}>
                      <span style={{ marginRight:6, fontSize:11, color:isExp?C.navyMid:C.textHint }}>{isExp?'▼':'▶'}</span>
                      {getBillingMonth(h.periodEnd)}
                      <span style={{ fontSize:11.5, color:C.textHint, fontWeight:400, marginLeft:6 }}>({getBillingNo(h.periodEnd)})</span>
                    </td>
                    <td style={TD('left',{color:C.textSub,fontSize:12})}>{h.periodStart} ~ {h.periodEnd}</td>
                    <td style={TD('right')}>
                      <span style={{ background:C.amberBg, color:C.amber, border:`1px solid ${C.amberBorder}`, borderRadius:20, padding:'2px 9px', fontSize:12, fontVariantNumeric:'tabular-nums' }}>
                        {fmt(h.elecBill?.totalAmount)}원
                      </span>
                    </td>
                    <td style={TD('right')}>
                      {h.waterCalc==='O'
                        ? <span style={{ background:C.blueBg, color:C.blue, border:`1px solid ${C.blueBorder}`, borderRadius:20, padding:'2px 9px', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{fmt(h.waterBill?.totalAmount)}원</span>
                        : <span style={{ background:C.tHead, color:C.textHint, borderRadius:20, padding:'2px 9px', fontSize:12 }}>미청구</span>}
                    </td>
                    <td style={TD('center')}>
                      {hasImg && (
                        <span title="고지서 이미지 있음" style={{ fontSize:16 }}>📎</span>
                      )}
                    </td>
                    <td style={TD('right',{color:C.textSub,fontSize:12})}>{new Date(h.savedAt).toLocaleDateString('ko-KR')}</td>
                    <td style={TD('center')} onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>onLoad(h)} style={{ ...btn('navyGhost'), height:28, padding:'0 12px', fontSize:12 }}>불러오기</button>
                    </td>
                  </tr>

                  {/* ── 펼침 상세 ── */}
                  {isExp && (
                    <tr>
                      <td colSpan={7} style={{ background:C.navyBg, padding:'16px 20px', borderBottom:`1px solid ${C.navyBg2}` }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                          {/* 전기 검침 */}
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.navyDark, marginBottom:8 }}>⚡ 전기 검침값</div>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                              <thead><tr>
                                {[['계량기','left'],['전월','right'],['금월','right'],['환산kWh','right']].map(([lbl,a])=>(
                                  <th key={lbl} style={{ ...TH(a), background:C.navy, color:'#fff', fontSize:11, padding:'6px 8px' }}>{lbl}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {elecFloors.map((f,fi)=>{
                                  const r=h.elec?.[f.key];
                                  if(!r) return null;
                                  const diff=(r.curr||0)-(r.prev||0);
                                  return (
                                    <tr key={f.key} style={{ background:fi%2===0?C.white:C.tAlt }}>
                                      <td style={{ padding:'5px 8px', color:C.textMid }}>{f.label}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.prev)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.curr)}</td>
                                      <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600, color:C.amber, fontVariantNumeric:'tabular-nums' }}>{fmt(diff*f.mult)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {/* 전기 고지서 금액 */}
                            {h.elecBill && (
                              <div style={{ marginTop:8, padding:'8px 10px', background:C.white, borderRadius:8, fontSize:11.5, color:C.textMid, display:'flex', flexWrap:'wrap', gap:'6px 16px' }}>
                                <span>기본요금 <b>{fmt(h.elecBill.basicFee)}</b>원</span>
                                <span>전력기금 <b>{fmt(h.elecBill.powerFund)}</b>원</span>
                                <span>고지총액 <b style={{ color:C.amber }}>{fmt(h.elecBill.totalAmount)}</b>원</span>
                                <span>부가세 <b>{fmt(h.elecBill.vat)}</b>원</span>
                                <span>안전대행료 <b>{fmt(h.elecBill.safetyFee)}</b>원</span>
                              </div>
                            )}
                          </div>

                          {/* 수도 검침 */}
                          <div>
                            <div style={{ fontSize:12, fontWeight:700, color:C.navyDark, marginBottom:8 }}>💧 수도 검침값</div>
                            {h.waterCalc==='O' ? (
                              <>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                                  <thead><tr>
                                    {[['층/업체','left'],['전월','right'],['금월','right'],['사용(m³)','right']].map(([lbl,a])=>(
                                      <th key={lbl} style={{ ...TH(a), background:C.blue, color:'#fff', fontSize:11, padding:'6px 8px' }}>{lbl}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {waterFloors.map((f,fi)=>{
                                      const r=h.water?.[f.key];
                                      if(!r) return null;
                                      return (
                                        <tr key={f.key} style={{ background:fi%2===0?C.white:C.tAlt }}>
                                          <td style={{ padding:'5px 8px', color:C.textMid }}>{f.label}</td>
                                          <td style={{ padding:'5px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.prev)}</td>
                                          <td style={{ padding:'5px 8px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{fmt(r.curr)}</td>
                                          <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:600, color:C.blue, fontVariantNumeric:'tabular-nums' }}>{fmt((r.curr||0)-(r.prev||0))}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {h.waterBill && (
                                  <div style={{ marginTop:8, padding:'8px 10px', background:C.white, borderRadius:8, fontSize:11.5, color:C.textMid, display:'flex', gap:16 }}>
                                    <span>고지총액 <b style={{ color:C.blue }}>{fmt(h.waterBill.totalAmount)}</b>원</span>
                                    <span>기본요금 <b>{fmt(h.waterBill.basicFee)}</b>원</span>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ color:C.textHint, fontSize:12, padding:'8px 0' }}>해당 월 수도 미청구</div>
                            )}

                            {/* 고지서 이미지 (업로드/보기/삭제) */}
                            <div style={{ marginTop:12 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:C.navyDark, marginBottom:6 }}>📎 고지서 이미지</div>
                              <div style={{ display:'flex', gap:8 }}>
                                {(['elec','water']).map(type=>{
                                  const img=h.images?.[type];
                                  const label=type==='elec'?'전기 고지서':'수도 고지서';
                                  const isUploading=uploading[`${i}-${type}`];
                                  return (
                                    <div key={type} style={{ flex:1 }}>
                                      <div style={{ fontSize:11, color:C.textSub, marginBottom:3 }}>{label}</div>
                                      {img ? (
                                        <div style={{ position:'relative' }}>
                                          <img src={img} alt={label}
                                            style={{ width:'100%', height:80, objectFit:'cover', borderRadius:6, border:`1px solid ${C.border}`, cursor:'zoom-in', display:'block' }}
                                            onClick={()=>setImgModal(img)} />
                                          <button onClick={()=>deleteImg(i,type)}
                                            style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', borderRadius:'50%', width:20, height:20, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                                        </div>
                                      ) : (
                                        <label style={{ display:'flex', alignItems:'center', justifyContent:'center', height:80, border:`2px dashed ${C.border}`, borderRadius:6, cursor:isUploading?'wait':'pointer', background:C.tHead, fontSize:11, color:C.textHint, flexDirection:'column', gap:4 }}>
                                          {isUploading ? '업로드 중…' : <><span style={{ fontSize:18 }}>+</span><span>이미지 추가</span></>}
                                          <input type="file" accept="image/*" style={{ display:'none' }} disabled={isUploading} onChange={e=>handleImgUpload(i,type,e)} />
                                        </label>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 이미지 모달 */}
      {imgModal && (
        <div onClick={()=>setImgModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={imgModal} alt="고지서 원본" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8, boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()} />
          <button onClick={()=>setImgModal(null)} style={{ position:'fixed', top:18, right:22, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:'50%', width:36, height:36, fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── Tenant Page ──────────────────────────────────────────────
function TenantPage({ tenants, setTenants }) {
  const [local,setLocal]=useState(()=>tenants.map(t=>({...t})));
  const [editing,setEditing]=useState(null);
  const [msg,setMsg]=useState('');

  const upField=(id,field,val)=>setLocal(prev=>prev.map(t=>t.id===id?{...t,[field]:['deposit','rent','area','mgmtArea','elevator'].includes(field)?Number(val)||0:val}:t));

  const save=()=>{
    setTenants(local);
    setEditing(null);
    setMsg('저장됐습니다.'); setTimeout(()=>setMsg(''),2500);
  };

  const cancelEdit=()=>{ setLocal(tenants.map(t=>({...t}))); setEditing(null); };

  const floorGrad=['linear-gradient(135deg,#4f46e5,#6366f1)','linear-gradient(135deg,#0284c7,#38bdf8)','linear-gradient(135deg,#7c3aed,#a78bfa)'];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <div style={{ fontSize:15, fontWeight:700, color:C.navyDark }}>임차인 현황</div>
        {msg && <span style={{ fontSize:12.5, color:C.green, fontWeight:600 }}>✓ {msg}</span>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16, marginBottom:16 }}>
        {local.map((t,i)=>{
          const isEdit=editing===t.id;
          const d=getDday(t.contractEnd);
          let warnBg=C.greenBg, warnColor=C.green, warnBrd=C.greenBorder, warnText='계약 유효';
          if(d===null){ warnBg=C.tHead; warnColor=C.textSub; warnBrd=C.tBorder; warnText='기간 미설정'; }
          else if(d<0){ warnBg=C.redBg; warnColor=C.red; warnBrd=C.redBorder; warnText='⚠ 계약 만료됨'; }
          else if(d<=30){ warnBg=C.redBg; warnColor=C.red; warnBrd=C.redBorder; warnText='⚠ 만료 임박'; }
          else if(d<=60){ warnBg=C.orangeBg; warnColor=C.orange; warnBrd=C.orangeBorder; warnText='만료 예정'; }

          return (
            <div key={t.id} style={{ background:C.white, borderRadius:16, overflow:'hidden', border:`1px solid ${C.border}`, boxShadow:sh.card }}>
              <div style={{ background:floorGrad[i], padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
                  <span style={{ background:'rgba(255,255,255,0.22)', color:'#fff', borderRadius:8, padding:'3px 9px', fontSize:11.5, fontWeight:700, flexShrink:0 }}>{t.floor}</span>
                  <span style={{ color:'#fff', fontWeight:700, fontSize:13.5, letterSpacing:'-0.3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.fullName}</span>
                </div>
                <div style={{ flexShrink:0 }}><DdayBadge dateStr={t.contractEnd} /></div>
              </div>

              <div style={{ padding:'18px 20px' }}>
                {isEdit ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {[['보증금(원)','deposit'],['월차임(원)','rent'],['면적(㎡)','area']].map(([label,field])=>(
                      <div key={field} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:12, color:C.textSub, minWidth:72, flexShrink:0 }}>{label}</span>
                        <input type="number" value={t[field]||''} onChange={e=>upField(t.id,field,e.target.value)} style={{ ...baseInput, flex:1, textAlign:'right', fontVariantNumeric:'tabular-nums' }} />
                      </div>
                    ))}
                    {[['계약시작','contractStart'],['계약종료','contractEnd']].map(([label,field])=>(
                      <div key={field} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:12, color:C.textSub, minWidth:72, flexShrink:0 }}>{label}</span>
                        <input type="date" value={t[field]||''} onChange={e=>upField(t.id,field,e.target.value)} style={{ ...baseInput, flex:1 }} />
                      </div>
                    ))}
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      <button onClick={save} style={btn('primary')}>저장</button>
                      <button onClick={cancelEdit} style={btn('ghost')}>취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                      {[['보증금',`${fmt(t.deposit)}원`],['월차임',`${fmt(t.rent)}원`],['면적',t.area?`${Number(t.area).toLocaleString()}㎡`:'미설정']].map(([label,value])=>(
                        <div key={label}>
                          <div style={{ fontSize:11, color:C.textHint, marginBottom:3 }}>{label}</div>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text, fontVariantNumeric:'tabular-nums' }}>{value}</div>
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize:11, color:C.textHint, marginBottom:3 }}>계약기간</div>
                        <div style={{ fontSize:11.5, fontWeight:500, color:C.textMid, lineHeight:1.5 }}>
                          {t.contractStart&&t.contractEnd?`${t.contractStart}\n~ ${t.contractEnd}`:t.contractEnd?`~ ${t.contractEnd}`:'미설정'}
                        </div>
                      </div>
                    </div>

                    <div style={{ background:warnBg, border:`1px solid ${warnBrd}`, borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                      <span style={{ fontSize:12, color:warnColor, fontWeight:600 }}>{warnText}</span>
                      <DdayBadge dateStr={t.contractEnd} />
                    </div>

                    <button onClick={()=>setEditing(t.id)} style={{ ...btn('secondary'), width:'100%', justifyContent:'center' }}>✏ 수정</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={CARD}>
        <SecHead icon="📊" title="전체 임차 현황 요약" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
          {[
            ['총 보증금',`${fmt(local.reduce((s,t)=>s+(t.deposit||0),0))}원`],
            ['월 임대료 합계',`${fmt(local.reduce((s,t)=>s+(t.rent||0),0))}원`],
            ['연 임대료 합계',`${fmt(local.reduce((s,t)=>s+(t.rent||0),0)*12)}원`],
          ].map(([label,value])=>(
            <div key={label} style={{ textAlign:'center', padding:'14px 12px', background:C.navyBg, borderRadius:12 }}>
              <div style={{ fontSize:11, color:C.textSub, marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:15, fontWeight:800, color:C.navyDark, fontVariantNumeric:'tabular-nums' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Finance Page ─────────────────────────────────────────────
function FinancePage() {
  const now=new Date();
  const [month,setMonth]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [accounts,setAccounts]=useState(()=>store.get('tl_finance_accounts')||INITIAL_ACCOUNTS);
  const [txnData,setTxnData]=useState(()=>store.get('tl_finance_txns')||{});

  const ymData=txnData[month]||{opening:0,rows:[]};
  const setYmData=(next)=>{ const nd={...txnData,[month]:next}; setTxnData(nd); store.set('tl_finance_txns',nd); };

  const upAcct=(key,field,val)=>{
    const next={...accounts,[key]:{...accounts[key],[field]:Number(val)||0}};
    setAccounts(next); store.set('tl_finance_accounts',next);
  };

  const computedRows=(()=>{
    let bal=ymData.opening||0;
    return (ymData.rows||[]).map(row=>{ bal+=(row.income||0)-(row.expense||0); return {...row,balance:bal}; });
  })();

  const acctKeys=Object.keys(accounts);
  const totalPrev=acctKeys.reduce((s,k)=>s+(accounts[k].prev||0),0);
  const totalCurr=acctKeys.reduce((s,k)=>s+(accounts[k].curr||0),0);

  const addRow=()=>setYmData({...ymData,rows:[...(ymData.rows||[]),{id:Date.now(),no:String((ymData.rows||[]).length+1).padStart(3,'0'),date:`${month}-01`,desc:'',income:0,expense:0}]});
  const delRow=(id)=>setYmData({...ymData,rows:ymData.rows.filter(r=>r.id!==id)});
  const upRow=(id,field,val)=>setYmData({...ymData,rows:ymData.rows.map(r=>r.id===id?{...r,[field]:['income','expense'].includes(field)?Number(val)||0:val}:r)});

  const shiftMonth=(delta)=>{ const [y,m]=month.split('-').map(Number); const d=new Date(y,m-1+delta,1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };
  const [yy,mm]=month.split('-');
  const monthLabel=`${yy}년 ${Number(mm)}월`;

  const inlineInputStyle=(color)=>({ ...baseInput, background:'transparent', border:'1px solid transparent', padding:'3px 5px', borderRadius:6, textAlign:color?'right':'left', color:color||C.text, fontVariantNumeric:color?'tabular-nums':'normal', transition:'border-color 0.15s' });

  return (
    <div>
      {/* Account Summary */}
      <div style={CARD}>
        <SecHead icon="🏦" title="예금·잔고 현황" action={<span style={{ fontSize:11.5, color:C.textHint }}>셀 클릭하여 수정</span>} />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {[['계정','left',120],['전월 잔고','right'],['현재 잔고','right'],['증감','right',120]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {acctKeys.map((key,i)=>{
                const a=accounts[key];
                const diff=(a.curr||0)-(a.prev||0);
                return (
                  <tr key={key} style={{ background:i%2===0?C.white:C.tAlt }}>
                    <td style={TD('left',{fontWeight:600,color:C.navy})}>{a.label}</td>
                    <td style={TD('right')}>
                      <input type="number" value={a.prev||''} onChange={e=>upAcct(key,'prev',e.target.value)}
                        style={{ ...inlineInputStyle(C.textMid), width:'100%' }}
                        onFocus={e=>(e.target.style.borderColor=C.navyBg2)}
                        onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('right')}>
                      <input type="number" value={a.curr||''} onChange={e=>upAcct(key,'curr',e.target.value)}
                        style={{ ...inlineInputStyle(C.navyDark), width:'100%', fontWeight:600 }}
                        onFocus={e=>(e.target.style.borderColor=C.navyBg2)}
                        onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('right',{fontWeight:600,color:diff>=0?C.blue:C.red})}>{diff>=0?'+':''}{fmt(diff)}</td>
                  </tr>
                );
              })}
              <tr style={{ background:C.navyBg, borderTop:`2px solid ${C.navyBg2}` }}>
                <td style={TD('left',{fontWeight:800,color:C.navyDark,fontSize:14})}>합 계</td>
                <td style={TD('right',{fontWeight:600,color:C.navyDark})}>{fmt(totalPrev)}</td>
                <td style={TD('right',{fontWeight:800,color:C.navyDark,fontSize:16})}>{fmt(totalCurr)}</td>
                <td style={TD('right',{fontWeight:700,color:(totalCurr-totalPrev)>=0?C.blue:C.red,fontSize:14})}>{(totalCurr-totalPrev)>=0?'+':''}{fmt(totalCurr-totalPrev)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Ledger */}
      <div style={CARD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, paddingBottom:14, borderBottom:`1px solid ${C.tBorder}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:C.navyBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>📋</div>
            <span style={{ fontSize:14, fontWeight:600, color:C.navy }}>입출금 내역</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={()=>shiftMonth(-1)} style={{ ...btn('secondary'), padding:'0 12px', height:30, borderRadius:20 }}>←</button>
            <span style={{ fontSize:14, fontWeight:700, color:C.navyDark, minWidth:100, textAlign:'center' }}>{monthLabel}</span>
            <button onClick={()=>shiftMonth(1)}  style={{ ...btn('secondary'), padding:'0 12px', height:30, borderRadius:20 }}>→</button>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, padding:'10px 14px', background:C.navyBg, borderRadius:12 }}>
          <span style={{ fontSize:13, fontWeight:600, color:C.navyDark, whiteSpace:'nowrap' }}>이월잔액</span>
          <input type="number" value={ymData.opening||''} onChange={e=>setYmData({...ymData,opening:Number(e.target.value)||0})}
            style={{ ...baseInput, maxWidth:200, textAlign:'right', fontVariantNumeric:'tabular-nums' }} />
          <span style={{ fontSize:12, color:C.textSub }}>원</span>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {[['전표번호','left',90],['날짜','left',120],['적요','left'],['입금','right',130],['출금','right',130],['잔액','right',130],['','center',36]].map(([h,a,w])=><th key={h+a} style={TH(a,w)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {computedRows.length===0 && (
                <tr><td colSpan={7} style={{ ...TD('center'), color:C.textHint, padding:'32px', fontSize:13 }}>내역이 없습니다. 아래 버튼으로 추가하세요.</td></tr>
              )}
              {computedRows.map((row,idx)=>(
                <tr key={row.id} style={{ background:idx%2===0?C.white:C.tAlt }}>
                  <td style={TD('left')}>
                    <input value={row.no||''} onChange={e=>upRow(row.id,'no',e.target.value)} style={{ ...inlineInputStyle(), width:70, fontSize:12 }} onFocus={e=>(e.target.style.borderColor=C.navyBg2)} onBlur={e=>(e.target.style.borderColor='transparent')} />
                  </td>
                  <td style={TD('left')}>
                    <input type="date" value={row.date||''} onChange={e=>upRow(row.id,'date',e.target.value)} style={{ ...inlineInputStyle(), fontSize:12 }} onFocus={e=>(e.target.style.borderColor=C.navyBg2)} onBlur={e=>(e.target.style.borderColor='transparent')} />
                  </td>
                  <td style={TD('left')}>
                    <input value={row.desc||''} onChange={e=>upRow(row.id,'desc',e.target.value)} placeholder="적요" style={{ ...inlineInputStyle(), minWidth:120 }} onFocus={e=>(e.target.style.borderColor=C.navyBg2)} onBlur={e=>(e.target.style.borderColor='transparent')} />
                  </td>
                  <td style={TD('right')}>
                    <input type="number" value={row.income||''} onChange={e=>upRow(row.id,'income',e.target.value)} style={{ ...inlineInputStyle(row.income?C.blue:C.textHint), width:'100%' }} onFocus={e=>(e.target.style.borderColor=C.navyBg2)} onBlur={e=>(e.target.style.borderColor='transparent')} />
                  </td>
                  <td style={TD('right')}>
                    <input type="number" value={row.expense||''} onChange={e=>upRow(row.id,'expense',e.target.value)} style={{ ...inlineInputStyle(row.expense?C.red:C.textHint), width:'100%' }} onFocus={e=>(e.target.style.borderColor=C.navyBg2)} onBlur={e=>(e.target.style.borderColor='transparent')} />
                  </td>
                  <td style={TD('right',{fontWeight:700,color:row.balance>=0?C.text:C.red})}>{fmt(row.balance)}</td>
                  <td style={TD('center')}>
                    <button onClick={()=>delRow(row.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textHint, fontSize:18, lineHeight:1, padding:'0 4px' }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:14, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <button onClick={addRow} style={btn('navyGhost')}>+ 행 추가</button>
          {computedRows.length>0 && (
            <div style={{ fontSize:13, color:C.textSub, display:'flex', gap:16 }}>
              <span>입금 합계 <span style={{ fontWeight:700, color:C.blue }}>{fmt((ymData.rows||[]).reduce((s,r)=>s+(r.income||0),0))}원</span></span>
              <span>출금 합계 <span style={{ fontWeight:700, color:C.red }}>{fmt((ymData.rows||[]).reduce((s,r)=>s+(r.expense||0),0))}원</span></span>
              <span>최종잔액 <span style={{ fontWeight:800, color:C.navyDark }}>{fmt(computedRows.at(-1)?.balance||0)}원</span></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Notice Page ──────────────────────────────────────────────
function NoticePage() {
  const today=new Date().toISOString().split('T')[0];
  const nowY=new Date().getFullYear();
  const [no,setNo]=useState(`태전 ${nowY}-001 호`);
  const [date,setDate]=useState(today);
  const [to,setTo]=useState('');
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [signer,setSigner]=useState('대 표 이 사');

  const dateLabel=(ds)=>{ const d=new Date(ds); if(isNaN(d)) return ds; return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`; };

  const handlePrint=(bw)=>{
    const hBg=bw?'#111':'#312e81';
    const mBrd=bw?'#999':'#c7d2fe';
    const bodyHtml=body.split('\n').map(l=>`<p style="margin:0 0 8px;">${l||'&nbsp;'}</p>`).join('');
    const html=`<!DOCTYPE html><html lang="ko" style="-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;"><head><meta charset="UTF-8"><style>html,body,*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important;}
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:13px;background:#fff;color:#111;}
.page{max-width:700px;margin:24px auto;}
.hdr{background:${hBg};color:#fff;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;${bw?'border:2px solid #111;':'border-radius:8px 8px 0 0;'}}
.hdr-co{font-size:17px;font-weight:800;letter-spacing:5px;}
.hdr-addr{font-size:10px;opacity:0.65;margin-top:5px;letter-spacing:0.3px;}
.hdr-doctype{font-size:28px;font-weight:800;letter-spacing:14px;opacity:0.95;}
.meta{border:${bw?'2px solid #111;border-top:none':'1px solid '+mBrd+';border-top:none'};}
.meta table{width:100%;border-collapse:collapse;}
.meta th{background:${bw?'#eee':'#eef2ff'};padding:11px 16px;font-size:12px;font-weight:700;text-align:left;border-bottom:1px solid ${mBrd};border-right:1px solid ${mBrd};width:76px;white-space:nowrap;color:${bw?'#333':'#312e81'};}
.meta td{padding:11px 16px;font-size:13px;border-bottom:1px solid ${mBrd};}
.body-area{border:${bw?'2px solid #111;border-top:none':'1px solid '+mBrd+';border-top:none'};padding:36px 32px;min-height:340px;line-height:2.1;font-size:13.5px;}
.sig{border-top:1px solid ${mBrd};padding:24px 32px 32px;text-align:right;${bw?'border:2px solid #111;border-top:none':''};}
.sig-date{font-size:13px;color:#555;margin-bottom:20px;}
.sig-co{font-size:19px;font-weight:800;letter-spacing:10px;color:${bw?'#111':hBg};margin-bottom:10px;}
.sig-name{font-size:14px;letter-spacing:6px;color:#333;}
</style></head><body style="-webkit-print-color-adjust:exact;print-color-adjust:exact;"><div class="page">
<div class="hdr">
  <div><div class="hdr-co">태 림 전 자 공 업 주 식 회 사</div><div class="hdr-addr">${CO_ADDR}&nbsp;&nbsp;&nbsp;Tel:${CO_TEL}&nbsp;&nbsp;Fax:${CO_FAX}</div></div>
  <div class="hdr-doctype">공&nbsp;&nbsp;문</div>
</div>
<div class="meta"><table>
  <tr><th>문서번호</th><td>${no}</td><th style="border-left:1px solid ${mBrd}">시행일자</th><td>${date}</td></tr>
  <tr><th>수&nbsp;&nbsp;&nbsp;&nbsp;신</th><td colspan="3">${to||'&nbsp;'}</td></tr>
  <tr><th>제&nbsp;&nbsp;&nbsp;&nbsp;목</th><td colspan="3" style="font-weight:700;">${title||'&nbsp;'}</td></tr>
</table></div>
<div class="body-area">${bodyHtml}</div>
<div class="sig">
  <div class="sig-date">${dateLabel(date)}</div>
  <div class="sig-co">태 림 전 자 공 업 주 식 회 사</div>
  <div class="sig-name">${signer}&nbsp;&nbsp;&nbsp;박&nbsp;형&nbsp;준&nbsp;&nbsp;㊞</div>
</div>
</div><script>window.onload=()=>window.print();</script></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){alert('팝업이 차단되어 있습니다.\n브라우저에서 팝업을 허용해주세요.'); return;}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };

  const FL=({children})=><div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>{children}</div>;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>
      {/* Form */}
      <div style={CARD}>
        <SecHead icon="📄" title="공문 작성" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div><FL>문서번호</FL><input value={no} onChange={e=>setNo(e.target.value)} style={{ ...baseInput, background:C.white }} /></div>
          <div><FL>시행일자</FL><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ ...baseInput, background:C.white }} /></div>
        </div>
        <div style={{ marginBottom:12 }}><FL>수신</FL><input value={to} onChange={e=>setTo(e.target.value)} placeholder="예) 한국웨지우드마케팅㈜ 귀중" style={{ ...baseInput, background:C.white }} /></div>
        <div style={{ marginBottom:12 }}><FL>제목</FL><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="공문 제목을 입력하세요" style={{ ...baseInput, background:C.white }} /></div>
        <div style={{ marginBottom:12 }}><FL>서명자 직책</FL><input value={signer} onChange={e=>setSigner(e.target.value)} style={{ ...baseInput, background:C.white }} /></div>
        <div style={{ marginBottom:16 }}>
          <FL>본문</FL>
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={13} placeholder="공문 내용을 입력하세요." style={{ ...baseInput, background:C.white, resize:'vertical', lineHeight:1.9, fontFamily:"'Malgun Gothic','맑은 고딕',monospace" }} />
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>handlePrint(false)} style={btn('primary')}>🎨 컬러 PDF 출력</button>
          <button onClick={()=>handlePrint(true)}  style={btn('secondary')}>⬜ 흑백 PDF 출력</button>
        </div>
      </div>

      {/* Preview */}
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:16, overflow:'hidden', boxShadow:sh.card }}>
        {/* Preview header */}
        <div style={{ background:`linear-gradient(135deg,${C.navyDark},${C.navyMid})`, color:'#fff', padding:'16px 22px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:13.5, letterSpacing:4 }}>태 림 전 자 공 업 주 식 회 사</div>
            <div style={{ fontSize:10, opacity:0.6, marginTop:4 }}>{CO_ADDR} · Tel:{CO_TEL} · Fax:{CO_FAX}</div>
          </div>
          <div style={{ fontSize:18, fontWeight:800, letterSpacing:8, opacity:0.9 }}>공 문</div>
        </div>

        {/* Meta */}
        {[
          [`문서번호: ${no||'—'}`,`시행일자: ${date||'—'}`],
          [`수  신: ${to||'(수신 입력)'}`],
          [`제  목: ${title||'(제목 입력)'}`],
        ].map((row,i)=>(
          <div key={i} style={{ display:'flex', padding:'9px 20px', fontSize:12.5, background:i%2===0?C.white:C.navyBg, borderBottom:`1px solid ${C.navyBg2}` }}>
            {row.map((cell,j)=>(
              <span key={j} style={{ flex:1, color:cell.startsWith('제')?C.navyDark:C.textMid, fontWeight:cell.startsWith('제')?700:400 }}>{cell}</span>
            ))}
          </div>
        ))}

        {/* Body */}
        <div style={{ padding:'22px 20px', minHeight:200, lineHeight:2, fontSize:13, color:body?C.text:C.textHint, whiteSpace:'pre-wrap', wordBreak:'keep-all' }}>
          {body||'본문이 여기에 표시됩니다.'}
        </div>

        {/* Signature */}
        <div style={{ borderTop:`1px solid ${C.border}`, padding:'16px 20px 22px', textAlign:'right', background:C.borderLight }}>
          <div style={{ fontSize:12, color:C.textSub, marginBottom:10 }}>{dateLabel(date)}</div>
          <div style={{ fontSize:15, fontWeight:800, letterSpacing:5, color:C.navyDark, marginBottom:6 }}>태 림 전 자 공 업 주 식 회 사</div>
          <div style={{ fontSize:13, letterSpacing:3, color:C.textMid }}>{signer}&nbsp;&nbsp;박&nbsp;형&nbsp;준&nbsp;&nbsp;㊞</div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────
function SettingsPage({ savedPassword, setSavedPassword, tenants, setTenants, reading }) {
  const [pw1,setPw1]=useState(''); const [pw2,setPw2]=useState(''); const [pwMsg,setPwMsg]=useState('');
  const [lt,setLt]=useState(tenants); const [tenantMsg,setTenantMsg]=useState('');
  const [apiKey,setApiKey]=useState(()=>store.get('tl_anthropic_key')||'');
  const [apiKeyMsg,setApiKeyMsg]=useState('');
  const [toEmail,setToEmail]=useState(()=>tenants.filter(t=>t.email).map(t=>t.email).join(', '));
  // 공과금 보관함
  const [billDocs,setBillDocs]=useState(()=>store.get('tl_bill_docs')||{});
  const [docMonth,setDocMonth]=useState(()=>{ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; });
  const [docType,setDocType]=useState('elec');
  const [docModal,setDocModal]=useState(null);
  const docFileRef=useRef(null);

  const handleDocUpload=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const dataUrl=await compressImage(file); if(!dataUrl) return;
    const next={...billDocs,[docMonth]:{...(billDocs[docMonth]||{}),[docType]:dataUrl}};
    setBillDocs(next); store.set('tl_bill_docs',next);
  };
  const removeDoc=(month,type)=>{
    const next={...billDocs,[month]:{...(billDocs[month]||{}),[type]:null}};
    setBillDocs(next); store.set('tl_bill_docs',next);
  };
  const [emailSubject,setEmailSubject]=useState('');
  const [emailBody,setEmailBody]=useState('');
  const [emailMsg,setEmailMsg]=useState('');

  const changePw=()=>{
    if(!pw1){ setPwMsg('새 비밀번호를 입력하세요.'); return; }
    if(pw1!==pw2){ setPwMsg('비밀번호가 일치하지 않습니다.'); return; }
    setSavedPassword(pw1); setPw1(''); setPw2('');
    setPwMsg('✓ 변경됐습니다.'); setTimeout(()=>setPwMsg(''),3000);
  };
  const upT=(i,f,v)=>setLt(lt.map((t,idx)=>idx===i?{...t,[f]:['name','fullName','email'].includes(f)?v:Number(v)}:t));
  const saveTenants=()=>{ setTenants(lt); setTenantMsg('✓ 저장됐습니다.'); setTimeout(()=>setTenantMsg(''),3000); };

  const genTemplate=()=>{
    const calc=calcAll(reading);
    const billingMonth=getBillingMonth(reading.periodEnd);
    const billingNo=getBillingNo(reading.periodEnd);
    setEmailSubject(`[태림전자공업] ${billingMonth} 임대료 및 관리비 청구서`);
    const lines=lt.map(t=>{
      const fk=t.id==='wedgwood'?'w1':t.id==='taeha'?'t2':'y3';
      const ef=calc.floorElec[fk]||0;
      const wf=reading.waterCalc==='O'?(calc.waterCharges[fk]||0):0;
      const mt=ef+wf+(t.mgmtFee!=null?t.mgmtFee:t.mgmtArea*2500)+(t.elevator||0);
      const mv=Math.round(mt*0.1); const rv=Math.round(t.rent*0.1);
      return `[${t.floor} ${t.fullName}]\n  임대료: ${fmt(t.rent)}원 (부가세 ${fmt(rv)}원)\n  관리비: ${fmt(mt)}원 (부가세 ${fmt(mv)}원)\n  합 계: ${fmt(t.rent+rv+mt+mv)}원`;
    }).join('\n\n');
    setEmailBody(`안녕하세요. 태림전자공업㈜입니다.\n\n${billingMonth} 임대료 및 관리비 청구서를 보내드립니다.\n첨부 파일을 확인하시고 지정 기일 내 납부 부탁드립니다.\n\n■ 청구번호: ${billingNo}\n■ 청구월: ${billingMonth}\n■ 적용기간: ${reading.periodStart} ~ ${reading.periodEnd}\n\n${lines}\n\n감사합니다.\n\n태림전자공업㈜\n${CO_ADDR}\nTel: ${CO_TEL} / Fax: ${CO_FAX}`);
    // 이메일 수신자 자동 채우기
    const emails=lt.filter(t=>t.email).map(t=>t.email).join(', ');
    if(emails) setToEmail(emails);
  };

  const handleSend=()=>{
    const addrs=toEmail.split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
    if(!addrs.length){ setEmailMsg('수신자 이메일을 입력해주세요.'); setTimeout(()=>setEmailMsg(''),3000); return; }
    const unique=[...new Set(addrs)].join(',');
    const to=encodeURIComponent(unique);
    const su=encodeURIComponent(emailSubject);
    const body2=encodeURIComponent(emailBody);
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${su}&body=${body2}`,'_blank');
  };

  const FL=({text})=><div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>{text}</div>;

  return (
    <div>
      <div style={CARD}>
        <SecHead icon="🤖" title="Anthropic API 키 (고지서 이미지 자동 인식)" />
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:6 }}>
          <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
            placeholder="sk-ant-api03-..." style={{ ...baseInput, background:C.white, flex:1, fontFamily:'monospace', fontSize:12 }} />
          <button onClick={()=>{ store.set('tl_anthropic_key',apiKey); setApiKeyMsg('✓ 저장됐습니다.'); setTimeout(()=>setApiKeyMsg(''),2500); }}
            style={btn('primary')}>저장</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {apiKeyMsg && <span style={{ fontSize:12.5, color:C.green }}>{apiKeyMsg}</span>}
          <span style={{ fontSize:11.5, color:C.textHint }}>검침 입력 탭의 "📸 이미지 자동 인식" 기능에서 사용됩니다. 키는 이 기기에만 저장됩니다.</span>
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="🔐" title="비밀번호 변경" />
        <div style={{ maxWidth:400 }}>
          {[['새 비밀번호',pw1,setPw1],['비밀번호 확인',pw2,setPw2]].map(([lbl,val,set])=>(
            <div key={lbl} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
              <div style={{ fontSize:12.5, color:C.textSub, minWidth:100 }}>{lbl}</div>
              <input type="password" value={val} onChange={e=>set(e.target.value)} style={{ ...baseInput, background:C.white, flex:1 }} />
            </div>
          ))}
          <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:4 }}>
            <button onClick={changePw} style={btn('primary')}>변경</button>
            {pwMsg && <span style={{ fontSize:12.5, color:pwMsg.includes('✓')?C.green:C.red }}>{pwMsg}</span>}
          </div>
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="🏢" title="임차인 설정 (청구용)" />
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
          <thead><tr>{['층','임차인','임대료(원)','관리비 평수','승강기(원)','이메일'].map((h,i)=><th key={h} style={TH(i<2?'left':'right')}>{h}</th>)}</tr></thead>
          <tbody>
            {lt.map((t,i)=>(
              <tr key={t.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                <td style={TD('left',{fontWeight:500,color:C.navy,width:60})}>{t.floor}</td>
                <td style={TD('left',{fontWeight:500,width:120})}>{t.name}</td>
                <td style={TD('right',{width:140})}><NumInput value={t.rent} onChange={v=>upT(i,'rent',v)} /></td>
                <td style={TD('right',{width:110})}><NumInput value={t.mgmtArea} onChange={v=>upT(i,'mgmtArea',v)} /></td>
                <td style={TD('right',{width:130})}><NumInput value={t.elevator} onChange={v=>upT(i,'elevator',v)} /></td>
                <td style={TD('left')}><input type="email" value={t.email||''} onChange={e=>upT(i,'email',e.target.value)} placeholder="example@email.com" style={{ ...baseInput, background:C.white }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button onClick={saveTenants} style={btn('success')}>저장</button>
          {tenantMsg && <span style={{ fontSize:12.5, color:C.green }}>{tenantMsg}</span>}
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="📧" title="이메일 발송" />

        {/* 수신자 */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <FL text="수신자 이메일" />
            <span style={{ fontSize:11, color:C.textHint }}>여러 명: 쉼표로 구분</span>
          </div>
          <input type="text" value={toEmail} onChange={e=>setToEmail(e.target.value)}
            placeholder="hong@example.com, kim@example.com"
            style={{ ...baseInput, background:C.white }} />
          {/* 이메일 등록된 임차인 빠른 선택 */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
            {lt.filter(t=>t.email).map(t=>(
              <button key={t.id} onClick={()=>{
                const cur=toEmail.split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
                if(!cur.includes(t.email)) setToEmail([...cur,t.email].join(', '));
              }} style={{ ...btn('secondary'), height:26, padding:'0 10px', fontSize:11.5 }}>
                + {t.floor} {t.name}
              </button>
            ))}
            {lt.some(t=>t.email) && (
              <button onClick={()=>setToEmail(lt.filter(t=>t.email).map(t=>t.email).join(', '))}
                style={{ ...btn('navyGhost'), height:26, padding:'0 10px', fontSize:11.5 }}>전체</button>
            )}
          </div>
        </div>

        {/* 제목 */}
        <div style={{ marginBottom:12 }}>
          <FL text="제목" />
          <input type="text" value={emailSubject} onChange={e=>setEmailSubject(e.target.value)}
            placeholder="이메일 제목" style={{ ...baseInput, background:C.white }} />
        </div>

        {/* 본문 */}
        <div style={{ marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <FL text={`본문 (${emailBody.length}자)`} />
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={genTemplate} style={{ ...btn('amber'), height:28, padding:'0 12px', fontSize:12 }}>⚡ 청구서 템플릿 자동 생성</button>
              <button onClick={()=>{setEmailSubject('');setEmailBody('');}} style={{ ...btn('ghost'), height:28, padding:'0 10px', fontSize:12 }}>초기화</button>
            </div>
          </div>
          <textarea value={emailBody} onChange={e=>setEmailBody(e.target.value)}
            placeholder={`안녕하세요. 태림전자공업㈜입니다.\n\n[청구월] 임대료 및 관리비 청구서를 보내드립니다.\n첨부 파일을 확인하시고 지정 기일 내 납부 부탁드립니다.\n\n감사합니다.`}
            rows={10} style={{ ...baseInput, background:C.white, resize:'vertical', lineHeight:1.85, fontFamily:"'Malgun Gothic','맑은 고딕',monospace" }} />
          {emailBody.length>1800 && <div style={{ fontSize:11.5, color:C.red, marginTop:4 }}>⚠ 본문이 길면 메일 앱에서 잘릴 수 있습니다 (권장 1,800자 이하)</div>}
        </div>

        {/* 발송 */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={handleSend} style={btn('primary')}>📤 메일 앱으로 발송</button>
          <span style={{ fontSize:11.5, color:C.textHint }}>기본 메일 앱이 열립니다</span>
          {emailMsg && <span style={{ fontSize:12.5, color:emailMsg.includes('✓')?C.green:C.red }}>{emailMsg}</span>}
        </div>
      </div>

      {/* ── 공과금 고지서 보관함 ── */}
      <div style={CARD}>
        <SecHead icon="🗄️" title="월별 공과금 고지서 보관함" />
        <input ref={docFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleDocUpload} />

        {/* 업로드 컨트롤 */}
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
          <div>
            <FL text="월 선택" />
            <input type="month" value={docMonth} onChange={e=>setDocMonth(e.target.value)}
              style={{ ...baseInput, width:'auto', background:C.white }} />
          </div>
          <div>
            <FL text="고지서 종류" />
            <div style={{ display:'flex', background:C.white, border:`1px solid ${C.border}`, borderRadius:20, overflow:'hidden' }}>
              {[['elec','⚡ 전기'],['water','💧 수도']].map(([v,label])=>(
                <button key={v} onClick={()=>setDocType(v)}
                  style={{ ...btn(docType===v?'active':'inactive'), borderRadius:0, height:34 }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ alignSelf:'flex-end' }}>
            <button onClick={()=>{docFileRef.current.value=''; docFileRef.current.click();}}
              style={btn('navyGhost')}>📁 파일 업로드</button>
          </div>
          {billDocs[docMonth]?.[docType] && (
            <div style={{ alignSelf:'flex-end' }}>
              <button onClick={()=>setDocModal(billDocs[docMonth][docType])}
                style={btn('secondary')}>🔍 현재 보기</button>
            </div>
          )}
        </div>

        {/* 월별 그리드 */}
        {Object.keys(billDocs).filter(m=>billDocs[m]?.elec||billDocs[m]?.water).length===0 ? (
          <div style={{ color:C.textHint, fontSize:13, textAlign:'center', padding:'24px 0' }}>
            업로드된 고지서가 없습니다.
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:12 }}>
            {Object.entries(billDocs)
              .filter(([,docs])=>docs?.elec||docs?.water)
              .sort(([a],[b])=>b.localeCompare(a))
              .map(([month,docs])=>(
                <div key={month} style={{ background:C.navyBg, borderRadius:12, padding:12, border:`1px solid ${C.navyBg2}` }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.navyDark, marginBottom:8 }}>
                    {month.replace('-','년 ')}월
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    {[['elec','⚡ 전기'],['water','💧 수도']].map(([type,label])=>(
                      <div key={type} style={{ flex:1 }}>
                        <div style={{ fontSize:11, color:C.textSub, marginBottom:4 }}>{label}</div>
                        {docs[type] ? (
                          <div style={{ position:'relative' }}>
                            <img src={docs[type]} alt={label}
                              style={{ width:'100%', height:75, objectFit:'cover', borderRadius:6, border:`1px solid ${C.border}`, cursor:'zoom-in', display:'block' }}
                              onClick={()=>setDocModal(docs[type])} />
                            <button onClick={()=>removeDoc(month,type)}
                              style={{ position:'absolute', top:3, right:3, background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', borderRadius:'50%', width:18, height:18, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                          </div>
                        ) : (
                          <div style={{ width:'100%', height:75, borderRadius:6, border:`2px dashed ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:C.textHint, fontSize:11, cursor:'pointer' }}
                            onClick={()=>{ setDocMonth(month); setDocType(type); docFileRef.current.value=''; docFileRef.current.click(); }}>
                            + 업로드
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* 이미지 모달 */}
      {docModal && (
        <div onClick={()=>setDocModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={docModal} alt="고지서" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8, boxShadow:'0 8px 40px rgba(0,0,0,0.5)' }} onClick={e=>e.stopPropagation()} />
          <button onClick={()=>setDocModal(null)} style={{ position:'fixed', top:18, right:22, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:'50%', width:36, height:36, fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── App Root ──────────────────────────────────────────────────
export default function App() {
  useEffect(()=>{
    const style=document.createElement('style');
    style.id='tl-print-css';
    style.textContent=`@media print { .no-print { display: none !important; } header.tl-header { display: none !important; } }`;
    document.head.appendChild(style);
    return ()=>{ const el=document.getElementById('tl-print-css'); if(el) el.remove(); };
  },[]);

  const [loggedIn,setLoggedIn]=useState(false);
  const [savedPw,setSavedPw]=useState(()=>store.get('tl_pw')||DEFAULT_PASSWORD);
  const [page,setPage]=useState('input');
  const [reading,setReading]=useState(()=>store.get('tl_reading')||SAMPLE_READING);
  const [history,setHistory]=useState(()=>store.get('tl_history')||INITIAL_HISTORY);
  const [tenants,setTenants]=useState(()=>{
    const saved=store.get('tl_tenants');
    if(!saved) return INITIAL_TENANTS;
    return INITIAL_TENANTS.map(def=>{ const m=saved.find(t=>t.id===def.id); return m?{...def,...m}:def; });
  });
  const [saveMsg,setSaveMsg]=useState('');

  const onChange=(r)=>{ setReading(r); store.set('tl_reading',r); };
  const onSave=()=>{
    const entry={...reading,savedAt:new Date().toISOString()};
    const billingNo=getBillingNo(reading.periodEnd);
    const idx=history.findIndex(h=>getBillingNo(h.periodEnd)===billingNo);
    let next;
    if(idx>=0){
      next=history.map((h,i)=>i===idx?entry:h);
      setSaveMsg('덮어쓰기 완료!');
    } else {
      next=[entry,...history].slice(0,36);
      setSaveMsg('저장됐습니다!');
    }
    setHistory(next); store.set('tl_history',next);
    setTimeout(()=>setSaveMsg(''),3000);
  };
  const handleLogin=(pw)=>{ if(pw===savedPw){ setLoggedIn(true); return true; } return false; };
  const handleSetPw=(pw)=>{ setSavedPw(pw); store.set('tl_pw',pw); };
  const handleSetTenants=(t)=>{ setTenants(t); store.set('tl_tenants',t); };

  if(!loggedIn) return <LoginPage onLogin={handleLogin} />;
  const calc=calcAll(reading);

  return (
    <div style={{ fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", minHeight:'100vh', background:C.pageBg }}>
      <Header page={page} setPage={setPage} onLogout={()=>setLoggedIn(false)} />
      <main style={{ padding:'20px 24px', maxWidth:980, margin:'0 auto' }}>
        {page==='input'     && <InputPage    reading={reading} onChange={onChange} onSave={onSave} saveMsg={saveMsg} />}
        {page==='invoice'   && <InvoicePage  reading={reading} tenants={tenants} calc={calc} />}
        {page==='quarterly' && <QuarterlyPage history={history} tenants={tenants} />}
        {page==='history'   && <HistoryPage  history={history} onLoad={(h)=>{ onChange(h); setPage('input'); }} onUpdate={(updated)=>{ setHistory(updated); store.set('tl_history',updated); }} />}
        {page==='tenant'    && <TenantPage   tenants={tenants} setTenants={handleSetTenants} />}
        {page==='finance'   && <FinancePage  />}
        {page==='notice'    && <NoticePage   />}
        {page==='settings'  && <SettingsPage savedPassword={savedPw} setSavedPassword={handleSetPw} tenants={tenants} setTenants={handleSetTenants} reading={reading} />}
      </main>
    </div>
  );
}
