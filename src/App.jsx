import { useState, Fragment, useEffect, useRef } from "react";
import { auth, db } from './firebase';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, collection, addDoc,
  query, orderBy, onSnapshot, updateDoc, where, getDocs, serverTimestamp, deleteDoc
} from 'firebase/firestore';

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

// ─── Telegram 알림 헬퍼 ───────────────────────────────────────
async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) return { ok:false, err:'Telegram 미설정' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id:chatId, text, parse_mode:'HTML' }),
    });
    const d = await res.json();
    return res.ok ? { ok:true } : { ok:false, err:d.description||'전송 실패' };
  } catch(e) { return { ok:false, err:e.message }; }
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
      <defs>
        <linearGradient id="tlgrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={bw?'#333':'#6366f1'}/>
          <stop offset="100%" stopColor={bw?'#111':'#312e81'}/>
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#tlgrad)" />
      <rect x="2" y="2" width="36" height="36" rx="8" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <text x="20" y="27" textAnchor="middle" fill="white" fontSize="17" fontWeight="900" fontFamily="'Arial Black',Arial,sans-serif" letterSpacing="-0.5">TL</text>
    </svg>
  );
}

function TLLogoHero({ size=80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <defs>
        <linearGradient id="tlhg1" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#818cf8"/>
          <stop offset="60%" stopColor="#4f46e5"/>
          <stop offset="100%" stopColor="#312e81"/>
        </linearGradient>
        <linearGradient id="tlhg2" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255,255,255,0.25)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0.04)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="22" fill="url(#tlhg1)"/>
      <rect x="3" y="3" width="74" height="74" rx="19" fill="none" stroke="url(#tlhg2)" strokeWidth="1.5"/>
      <text x="40" y="53" textAnchor="middle" fill="white" fontSize="34" fontWeight="900" fontFamily="'Arial Black',Arial,sans-serif" letterSpacing="-1">TL</text>
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

// ─── Register Page ────────────────────────────────────────────
function RegisterPage({ onBack, onDone }) {
  const [form,setForm]=useState({name:'',email:'',password:'',pw2:'',dept:''});
  const [err,setErr]=useState('');
  const [loading,setLoading]=useState(false);
  const [done,setDone]=useState(false);

  const submit=async()=>{
    if(!form.name.trim()||!form.email.trim()||!form.password){ setErr('이름, 이메일, 비밀번호를 모두 입력하세요.'); return; }
    if(form.password!==form.pw2){ setErr('비밀번호가 일치하지 않습니다.'); return; }
    if(form.password.length<6){ setErr('비밀번호는 6자 이상이어야 합니다.'); return; }
    setLoading(true); setErr('');
    try {
      // 첫 번째 사용자인지 확인
      const snap=await getDocs(collection(db,'users'));
      const isFirst=snap.empty;
      const cred=await createUserWithEmailAndPassword(auth,form.email.trim(),form.password);
      const empNo=`EMP-${String(snap.size+1).padStart(3,'0')}`;
      const profile={ name:form.name.trim(), email:form.email.trim(), dept:form.dept.trim(),
        role:isFirst?'master':'pending', approved:isFirst, empNo,
        createdAt:new Date().toISOString() };
      await setDoc(doc(db,'users',cred.user.uid),profile);
      // 첫 사용자 아니면 로그아웃 후 승인 대기
      if(!isFirst){ await signOut(auth); }
      // Telegram 알림
      const tgToken=store.get('tl_telegram_token');
      const tgAdmin=store.get('tl_telegram_admin');
      if(tgToken&&tgAdmin&&!isFirst){
        await sendTelegram(tgToken,tgAdmin,`👤 <b>새 회원가입 요청</b>\n\n이름: ${form.name}\n이메일: ${form.email}\n부서: ${form.dept||'미입력'}\n사번: ${empNo}\n\n관리자 설정에서 승인해주세요.`);
      }
      setDone(true);
      if(isFirst) onDone?.();
    } catch(e){
      const msg={'auth/email-already-in-use':'이미 사용 중인 이메일입니다.','auth/invalid-email':'이메일 형식이 올바르지 않습니다.'};
      setErr(msg[e.code]||e.message);
    }
    setLoading(false);
  };

  const features=[['📊','관리비 청구'],['⚡','검침 관리'],['📋','전자결재'],['🚨','긴급호출'],['📄','전표'],['📅','출퇴근']];

  if(done) return (
    <div style={{ display:'flex', minHeight:'100vh', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#06061a,#0f0f2e,#0a1628)', fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif" }}>
      <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'48px 40px', width:380, textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:20 }}>✅</div>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:10 }}>가입 요청 완료!</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', lineHeight:1.9, marginBottom:28 }}>
          관리자 승인 후 로그인 가능합니다.<br/>대표님께 문의해 주세요.
        </div>
        <button onClick={onBack} style={{ background:'linear-gradient(135deg,#4f46e5,#6366f1)', border:'none', borderRadius:12, padding:'13px 32px', fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer' }}>로그인으로 돌아가기</button>
      </div>
    </div>
  );

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,#06061a 0%,#0f0f2e 40%,#0a1628 100%)' }} />
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(99,102,241,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.04) 1px,transparent 1px)', backgroundSize:'36px 36px' }} />

      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 64px', position:'relative', zIndex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:18, marginBottom:32 }}>
          <TLLogoHero size={64} />
          <div>
            <div style={{ color:'#fff', fontSize:22, fontWeight:900, letterSpacing:'-0.5px' }}>태림전자공업㈜</div>
            <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, letterSpacing:'2px', marginTop:4, textTransform:'uppercase' }}>TAE LIM ELECTRONICS CO., LTD.</div>
          </div>
        </div>
        <div style={{ color:'rgba(255,255,255,0.5)', fontSize:13, lineHeight:2, marginBottom:32 }}>
          직원 계정을 만들어 시스템에 접근하세요.<br/>가입 후 관리자 승인이 필요합니다.
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {features.map(([icon,label])=>(
            <div key={label} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:'7px 13px', display:'flex', alignItems:'center', gap:7 }}>
              <span style={{ fontSize:13 }}>{icon}</span>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width:440, background:'rgba(255,255,255,0.02)', backdropFilter:'blur(28px)', WebkitBackdropFilter:'blur(28px)', borderLeft:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px', position:'relative', zIndex:1, overflowY:'auto' }}>
        <div style={{ width:'100%' }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff' }}>회원가입</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:4 }}>직원 계정 생성</div>
          </div>
          {[['이름 *','name','text','홍길동'],['이메일 *','email','email','example@email.com'],['비밀번호 * (6자 이상)','password','password',''],['비밀번호 확인 *','pw2','password',''],['부서/직책','dept','text','예: 소방안전관리']].map(([label,field,type,ph])=>(
            <div key={field} style={{ marginBottom:12 }}>
              <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.45)', marginBottom:5 }}>{label}</div>
              <input type={type} placeholder={ph} value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
                style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.06)', border:'1.5px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'11px 14px', fontSize:13, color:'#fff', fontFamily:'inherit', outline:'none' }} />
            </div>
          ))}
          {err && <div style={{ background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, padding:'10px 14px', fontSize:12.5, color:'#f87171', marginBottom:12 }}>⚠ {err}</div>}
          <button onClick={submit} disabled={loading}
            style={{ width:'100%', background:'linear-gradient(135deg,#4f46e5,#6366f1)', border:'none', borderRadius:12, padding:'13px', fontSize:14, fontWeight:700, color:'#fff', cursor:loading?'wait':'pointer', marginBottom:12, boxShadow:'0 4px 20px rgba(99,102,241,0.4)' }}>
            {loading?'처리 중…':'가입 신청'}
          </button>
          <button onClick={onBack} style={{ width:'100%', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'11px', fontSize:13, color:'rgba(255,255,255,0.45)', cursor:'pointer' }}>
            ← 로그인으로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email,setEmail]=useState(''); const [pw,setPw]=useState('');
  const [err,setErr]=useState(''); const [loading,setLoading]=useState(false);
  const [showReg,setShowReg]=useState(false);
  const go=async()=>{
    if(!email.trim()||!pw){ setErr('이메일과 비밀번호를 입력하세요.'); return; }
    setLoading(true); setErr('');
    const result=await onLogin(email.trim(),pw);
    if(!result.ok){ setErr(result.error||'로그인 실패'); setPw(''); }
    setLoading(false);
  };
  const features=[['📊','관리비 청구'],['⚡','검침 관리'],['📋','전자결재'],['🚨','긴급호출'],['📄','전표'],['📅','출퇴근'],['🔥','비상연락망'],['📑','계약서 관리']];

  if(showReg) return <RegisterPage onBack={()=>setShowReg(false)} />;
  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", position:'relative', overflow:'hidden' }}>
      {/* 배경 */}
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg,#06061a 0%,#0f0f2e 40%,#0a1628 100%)' }} />
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(99,102,241,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,0.04) 1px,transparent 1px)', backgroundSize:'36px 36px' }} />
      <div style={{ position:'absolute', top:'15%', left:'15%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(99,102,241,0.1) 0%,transparent 65%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'10%', right:'15%', width:320, height:320, borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,0.07) 0%,transparent 65%)', pointerEvents:'none' }} />

      {/* 왼쪽 패널 - 브랜딩 */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 64px', position:'relative', zIndex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:18, marginBottom:32 }}>
          <TLLogoHero size={68} />
          <div>
            <div style={{ color:'#fff', fontSize:24, fontWeight:900, letterSpacing:'-0.5px', lineHeight:1.2 }}>태림전자공업㈜</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:10, letterSpacing:'2.5px', marginTop:5, textTransform:'uppercase' }}>TAE LIM ELECTRONICS CO., LTD.</div>
          </div>
        </div>
        <div style={{ color:'rgba(255,255,255,0.6)', fontSize:13.5, lineHeight:2, marginBottom:36, maxWidth:400 }}>
          구로디지털단지 통합 건물 관리 플랫폼.<br/>
          관리비 청구부터 전자결재, 긴급호출까지<br/>
          하나의 시스템에서 모두 관리합니다.
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, maxWidth:460 }}>
          {features.map(([icon,label])=>(
            <div key={label} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'8px 14px', display:'flex', alignItems:'center', gap:7, transition:'background 0.2s' }}>
              <span style={{ fontSize:14 }}>{icon}</span>
              <span style={{ fontSize:11.5, color:'rgba(255,255,255,0.55)', fontWeight:500 }}>{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop:'auto', paddingTop:60, fontSize:10.5, color:'rgba(255,255,255,0.18)', lineHeight:1.9 }}>
          <div>{CO_ADDR}</div>
          <div>Tel: {CO_TEL} · Fax: {CO_FAX}</div>
        </div>
      </div>

      {/* 오른쪽 패널 - 로그인 */}
      <div style={{ width:420, background:'rgba(255,255,255,0.02)', backdropFilter:'blur(28px)', WebkitBackdropFilter:'blur(28px)', borderLeft:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 40px', position:'relative', zIndex:1 }}>
        <div style={{ width:'100%' }}>
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}><TLLogoHero size={52} /></div>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>로그인</div>
            <div style={{ fontSize:12.5, color:'rgba(255,255,255,0.35)', marginTop:5 }}>관리 시스템에 접속합니다</div>
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.45)', marginBottom:5 }}>이메일</div>
            <input type="email" placeholder="이메일 주소" value={email}
              onChange={e=>{setEmail(e.target.value);setErr('');}}
              onKeyDown={e=>e.key==='Enter'&&go()}
              style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.06)', border:`1.5px solid ${err?'rgba(239,68,68,0.7)':'rgba(255,255,255,0.1)'}`, borderRadius:12, padding:'13px 16px', fontSize:14, color:'#fff', fontFamily:'inherit', outline:'none' }} />
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.45)', marginBottom:5 }}>비밀번호</div>
            <input type="password" placeholder="비밀번호" value={pw}
              onChange={e=>{setPw(e.target.value);setErr('');}}
              onKeyDown={e=>e.key==='Enter'&&go()}
              style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.06)', border:`1.5px solid ${err?'rgba(239,68,68,0.7)':'rgba(255,255,255,0.1)'}`, borderRadius:12, padding:'13px 16px', fontSize:14, color:'#fff', fontFamily:'inherit', outline:'none' }} />
            {err && <div style={{ fontSize:12, color:'#f87171', marginTop:6 }}>⚠ {err}</div>}
          </div>
          <button onClick={go} disabled={loading}
            style={{ width:'100%', background:'linear-gradient(135deg,#4f46e5,#6366f1)', border:'none', borderRadius:12, padding:'14px', fontSize:15, fontWeight:700, color:'#fff', cursor:loading?'wait':'pointer', boxShadow:'0 4px 24px rgba(99,102,241,0.45)', marginBottom:12 }}>
            {loading?'로그인 중…':'로그인'}
          </button>
          <button onClick={()=>setShowReg(true)}
            style={{ width:'100%', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'12px', fontSize:13, color:'rgba(255,255,255,0.45)', cursor:'pointer' }}>
            계정이 없으신가요? 회원가입
          </button>
          <div style={{ textAlign:'center', marginTop:16, fontSize:10, color:'rgba(255,255,255,0.15)' }}>
            v3.0 · © {new Date().getFullYear()} TAE LIM ELECTRONICS
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────
function Header({ page, setPage, onLogout, role, pendingCount }) {
  const baseTabs=[['input','검침 입력'],['invoice','청구서'],['quarterly','분기 현황'],['history','히스토리'],['tenant','임차인 현황'],['finance','자금현황'],['notice','공문'],['approval','전자결재'],['voucher','전표'],['attendance','출퇴근'],['report','업무보고'],['settings','설정']];
  return (
    <header className="tl-header" style={{ background:'rgba(49,46,129,0.97)', backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:54, position:'sticky', top:0, zIndex:100, boxShadow:'0 1px 0 rgba(255,255,255,0.06),0 4px 24px rgba(0,0,0,0.2)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginRight:10 }}>
        <TLLogo size={30} />
        <div>
          <div style={{ fontWeight:800, fontSize:14, letterSpacing:'-0.5px' }}>태림전자공업㈜</div>
          <div style={{ fontSize:9, opacity:0.35, letterSpacing:'1px', marginTop:1 }}>MANAGEMENT SYSTEM v3.0</div>
        </div>
      </div>
      <nav style={{ display:'flex', gap:1, alignItems:'center', overflowX:'auto' }}>
        {baseTabs.map(([id,label])=>{
          const isApproval=id==='approval';
          const active=page===id;
          return (
            <button key={id} onClick={()=>setPage(id)} style={{ background:active?'rgba(255,255,255,0.14)':'transparent', border:active?'1px solid rgba(255,255,255,0.18)':'1px solid transparent', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', color:active?'#fff':'rgba(255,255,255,0.58)', fontFamily:'inherit', fontWeight:active?600:400, whiteSpace:'nowrap', transition:'all 0.15s', position:'relative' }}>
              {label}
              {isApproval && pendingCount>0 && <span style={{ position:'absolute', top:2, right:2, width:14, height:14, background:'#ef4444', borderRadius:'50%', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}>{pendingCount}</span>}
            </button>
          );
        })}
        <div style={{ width:1, height:18, background:'rgba(255,255,255,0.12)', margin:'0 5px', flexShrink:0 }} />
        <div style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
          <span style={{ background:role==='master'?'rgba(167,139,250,0.25)':role==='admin'?'rgba(250,204,21,0.25)':'rgba(255,255,255,0.08)', border:`1px solid ${role==='master'?'rgba(167,139,250,0.5)':role==='admin'?'rgba(250,204,21,0.5)':'rgba(255,255,255,0.15)'}`, borderRadius:6, padding:'3px 8px', fontSize:10, fontWeight:700, color:role==='master'?'#c4b5fd':role==='admin'?'#fde047':'rgba(255,255,255,0.6)', whiteSpace:'nowrap' }}>
            {role==='master'?'🔑 MASTER':role==='admin'?'👑 대표':'👤'}
          </span>
          <button onClick={onLogout} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', color:'rgba(255,255,255,0.5)', fontFamily:'inherit', whiteSpace:'nowrap' }}>로그아웃</button>
        </div>
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

      {/* 이미지 자동 인식 사용 방법 안내 */}
      <div style={{ background:C.navyBg, border:`1px solid ${C.navyBg2}`, borderRadius:12, padding:'12px 16px', marginBottom:12, display:'flex', gap:12, alignItems:'flex-start' }}>
        <div style={{ fontSize:20, flexShrink:0, marginTop:2 }}>📸</div>
        <div>
          <div style={{ fontSize:12.5, fontWeight:700, color:C.navyDark, marginBottom:6 }}>고지서 이미지 자동 인식 사용 방법</div>
          <div style={{ fontSize:12, color:C.textMid, lineHeight:1.9 }}>
            <span style={{ background:C.navyMid, color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700, marginRight:5 }}>1</span>전기/수도 고지서 카드에서 <b>📸 이미지 자동 인식</b> 버튼 클릭
            <span style={{ margin:'0 8px', color:C.textHint }}>→</span>
            <span style={{ background:C.navyMid, color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700, marginRight:5 }}>2</span>고지서 사진 선택
            <span style={{ margin:'0 8px', color:C.textHint }}>→</span>
            <span style={{ background:C.navyMid, color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700, marginRight:5 }}>3</span>AI가 금액 자동 채움
          </div>
          <div style={{ fontSize:11.5, color:C.textSub, marginTop:4 }}>⚠ 인식 실패 또는 오류 시: 아래 각 칸에 직접 숫자를 입력하세요. 수동 입력이 항상 가능합니다.</div>
          <div style={{ fontSize:11, color:C.textHint, marginTop:2 }}>※ 자동 인식을 사용하려면 설정 탭에서 Anthropic API 키를 먼저 등록하세요.</div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {[
          { icon:'📄', title:'전기 고지서 (한전)', type:'elec', rows:[['basicFee','기본요금'],['powerFund','전력산업기반기금'],['totalAmount','전기 고지 총액 ★'],['vat','부가가치세'],['safetyFee','전기안전대행료(월)']], obj:'elecBill' },
          { icon:'💧', title:'수도 고지서', type:'water', rows:reading.waterCalc==='O'?[['totalAmount','수도 고지 총액 ★'],['basicFee','수도 기본요금 (전체)']]:[],  obj:'waterBill' },
        ].map(({icon,title,type,rows,obj})=>(
          <div key={obj} style={CARD}>
            <SecHead icon={icon} title={title} action={
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                <button onClick={()=>triggerAnalyze(type)} disabled={!!analyzing}
                  style={{ ...btn('navyGhost'), height:30, padding:'0 12px', fontSize:12, opacity:analyzing?0.6:1 }}>
                  {analyzing===type ? '⏳ 인식 중…' : '📸 자동 인식'}
                </button>
                <span style={{ fontSize:10, color:C.textHint }}>실패시 직접 입력↓</span>
              </div>
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
        <div style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:10, padding:'12px 16px', fontSize:13, color:C.red, marginTop:4 }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>⚠ 자동 인식 실패</div>
          <div style={{ fontSize:12, marginBottom:6 }}>{analyzeErr}</div>
          <div style={{ fontSize:12, color:C.orange, fontWeight:500 }}>→ 위 고지서 카드의 각 항목에 직접 숫자를 입력해주세요. 수동 입력이 가능합니다.</div>
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
  const mgmtVat=Math.floor(mgmtTotal*0.1);
  const rentVat=Math.floor(tenant.rent*0.1);
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
  <div class="footer">
    <div style="margin-bottom:3px;">발행인: 태림전자공업㈜ (인) &nbsp;|&nbsp; 발행일: ${new Date().toLocaleDateString('ko-KR')} &nbsp;|&nbsp; TEL: ${CO_TEL} / FAX: ${CO_FAX}</div>
    <div style="margin-bottom:4px;">${CO_ADDR}</div>
    <div style="border-top:1px dashed #ccc;padding-top:4px;margin-top:4px;">© ${new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD. All Rights Reserved.</div>
  </div>
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
  <div style="border-top:1px solid #e0e0e0;padding-top:8px;margin-top:4px;">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:4px;font-size:10.5px;color:#666;">
      <span>발행인: 태림전자공업㈜ (인) &nbsp;|&nbsp; 발행일: ${new Date().toLocaleDateString('ko-KR')}</span>
      <span>TEL: ${CO_TEL} / FAX: ${CO_FAX}</span>
    </div>
    <div style="font-size:10px;color:#888;margin-bottom:5px;">${CO_ADDR}</div>
    <div style="text-align:center;font-size:10px;color:#aaa;border-top:1px dashed #eee;padding-top:5px;">© ${new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD. All Rights Reserved.</div>
  </div>
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
        <div style={{ borderTop:`1px solid ${C.tBorder}`, paddingTop:10, marginTop:4 }}>
          <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:4, marginBottom:4 }}>
            <span style={{ fontSize:11, color:C.textSub }}>발행인: 태림전자공업㈜ (인)&nbsp;&nbsp;|&nbsp;&nbsp;발행일: {new Date().toLocaleDateString('ko-KR')}</span>
            <span style={{ fontSize:11, color:C.textHint }}>TEL {CO_TEL}&nbsp;&nbsp;FAX {CO_FAX}</span>
          </div>
          <div style={{ fontSize:10.5, color:C.textHint, marginBottom:6 }}>{CO_ADDR}</div>
          <div style={{ display:'flex', justifyContent:'center', borderTop:`1px dashed ${C.border}`, paddingTop:6 }}>
            <span style={{ fontSize:10, color:C.textHint, letterSpacing:'0.3px' }}>© {new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD.&nbsp;&nbsp;All Rights Reserved.</span>
          </div>
        </div>
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
        <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:660 }}>
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
function TenantPage({ tenants, setTenants, role }) {
  const [local,setLocal]=useState(()=>tenants.map(t=>({...t})));
  const [editing,setEditing]=useState(null);
  const [msg,setMsg]=useState('');
  const isPrivileged = role==='admin'||role==='master';

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
                      {isPrivileged && [['보증금',`${fmt(t.deposit)}원`],['월차임',`${fmt(t.rent)}원`]].map(([label,value])=>(
                        <div key={label}>
                          <div style={{ fontSize:11, color:C.textHint, marginBottom:3 }}>{label}</div>
                          <div style={{ fontSize:14, fontWeight:700, color:C.text, fontVariantNumeric:'tabular-nums' }}>{value}</div>
                        </div>
                      ))}
                      {!isPrivileged && (
                        <div style={{ gridColumn:'1/-1', background:'#f8fafc', border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', fontSize:12, color:C.textHint, textAlign:'center' }}>
                          🔒 금액 정보는 관리자만 열람 가능합니다
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize:11, color:C.textHint, marginBottom:3 }}>면적</div>
                        <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{t.area?`${Number(t.area).toLocaleString()}㎡`:'미설정'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:C.textHint, marginBottom:3 }}>계약기간</div>
                        <div style={{ fontSize:11.5, fontWeight:500, color:C.textMid, lineHeight:1.5 }}>
                          {t.contractStart&&t.contractEnd?`${t.contractStart} ~ ${t.contractEnd}`:t.contractEnd?`~ ${t.contractEnd}`:'미설정'}
                        </div>
                      </div>
                    </div>

                    <div style={{ background:warnBg, border:`1px solid ${warnBrd}`, borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                      <span style={{ fontSize:12, color:warnColor, fontWeight:600 }}>{warnText}</span>
                      <DdayBadge dateStr={t.contractEnd} />
                    </div>

                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      {isPrivileged && <button onClick={()=>setEditing(t.id)} style={{ ...btn('secondary'), flex:1, justifyContent:'center' }}>✏ 수정</button>}
                      <ContractFileBtn tenantId={t.id} tenantName={t.name} />
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary - 관리자/마스터만 */}
      {!isPrivileged && <div style={{ background:'#f8fafc', border:`1px solid ${C.border}`, borderRadius:12, padding:'14px 18px', fontSize:13, color:C.textSub, textAlign:'center' }}>🔒 금액 요약은 관리자만 열람 가능합니다.</div>}
      {isPrivileged && <div style={CARD}>
        <SecHead icon="📊" title="전체 임차 현황 요약" />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:16 }}>
          {[
            { icon:'🏦', label:'총 보증금', value:`${fmt(local.reduce((s,t)=>s+(t.deposit||0),0))}원`, color:C.navyDark, bg:C.navyBg, border:C.navyBg2 },
            { icon:'💰', label:'월 임대료 합계', value:`${fmt(local.reduce((s,t)=>s+(t.rent||0),0))}원`, color:C.green, bg:C.greenBg, border:C.greenBorder },
            { icon:'📅', label:'연 임대료 합계', value:`${fmt(local.reduce((s,t)=>s+(t.rent||0),0)*12)}원`, color:C.blue, bg:C.blueBg, border:C.blueBorder },
            { icon:'🏢', label:'임차 업체 수', value:`${local.length}개사`, color:C.amber, bg:C.amberBg, border:C.amberBorder },
          ].map(({icon,label,value,color,bg,border})=>(
            <div key={label} style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:'16px 14px', display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ fontSize:18 }}>{icon}</div>
              <div style={{ fontSize:11, color:C.textSub, fontWeight:500 }}>{label}</div>
              <div style={{ fontSize:15, fontWeight:800, color, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.3px' }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {local.map((t)=>{
            const d=getDday(t.contractEnd);
            let statusColor=C.green, statusBg=C.greenBg, statusBrd=C.greenBorder, statusLabel='계약중';
            if(d===null){ statusColor=C.textSub; statusBg=C.tHead; statusBrd=C.tBorder; statusLabel='기간미설정'; }
            else if(d<0){ statusColor=C.red; statusBg=C.redBg; statusBrd=C.redBorder; statusLabel='만료됨'; }
            else if(d<=30){ statusColor=C.red; statusBg=C.redBg; statusBrd=C.redBorder; statusLabel=`D-${d} 만료임박`; }
            else if(d<=60){ statusColor=C.orange; statusBg=C.orangeBg; statusBrd=C.orangeBorder; statusLabel=`D-${d} 만료예정`; }
            return (
              <div key={t.id} style={{ background:statusBg, border:`1px solid ${statusBrd}`, borderRadius:10, padding:'8px 14px', display:'flex', alignItems:'center', gap:8, minWidth:160 }}>
                <span style={{ fontSize:11.5, fontWeight:700, color:statusColor }}>{t.floor} {t.name}</span>
                <span style={{ fontSize:11, color:statusColor, opacity:0.8 }}>{statusLabel}</span>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

// ─── Finance Page ─────────────────────────────────────────────
function FinancePage() {
  const now=new Date();
  const [month,setMonth]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [accounts,setAccounts]=useState(()=>store.get('tl_finance_accounts')||INITIAL_ACCOUNTS);
  const [txnData,setTxnData]=useState(()=>store.get('tl_finance_txns')||{});
  const [autoSaveAt,setAutoSaveAt]=useState(null);

  const ymData=txnData[month]||{opening:0,rows:[]};
  const setYmData=(next)=>{
    const nd={...txnData,[month]:next};
    setTxnData(nd);
    store.set('tl_finance_txns',nd);
    setAutoSaveAt(new Date());
  };

  const upAcct=(key,field,val)=>{
    const next={...accounts,[key]:{...accounts[key],[field]:Number(val)||0}};
    setAccounts(next); store.set('tl_finance_accounts',next); setAutoSaveAt(new Date());
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

  const totalIncome=(ymData.rows||[]).reduce((s,r)=>s+(r.income||0),0);
  const totalExpense=(ymData.rows||[]).reduce((s,r)=>s+(r.expense||0),0);
  const lastBalance=computedRows.length>0?computedRows.at(-1).balance:ymData.opening||0;

  return (
    <div>
      {/* 월간 요약 카드 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:14 }}>
        {[
          { icon:'💼', label:'총 잔고 (현재)', value:`${fmt(totalCurr)}원`, color:C.navyDark, bg:C.navyBg, border:C.navyBg2, sub:`전월 대비 ${(totalCurr-totalPrev)>=0?'+':''}${fmt(totalCurr-totalPrev)}원` },
          { icon:'📥', label:`${monthLabel} 입금 합계`, value:`${fmt(totalIncome)}원`, color:C.blue, bg:C.blueBg, border:C.blueBorder, sub:'이번달 수입' },
          { icon:'📤', label:`${monthLabel} 출금 합계`, value:`${fmt(totalExpense)}원`, color:C.red, bg:C.redBg, border:C.redBorder, sub:'이번달 지출' },
          { icon:'📊', label:'최종 잔액', value:`${fmt(lastBalance)}원`, color:C.green, bg:C.greenBg, border:C.greenBorder, sub:'이월잔액 포함' },
        ].map(({icon,label,value,color,bg,border,sub})=>(
          <div key={label} style={{ background:bg, border:`1px solid ${border}`, borderRadius:14, padding:'16px 14px' }}>
            <div style={{ fontSize:18, marginBottom:6 }}>{icon}</div>
            <div style={{ fontSize:11, color:C.textSub, marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:15, fontWeight:800, color, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.3px', marginBottom:3 }}>{value}</div>
            <div style={{ fontSize:10.5, color:C.textHint }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Account Summary */}
      <div style={CARD}>
        <SecHead icon="🏦" title="예금·잔고 현황" action={
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {autoSaveAt && <span style={{ fontSize:11, color:C.green }}>✓ 자동저장 {autoSaveAt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
            <span style={{ fontSize:11.5, color:C.textHint }}>셀 클릭하여 수정</span>
          </div>
        } />
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
function SettingsPage({ savedPassword, setSavedPassword, adminPw, setAdminPw, masterPw, setMasterPw, tenants, setTenants, reading, role }) {
  const [pw1,setPw1]=useState(''); const [pw2,setPw2]=useState(''); const [pwMsg,setPwMsg]=useState('');
  const [apw1,setApw1]=useState(''); const [apw2,setApw2]=useState(''); const [apwMsg,setApwMsg]=useState('');
  const [mpw1,setMpw1]=useState(''); const [mpw2,setMpw2]=useState(''); const [mpwMsg,setMpwMsg]=useState('');
  // Telegram
  const [tgToken,setTgToken]=useState(()=>store.get('tl_telegram_token')||'');
  const [tgAdmin,setTgAdmin]=useState(()=>store.get('tl_telegram_admin')||'');
  const [tgStaff,setTgStaff]=useState(()=>store.get('tl_telegram_staff')||'');
  const [tgMsg,setTgMsg]=useState('');
  // User name
  const [userName,setUserName]=useState(()=>store.get('tl_user_name')||'');
  // Users (회원 관리)
  const [users,setUsers]=useState(()=>store.get('tl_users')||[]);
  const [newUser,setNewUser]=useState({name:'',role:'staff',password:''});
  const [usersMsg,setUsersMsg]=useState('');
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

  const changeAdminPw=()=>{
    if(!apw1){ setApwMsg('새 비밀번호를 입력하세요.'); return; }
    if(apw1!==apw2){ setApwMsg('비밀번호가 일치하지 않습니다.'); return; }
    setAdminPw(apw1); setApw1(''); setApw2('');
    setApwMsg('✓ 대표 비밀번호가 변경됐습니다.'); setTimeout(()=>setApwMsg(''),3000);
  };
  const changeMasterPw=()=>{
    if(!mpw1){ setMpwMsg('새 비밀번호를 입력하세요.'); return; }
    if(mpw1!==mpw2){ setMpwMsg('비밀번호가 일치하지 않습니다.'); return; }
    setMasterPw(mpw1); setMpw1(''); setMpw2('');
    setMpwMsg('✓ 마스터 비밀번호 변경됐습니다.'); setTimeout(()=>setMpwMsg(''),3000);
  };
  const saveTgSettings=()=>{
    store.set('tl_telegram_token',tgToken);
    store.set('tl_telegram_admin',tgAdmin);
    store.set('tl_telegram_staff',tgStaff);
    setTgMsg('✓ 저장됐습니다.');  setTimeout(()=>setTgMsg(''),2500);
  };
  const testTg=async()=>{
    const res=await sendTelegram(tgToken,tgAdmin,`✅ <b>태림전자공업 알림 테스트</b>\n\nTelegram 연동이 정상 작동합니다!\n시각: ${new Date().toLocaleString('ko-KR')}`);
    setTgMsg(res.ok?'✓ 테스트 알림 전송 성공!':'⚠ 전송 실패: '+res.err);
    setTimeout(()=>setTgMsg(''),4000);
  };
  const [fbUsers,setFbUsers]=useState([]);
  const [fbUsersLoading,setFbUsersLoading]=useState(false);

  useEffect(()=>{
    if(role!=='master'&&role!=='admin') return;
    setFbUsersLoading(true);
    const unsub=onSnapshot(collection(db,'users'),(snap)=>{
      setFbUsers(snap.docs.map(d=>({uid:d.id,...d.data()})));
      setFbUsersLoading(false);
    });
    return unsub;
  },[role]);

  const approveUser=async(uid,newRole)=>{
    await updateDoc(doc(db,'users',uid),{approved:true,role:newRole});
    setUsersMsg(`✓ 승인 완료 (${newRole})`); setTimeout(()=>setUsersMsg(''),3000);
  };
  const rejectUser=async(uid)=>{
    if(!window.confirm('이 사용자를 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db,'users',uid));
  };
  const changeUserRole=async(uid,newRole)=>{
    await updateDoc(doc(db,'users',uid),{role:newRole});
  };

  const addUser=()=>{
    if(!newUser.name.trim()||!newUser.password.trim()){ setUsersMsg('⚠ 이름과 비밀번호를 입력하세요.'); setTimeout(()=>setUsersMsg(''),3000); return; }
    const u={id:Date.now(),name:newUser.name.trim(),role:newUser.role,password:newUser.password,approved:true,createdAt:new Date().toISOString()};
    const next=[...users,u];
    setUsers(next); store.set('tl_users',next);
    setNewUser({name:'',role:'staff',password:''});
    setUsersMsg('✓ 사용자가 추가됐습니다.'); setTimeout(()=>setUsersMsg(''),3000);
  };
  const deleteUser=(id)=>{ const next=users.filter(u=>u.id!==id); setUsers(next); store.set('tl_users',next); };

  const FL=({text})=><div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>{text}</div>;

  return (
    <div>
      {/* 내 이름 설정 */}
      <div style={CARD}>
        <SecHead icon="👤" title="내 이름 설정 (보고서·결재서 표시)" />
        <div style={{ display:'flex', gap:10, alignItems:'center', maxWidth:400 }}>
          <input value={userName} onChange={e=>setUserName(e.target.value)} placeholder="이름 입력 (예: 홍길동)" style={{ ...baseInput, background:C.white, flex:1 }} />
          <button onClick={()=>{ store.set('tl_user_name',userName); }} style={btn('primary')}>저장</button>
        </div>
        <div style={{ fontSize:11.5, color:C.textHint, marginTop:6 }}>업무보고, 전자결재, 전표 등 모든 문서에 이 이름이 표시됩니다.</div>
      </div>

      {/* Telegram 알림 설정 */}
      <div style={CARD}>
        <SecHead icon="📱" title="Telegram 알림 설정 (긴급호출·결재 알림)" />
        <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:12.5, color:'#0c4a6e', lineHeight:1.8 }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>📋 Telegram 봇 설정 방법 (1회만 하면 됩니다)</div>
          <div><b>1.</b> Telegram에서 <b>@BotFather</b> 검색 → <code>/newbot</code> 명령 → 봇 토큰 복사</div>
          <div><b>2.</b> 대표님 Telegram에서 봇을 찾아 <b>/start</b> 전송 후 <b>@userinfobot</b>에서 Chat ID 확인</div>
          <div><b>3.</b> 아래에 토큰과 Chat ID 입력 후 "저장 + 테스트 발송" 클릭</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10, marginBottom:12 }}>
          <div><FL text="봇 토큰 (Bot Token)" /><input type="password" value={tgToken} onChange={e=>setTgToken(e.target.value)} placeholder="1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ" style={{ ...baseInput, background:C.white, fontFamily:'monospace', fontSize:12 }} /></div>
          <div><FL text="대표님 Chat ID (긴급호출 + 결재알림 수신)" /><input value={tgAdmin} onChange={e=>setTgAdmin(e.target.value)} placeholder="예: 123456789" style={{ ...baseInput, background:C.white, fontFamily:'monospace' }} /></div>
          <div><FL text="직원 Chat ID (승인/반려 결과 수신 — 선택)" /><input value={tgStaff} onChange={e=>setTgStaff(e.target.value)} placeholder="예: 987654321 (없으면 비워두세요)" style={{ ...baseInput, background:C.white, fontFamily:'monospace' }} /></div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={saveTgSettings} style={btn('primary')}>💾 저장</button>
          <button onClick={testTg} disabled={!tgToken||!tgAdmin} style={{ ...btn('navyGhost'), opacity:(!tgToken||!tgAdmin)?0.5:1 }}>📤 테스트 발송</button>
          {tgMsg && <span style={{ fontSize:12.5, color:tgMsg.startsWith('⚠')?C.red:C.green, fontWeight:500 }}>{tgMsg}</span>}
        </div>
      </div>

      {/* Firebase 사용자 승인 관리 */}
      {(role==='master'||role==='admin') && (
        <div style={CARD}>
          <SecHead icon="🔥" title="Firebase 회원 관리 (가입 승인)" />
          {fbUsersLoading && <div style={{ fontSize:13, color:C.textSub, padding:'12px 0' }}>로딩 중…</div>}
          {!fbUsersLoading && fbUsers.length===0 && <div style={{ fontSize:13, color:C.textHint, padding:'12px 0' }}>등록된 사용자가 없습니다.</div>}
          {!fbUsersLoading && fbUsers.length>0 && (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:560 }}>
                <thead><tr>{[['이름','left'],['이메일','left'],['사번','left',90],['역할','center',90],['상태','center',80],['','center',120]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
                <tbody>
                  {fbUsers.map((u,i)=>(
                    <tr key={u.uid} style={{ background:i%2===0?C.white:C.tAlt }}>
                      <td style={TD('left',{fontWeight:600})}>{u.name||'—'}</td>
                      <td style={TD('left',{fontSize:12,color:C.textSub})}>{u.email}</td>
                      <td style={TD('left',{fontFamily:'monospace',fontSize:12,color:C.navy})}>{u.empNo||'—'}</td>
                      <td style={TD('center')}>
                        <select value={u.role||'pending'} onChange={e=>changeUserRole(u.uid,e.target.value)}
                          style={{ fontSize:11, border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 6px', background:C.white, cursor:'pointer' }}>
                          {['master','admin','staff','pending'].map(r=><option key={r} value={r}>{r==='master'?'🔑마스터':r==='admin'?'👑대표':r==='staff'?'👤직원':'⏳대기'}</option>)}
                        </select>
                      </td>
                      <td style={TD('center')}>
                        <span style={{ background:u.approved?C.greenBg:C.amberBg, color:u.approved?C.green:C.amber, border:`1px solid ${u.approved?C.greenBorder:C.amberBorder}`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:600 }}>{u.approved?'승인됨':'대기중'}</span>
                      </td>
                      <td style={TD('center')}>
                        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                          {!u.approved && <button onClick={()=>approveUser(u.uid,u.role||'staff')} style={{ ...btn('success'), height:26, padding:'0 10px', fontSize:11 }}>승인</button>}
                          <button onClick={()=>rejectUser(u.uid)} style={{ ...btn('danger'), height:26, padding:'0 8px', fontSize:11 }}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {usersMsg && <div style={{ fontSize:12.5, color:usersMsg.startsWith('⚠')?C.red:C.green, marginTop:8 }}>{usersMsg}</div>}
        </div>
      )}

      {/* 사용자 관리 (대표만) */}
      {role==='admin' && (
        <div style={CARD}>
          <SecHead icon="👥" title="사용자 관리 (직원 계정 추가)" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto auto', gap:8, marginBottom:12, alignItems:'flex-end' }}>
            <div><FL text="이름" /><input value={newUser.name} onChange={e=>setNewUser(u=>({...u,name:e.target.value}))} placeholder="예: 홍길동" style={{ ...baseInput, background:C.white }} /></div>
            <div><FL text="비밀번호" /><input value={newUser.password} onChange={e=>setNewUser(u=>({...u,password:e.target.value}))} placeholder="로그인 비밀번호" style={{ ...baseInput, background:C.white }} /></div>
            <div><FL text="역할" /><select value={newUser.role} onChange={e=>setNewUser(u=>({...u,role:e.target.value}))} style={{ ...baseInput, background:C.white, cursor:'pointer' }}><option value="staff">직원</option><option value="admin">대표</option></select></div>
            <div style={{ paddingBottom:0 }}><button onClick={addUser} style={{ ...btn('primary'), width:'100%', height:36, marginTop:20 }}>+ 추가</button></div>
          </div>
          {usersMsg && <div style={{ fontSize:12.5, color:usersMsg.startsWith('⚠')?C.red:C.green, marginBottom:8 }}>{usersMsg}</div>}
          {users.length>0 && (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{[['이름','left'],['역할','left',80],['비밀번호','left'],['등록일','left',100],['','center',40]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
              <tbody>
                {users.map((u,i)=>(
                  <tr key={u.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                    <td style={TD('left',{fontWeight:600})}>{u.name}</td>
                    <td style={TD('left')}><span style={{ background:u.role==='admin'?'#fef9c3':'#eff6ff', color:u.role==='admin'?'#854d0e':'#1d4ed8', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:600 }}>{u.role==='admin'?'대표':'직원'}</span></td>
                    <td style={TD('left',{fontFamily:'monospace',fontSize:12,color:C.textSub})}>{u.password}</td>
                    <td style={TD('left',{fontSize:11,color:C.textSub})}>{new Date(u.createdAt).toLocaleDateString('ko-KR')}</td>
                    <td style={TD('center')}><button onClick={()=>deleteUser(u.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.red, fontSize:16 }}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ fontSize:11.5, color:C.textHint, marginTop:8 }}>추가한 직원은 위 비밀번호로 로그인합니다. 이름이 자동으로 설정됩니다.</div>
        </div>
      )}

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
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div>
            <div style={{ fontSize:12.5, fontWeight:600, color:C.navy, marginBottom:10 }}>👤 직원 비밀번호</div>
            {[['새 비밀번호',pw1,setPw1],['비밀번호 확인',pw2,setPw2]].map(([lbl,val,set])=>(
              <div key={lbl} style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
                <div style={{ fontSize:11.5, color:C.textSub }}>{lbl}</div>
                <input type="password" value={val} onChange={e=>set(e.target.value)} style={{ ...baseInput, background:C.white }} />
              </div>
            ))}
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={changePw} style={btn('primary')}>변경</button>
              {pwMsg && <span style={{ fontSize:12.5, color:pwMsg.includes('✓')?C.green:C.red }}>{pwMsg}</span>}
            </div>
          </div>
          {(role==='admin'||role==='master') && (
            <div>
              <div style={{ fontSize:12.5, fontWeight:600, color:'#854d0e', marginBottom:10 }}>👑 대표 비밀번호</div>
              {[['새 비밀번호',apw1,setApw1],['비밀번호 확인',apw2,setApw2]].map(([lbl,val,set])=>(
                <div key={lbl} style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
                  <div style={{ fontSize:11.5, color:C.textSub }}>{lbl}</div>
                  <input type="password" value={val} onChange={e=>set(e.target.value)} style={{ ...baseInput, background:C.white }} />
                </div>
              ))}
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button onClick={changeAdminPw} style={btn('amber')}>변경</button>
                {apwMsg && <span style={{ fontSize:12.5, color:apwMsg.includes('✓')?C.green:C.red }}>{apwMsg}</span>}
              </div>
            </div>
          )}
          {role==='master' && (
            <div>
              <div style={{ fontSize:12.5, fontWeight:600, color:'#6d28d9', marginBottom:10 }}>🔑 마스터 비밀번호</div>
              {[['새 비밀번호',mpw1,setMpw1],['비밀번호 확인',mpw2,setMpw2]].map(([lbl,val,set])=>(
                <div key={lbl} style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
                  <div style={{ fontSize:11.5, color:C.textSub }}>{lbl}</div>
                  <input type="password" value={val} onChange={e=>set(e.target.value)} style={{ ...baseInput, background:C.white }} />
                </div>
              ))}
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button onClick={changeMasterPw} style={{ ...btn('primary'), background:'linear-gradient(135deg,#6d28d9,#4c1d95)' }}>변경</button>
                {mpwMsg && <span style={{ fontSize:12.5, color:mpwMsg.includes('✓')?C.green:C.red }}>{mpwMsg}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="🏢" title="임차인 설정 (청구용)" />
        <div style={{ overflowX:'auto', marginBottom:16 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:680 }}>
            <thead><tr>
              <th style={TH('left',60)}>층</th>
              <th style={TH('left',100)}>임차인</th>
              <th style={TH('right',140)}>임대료(원)</th>
              <th style={TH('right',110)}>관리비 평수</th>
              <th style={TH('right',120)}>승강기(원)</th>
              <th style={TH('left')}>이메일</th>
            </tr></thead>
            <tbody>
              {lt.map((t,i)=>(
                <tr key={t.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                  <td style={TD('left',{fontWeight:500,color:C.navy})}>{t.floor}</td>
                  <td style={TD('left',{fontWeight:500})}>{t.name}</td>
                  <td style={TD('right')}><NumInput value={t.rent} onChange={v=>upT(i,'rent',v)} /></td>
                  <td style={TD('right')}><NumInput value={t.mgmtArea} onChange={v=>upT(i,'mgmtArea',v)} /></td>
                  <td style={TD('right')}><NumInput value={t.elevator} onChange={v=>upT(i,'elevator',v)} /></td>
                  <td style={TD('left',{minWidth:220})}>
                    <input type="email" value={t.email||''} onChange={e=>upT(i,'email',e.target.value)}
                      placeholder="example@email.com"
                      style={{ ...baseInput, background:C.white, minWidth:200 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

// ─── Work Report Page ─────────────────────────────────────────
function WorkReportPage() {
  const today=new Date().toISOString().split('T')[0];
  const [reportType,setReportType]=useState('daily');
  const [date,setDate]=useState(today);
  const [author,setAuthor]=useState(()=>store.get('tl_report_author')||'');
  const [todayTasks,setTodayTasks]=useState([{id:Date.now(),done:false,text:''}]);
  const [issues,setIssues]=useState('');
  const [nextTasks,setNextTasks]=useState([{id:Date.now()+1,text:''}]);
  const [weekNote,setWeekNote]=useState('');

  const saveAuthor=(v)=>{ setAuthor(v); store.set('tl_report_author',v); };
  const addTodayTask=()=>setTodayTasks(t=>[...t,{id:Date.now(),done:false,text:''}]);
  const updTodayTask=(id,field,val)=>setTodayTasks(t=>t.map(r=>r.id===id?{...r,[field]:val}:r));
  const delTodayTask=(id)=>setTodayTasks(t=>t.filter(r=>r.id!==id));
  const addNextTask=()=>setNextTasks(t=>[...t,{id:Date.now(),text:''}]);
  const updNextTask=(id,val)=>setNextTasks(t=>t.map(r=>r.id===id?{...r,text:val}:r));
  const delNextTask=(id)=>setNextTasks(t=>t.filter(r=>r.id!==id));

  const dateLabel=(ds)=>{
    const d=new Date(ds); if(isNaN(d)) return ds;
    const days=['일','월','화','수','목','금','토'];
    return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  };
  const getWeekRange=(ds)=>{
    const d=new Date(ds); const day=d.getDay();
    const mon=new Date(d); mon.setDate(d.getDate()-(day===0?6:day-1));
    const fri=new Date(mon); fri.setDate(mon.getDate()+4);
    return `${mon.getFullYear()}년 ${mon.getMonth()+1}월 ${mon.getDate()}일 ~ ${fri.getMonth()+1}월 ${fri.getDate()}일`;
  };

  const handlePrint=()=>{
    const isWeekly=reportType==='weekly';
    const titleText=isWeekly?'주간 업무 보고':'일일 업무 보고';
    const periodText=isWeekly?getWeekRange(date):dateLabel(date);
    const taskRows=todayTasks.map((t,i)=>`<tr style="background:${i%2===0?'#fff':'#f9fafb'};"><td style="text-align:center;font-size:16px;">${t.done?'✅':'○'}</td><td>${t.text||'—'}</td><td style="text-align:center;font-size:12px;font-weight:600;color:${t.done?'#166534':'#334155'};">${t.done?'완료':'예정'}</td></tr>`).join('');
    const nextRows=nextTasks.map((t,i)=>`<tr style="background:${i%2===0?'#fff':'#f9fafb'};"><td style="text-align:center;color:#6366f1;font-weight:700;">${i+1}</td><td>${t.text||'—'}</td></tr>`).join('');
    const weekSection=isWeekly&&weekNote?`<div class="section"><div class="sec-title">주간 종합 의견</div><div class="issues">${weekNote.replace(/\n/g,'<br>')}</div></div>`:'';
    const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:12px;color:#111;background:#fff;}
.page{max-width:700px;margin:20px auto;}
.hdr{background:#312e81;color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0;}
.hdr-co{font-size:14px;font-weight:700;letter-spacing:2px;}
.hdr-title{font-size:20px;font-weight:900;letter-spacing:6px;}
.info{background:#eef2ff;border:1px solid #c7d2fe;border-top:none;padding:10px 20px;display:flex;gap:28px;font-size:12px;color:#334155;flex-wrap:wrap;}
.info strong{color:#312e81;font-weight:700;}
.section{margin-top:14px;}
.sec-title{background:#4f46e5;color:#fff;padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:1px;border-radius:4px 4px 0 0;}
table{width:100%;border-collapse:collapse;}
th{background:#f0f0f0;padding:7px 10px;font-size:11px;font-weight:700;text-align:left;border:1px solid #ddd;}
td{padding:7px 10px;border:1px solid #ddd;font-size:12px;vertical-align:middle;}
.issues{border:1px solid #ddd;border-top:none;padding:14px 16px;min-height:72px;line-height:1.9;font-size:13px;white-space:pre-wrap;background:#fafafa;}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #ddd;margin-top:16px;border-radius:4px;overflow:hidden;}
.sig-cell{border-right:1px solid #ddd;padding:8px 12px;min-height:52px;}
.sig-cell:last-child{border-right:none;}
.sig-label{font-size:10px;color:#666;font-weight:700;}
.footer{margin-top:14px;text-align:center;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px;}
@media print{@page{margin:15mm;}body{font-size:11px;}.no-print{display:none!important;}}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div><div class="hdr-co">태림전자공업㈜</div><div style="font-size:10px;opacity:0.6;margin-top:3px;">${CO_ADDR}</div></div>
    <div class="hdr-title">${titleText}</div>
  </div>
  <div class="info">
    <span><strong>기간:</strong> ${periodText}</span>
    <span><strong>작성자:</strong> ${author||'—'}</span>
    <span><strong>출력일:</strong> ${new Date().toLocaleDateString('ko-KR')}</span>
  </div>
  <div class="section">
    <div class="sec-title">${isWeekly?'주간':'금일'} 수행 업무</div>
    <table><thead><tr><th style="width:36px;">완료</th><th>업무 내용</th><th style="width:56px;">상태</th></tr></thead><tbody>${taskRows}</tbody></table>
  </div>
  <div class="section">
    <div class="sec-title">특이사항 / 비고</div>
    <div class="issues">${issues.replace(/\n/g,'<br>')||'해당 없음'}</div>
  </div>
  <div class="section">
    <div class="sec-title">${isWeekly?'차주':'익일'} 예정 업무</div>
    <table><thead><tr><th style="width:28px;">No.</th><th>예정 업무</th></tr></thead><tbody>${nextRows}</tbody></table>
  </div>
  ${weekSection}
  <div class="sig">
    <div class="sig-cell"><div class="sig-label">작 성</div></div>
    <div class="sig-cell"><div class="sig-label">검 토</div></div>
    <div class="sig-cell"><div class="sig-label">승 인</div></div>
  </div>
  <div class="footer">태림전자공업㈜ &nbsp;|&nbsp; ${CO_ADDR} &nbsp;|&nbsp; Tel: ${CO_TEL} &nbsp;|&nbsp; © ${new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD.</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){alert('팝업이 차단되어 있습니다.\n브라우저에서 팝업을 허용해주세요.'); return;}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };

  const FL=({text})=><div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>{text}</div>;

  return (
    <div>
      <div style={CARD}>
        <SecHead icon="📝" title="업무 보고서 작성" />
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'flex-end', marginBottom:4 }}>
          <div>
            <FL text="보고 유형" />
            <div style={{ display:'flex', background:C.white, border:`1px solid ${C.border}`, borderRadius:20, overflow:'hidden' }}>
              {[['daily','일일 보고'],['weekly','주간 보고']].map(([v,label])=>(
                <button key={v} onClick={()=>setReportType(v)} style={{ ...btn(reportType===v?'active':'inactive'), borderRadius:0, height:34 }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ flex:1, minWidth:160 }}>
            <FL text={reportType==='weekly'?'해당 주 날짜 (아무 날이나)':'보고 날짜'} />
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ ...baseInput, background:C.white }} />
          </div>
          <div style={{ flex:1, minWidth:140 }}>
            <FL text="작성자" />
            <input value={author} onChange={e=>saveAuthor(e.target.value)} placeholder="이름 입력" style={{ ...baseInput, background:C.white }} />
          </div>
        </div>
        <div style={{ background:C.navyBg, borderRadius:10, padding:'8px 14px', fontSize:12, color:C.navyMid, marginTop:10 }}>
          {reportType==='weekly'?`📅 보고 기간: ${getWeekRange(date)}`:`📅 보고 날짜: ${dateLabel(date)}`}
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="✅" title={reportType==='weekly'?'주간 수행 업무':'금일 수행 업무'}
          action={<button onClick={addTodayTask} style={{ ...btn('navyGhost'), height:28, padding:'0 12px', fontSize:12 }}>+ 항목 추가</button>} />
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {todayTasks.map((task,i)=>(
            <div key={task.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={()=>updTodayTask(task.id,'done',!task.done)}
                style={{ flexShrink:0, width:30, height:30, borderRadius:8, border:`2px solid ${task.done?C.navyMid:C.border}`, background:task.done?C.navyMid:C.white, color:'#fff', cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {task.done?'✓':''}
              </button>
              <input value={task.text} onChange={e=>updTodayTask(task.id,'text',e.target.value)}
                placeholder={`업무 항목 ${i+1}`}
                style={{ ...baseInput, flex:1, background:C.white, textDecoration:task.done?'line-through':'none', color:task.done?C.textSub:C.text }} />
              <span style={{ fontSize:11, color:task.done?C.green:C.textHint, minWidth:36, textAlign:'center', fontWeight:600, flexShrink:0 }}>{task.done?'완료':'예정'}</span>
              {todayTasks.length>1 && (
                <button onClick={()=>delTodayTask(task.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textHint, fontSize:18, lineHeight:1, padding:'0 4px', flexShrink:0 }}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={CARD}>
        <SecHead icon="⚠" title="특이사항 / 비고" />
        <textarea value={issues} onChange={e=>setIssues(e.target.value)} rows={4}
          placeholder="특이사항이 없으면 비워두세요."
          style={{ ...baseInput, background:C.white, resize:'vertical', lineHeight:1.85 }} />
      </div>

      <div style={CARD}>
        <SecHead icon="📌" title={reportType==='weekly'?'차주 예정 업무':'익일 예정 업무'}
          action={<button onClick={addNextTask} style={{ ...btn('navyGhost'), height:28, padding:'0 12px', fontSize:12 }}>+ 항목 추가</button>} />
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {nextTasks.map((task,i)=>(
            <div key={task.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ flexShrink:0, width:26, height:26, borderRadius:6, background:C.navyBg, color:C.navyMid, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>{i+1}</span>
              <input value={task.text} onChange={e=>updNextTask(task.id,e.target.value)}
                placeholder={`예정 업무 ${i+1}`}
                style={{ ...baseInput, flex:1, background:C.white }} />
              {nextTasks.length>1 && (
                <button onClick={()=>delNextTask(task.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textHint, fontSize:18, lineHeight:1, padding:'0 4px', flexShrink:0 }}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {reportType==='weekly' && (
        <div style={CARD}>
          <SecHead icon="📊" title="주간 종합 의견" />
          <textarea value={weekNote} onChange={e=>setWeekNote(e.target.value)} rows={4}
            placeholder="주간 성과, 이슈, 개선점 등을 입력하세요."
            style={{ ...baseInput, background:C.white, resize:'vertical', lineHeight:1.85 }} />
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginTop:8 }}>
        <button onClick={handlePrint} style={btn('primary')}>🖨️ PDF 출력 / 인쇄</button>
        <span style={{ fontSize:12, color:C.textSub, alignSelf:'center' }}>서명란 포함 A4 양식으로 출력됩니다</span>
      </div>
    </div>
  );
}

// ─── 계약서 파일 버튼 ──────────────────────────────────────────
function ContractFileBtn({ tenantId, tenantName }) {
  const key=`tl_contract_${tenantId}`;
  const [files,setFiles]=useState(()=>store.get(key)||[]);
  const [open,setOpen]=useState(false);
  const [imgModal,setImgModal]=useState(null);
  const fileRef=useRef(null);

  const upload=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const dataUrl=await compressImage(file,1600,0.85);
    if(!dataUrl) return;
    const next=[...files,{id:Date.now(),name:file.name,url:dataUrl,uploadedAt:new Date().toISOString()}];
    setFiles(next); store.set(key,next);
  };
  const del=(id)=>{ const next=files.filter(f=>f.id!==id); setFiles(next); store.set(key,next); };

  return (
    <>
      <button onClick={()=>setOpen(true)}
        style={{ ...btn(files.length>0?'navyGhost':'secondary'), flex:1, justifyContent:'center', position:'relative' }}>
        📑 계약서{files.length>0?` (${files.length})`:''}
      </button>

      {open && (
        <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:20, width:'min(90vw,560px)', maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background:`linear-gradient(135deg,${C.navyDark},${C.navyMid})`, color:'#fff', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>📑 {tenantName} 계약서</div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>업로드된 계약서 {files.length}건</div>
              </div>
              <button onClick={()=>setOpen(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:13 }}>✕ 닫기</button>
            </div>
            <div style={{ padding:20, overflowY:'auto', flex:1 }}>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={upload} />
              <button onClick={()=>{ fileRef.current.value=''; fileRef.current.click(); }}
                style={{ ...btn('primary'), width:'100%', height:44, marginBottom:16, fontSize:14 }}>
                📷 계약서 사진/파일 추가
              </button>
              {files.length===0 && <div style={{ textAlign:'center', color:C.textHint, padding:'24px 0', fontSize:13 }}>업로드된 계약서가 없습니다.</div>}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {files.map((f,i)=>(
                  <div key={f.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
                    <img src={f.url} alt={f.name} style={{ width:'100%', height:120, objectFit:'cover', cursor:'zoom-in', display:'block' }} onClick={()=>setImgModal(f.url)} />
                    <div style={{ padding:'8px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontSize:11, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>p.{i+1}</div>
                        <div style={{ fontSize:10, color:C.textHint }}>{new Date(f.uploadedAt).toLocaleDateString('ko-KR')}</div>
                      </div>
                      <button onClick={()=>del(f.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.red, fontSize:16 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {imgModal && (
        <div onClick={()=>setImgModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={imgModal} alt="계약서" style={{ maxWidth:'95vw', maxHeight:'95vh', borderRadius:8 }} onClick={e=>e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

// ─── 비상연락망 ────────────────────────────────────────────────
const DEFAULT_CONTACTS = [
  {id:1, name:'박형준', role:'대표이사 / 소방대장', floor:'대표', phone:''},
  {id:2, name:'박장혁', role:'소방안전관리자 2급', floor:'소방관리자', phone:''},
  {id:3, name:'', role:'4층 담당', floor:'4층', phone:''},
  {id:4, name:'', role:'3층 담당', floor:'3층', phone:''},
  {id:5, name:'', role:'2층 담당', floor:'2층', phone:''},
  {id:6, name:'', role:'1층 담당', floor:'1층', phone:''},
];

function EmergencyContactsPanel() {
  const [contacts,setContacts]=useState(()=>store.get('tl_emerg_contacts')||DEFAULT_CONTACTS);
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(contacts);

  const save=()=>{ setContacts(draft); store.set('tl_emerg_contacts',draft); setEditing(false); };
  const upD=(id,f,v)=>setDraft(d=>d.map(c=>c.id===id?{...c,[f]:v}:c));

  const BoxStyle=(color,bg)=>({
    background:bg, border:`2px solid ${color}`, borderRadius:14, padding:'14px 18px',
    textAlign:'center', minWidth:130, flex:1,
  });

  return (
    <div>
      <div style={{ ...CARD, background:'linear-gradient(135deg,#7f1d1d,#991b1b)', color:'#fff', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:16, fontWeight:900, letterSpacing:'-0.3px' }}>🔥 긴급 호출 비상 연락망 (소방)</div>
            <div style={{ fontSize:12, opacity:0.8, marginTop:3 }}>태림전자공업㈜ · 소방안전관리 비상연락체계</div>
            <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{CO_ADDR}</div>
          </div>
          <button onClick={()=>{ setDraft(contacts); setEditing(!editing); }}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 14px', color:'#fff', cursor:'pointer', fontSize:12, fontFamily:'inherit' }}>
            {editing?'취소':'✏ 편집'}
          </button>
        </div>
      </div>

      {editing ? (
        <div style={CARD}>
          <SecHead icon="✏" title="연락망 편집" />
          {draft.map(c=>(
            <div key={c.id} style={{ display:'flex', gap:10, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:C.textSub, minWidth:100, flexShrink:0 }}>{c.role}</span>
              <input value={c.name} onChange={e=>upD(c.id,'name',e.target.value)} placeholder="이름" style={{ ...baseInput, flex:1, minWidth:100, background:C.white }} />
              <input value={c.phone} onChange={e=>upD(c.id,'phone',e.target.value)} placeholder="010-0000-0000" style={{ ...baseInput, flex:1, minWidth:130, background:C.white }} />
            </div>
          ))}
          <button onClick={save} style={btn('primary')}>💾 저장</button>
        </div>
      ) : (
        <div>
          {/* 최상위: 대표이사 */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
            <div style={{ ...BoxStyle('#7f1d1d','#fef2f2'), maxWidth:220 }}>
              <div style={{ fontSize:11, color:'#7f1d1d', fontWeight:700, marginBottom:4 }}>🏢 대표이사 / 소방대장</div>
              <div style={{ fontSize:16, fontWeight:900, color:'#1a1a1a', marginBottom:6 }}>{contacts[0].name||'(미입력)'}</div>
              {contacts[0].phone && (
                <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                  <a href={`tel:${contacts[0].phone}`} style={{ background:'#dc2626', color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:11, fontWeight:700, textDecoration:'none' }}>📞 전화</a>
                  <a href={`sms:${contacts[0].phone}`} style={{ background:'#1d4ed8', color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:11, fontWeight:700, textDecoration:'none' }}>💬 문자</a>
                </div>
              )}
              {!contacts[0].phone && <div style={{ fontSize:11, color:C.textHint }}>전화번호 미입력</div>}
            </div>
          </div>

          {/* 연결선 */}
          <div style={{ display:'flex', justifyContent:'center', height:24 }}>
            <div style={{ width:2, background:'#dc2626', height:'100%', opacity:0.5 }} />
          </div>

          {/* 소방안전관리자 */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:8 }}>
            <div style={{ ...BoxStyle('#b45309','#fffbeb'), maxWidth:240 }}>
              <div style={{ fontSize:11, color:'#b45309', fontWeight:700, marginBottom:4 }}>🛡 소방안전관리자 2급</div>
              <div style={{ fontSize:15, fontWeight:800, color:'#1a1a1a', marginBottom:6 }}>{contacts[1].name||'(미입력)'}</div>
              {contacts[1].phone && (
                <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                  <a href={`tel:${contacts[1].phone}`} style={{ background:'#dc2626', color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:11, fontWeight:700, textDecoration:'none' }}>📞 전화</a>
                  <a href={`sms:${contacts[1].phone}`} style={{ background:'#1d4ed8', color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:11, fontWeight:700, textDecoration:'none' }}>💬 문자</a>
                </div>
              )}
              {!contacts[1].phone && <div style={{ fontSize:11, color:C.textHint }}>전화번호 미입력</div>}
            </div>
          </div>

          {/* 연결선 분기 */}
          <div style={{ display:'flex', justifyContent:'center', gap:0, marginBottom:0, position:'relative', height:24 }}>
            <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:'70%', height:1, background:'#dc2626', opacity:0.3 }} />
            {[0,1,2,3].map(i=>(
              <div key={i} style={{ flex:1, display:'flex', justifyContent:'center' }}>
                <div style={{ width:2, height:24, background:'#dc2626', opacity:0.3 }} />
              </div>
            ))}
          </div>

          {/* 층별 담당자 */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
            {contacts.slice(2).map((c,i)=>(
              <div key={c.id} style={{ ...BoxStyle('#1d4ed8','#eff6ff') }}>
                <div style={{ fontSize:11, color:'#1d4ed8', fontWeight:700, marginBottom:4 }}>{c.floor}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#1a1a1a', marginBottom:8 }}>{c.name||'(미입력)'}</div>
                <div style={{ fontSize:11, color:C.textSub, marginBottom:8 }}>{c.role}</div>
                {c.phone ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    <a href={`tel:${c.phone}`} style={{ background:'#dc2626', color:'#fff', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:600, textDecoration:'none', display:'block' }}>📞 {c.phone}</a>
                    <a href={`sms:${c.phone}`} style={{ background:'#1d4ed8', color:'#fff', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:600, textDecoration:'none', display:'block' }}>💬 문자</a>
                  </div>
                ) : <div style={{ fontSize:11, color:C.textHint }}>번호 미입력</div>}
              </div>
            ))}
          </div>

          <div style={{ marginTop:16, background:'#fef9c3', border:'1px solid #fde047', borderRadius:10, padding:'10px 16px', fontSize:12, color:'#854d0e', display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:16 }}>ℹ️</span>
            <span>이 연락망은 소방 관련 비상 상황 및 교육 시 활용됩니다. "편집" 버튼으로 이름/전화번호를 수정하고 공유하세요.</span>
          </div>

          {/* 소방 문서 보관함 */}
          <div style={{ ...CARD, marginTop:14, padding:'18px 20px' }}>
            <SecHead icon="📁" title="소방·안전 문서 보관함" />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
              {[
                {key:'tl_fire_plan', label:'🔥 소방 계획서'},
                {key:'tl_elevator_inspection', label:'🛗 승강기 정기점검'},
                {key:'tl_fire_equipment', label:'🧯 소방설비 점검'},
                {key:'tl_safety_edu', label:'📚 소방교육 기록'},
              ].map(({key,label})=><SafetyDocBtn key={key} storeKey={key} label={label} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SafetyDocBtn({ storeKey, label }) {
  const [files,setFiles]=useState(()=>store.get(storeKey)||[]);
  const [open,setOpen]=useState(false);
  const [imgModal,setImgModal]=useState(null);
  const fileRef=useRef(null);
  const upload=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const dataUrl=await compressImage(file,1600,0.85);
    if(!dataUrl) return;
    const next=[...files,{id:Date.now(),name:file.name,url:dataUrl,date:new Date().toISOString()}];
    setFiles(next); store.set(storeKey,next);
  };
  const del=(id)=>{ const next=files.filter(f=>f.id!==id); setFiles(next); store.set(storeKey,next); };
  return (
    <>
      <button onClick={()=>setOpen(true)} style={{ background:files.length>0?C.navyBg:C.tHead, border:`1px solid ${files.length>0?C.navyBg2:C.tBorder}`, borderRadius:12, padding:'14px 16px', cursor:'pointer', textAlign:'left', width:'100%' }}>
        <div style={{ fontSize:13, fontWeight:700, color:C.navyDark, marginBottom:4 }}>{label}</div>
        <div style={{ fontSize:11.5, color:C.textSub }}>{files.length>0?`${files.length}개 파일 저장됨`:'파일 없음 — 클릭하여 추가'}</div>
      </button>
      {open && (
        <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:20, width:'min(90vw,520px)', maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
            <div style={{ background:`linear-gradient(135deg,#7f1d1d,#dc2626)`, color:'#fff', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{label}</div>
              <button onClick={()=>setOpen(false)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:13 }}>✕ 닫기</button>
            </div>
            <div style={{ padding:20, overflowY:'auto', flex:1 }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={upload} />
              <button onClick={()=>{ fileRef.current.value=''; fileRef.current.click(); }} style={{ ...btn('primary'), width:'100%', height:44, marginBottom:14, fontSize:14 }}>📷 파일 추가 (사진 스캔)</button>
              {files.length===0 && <div style={{ textAlign:'center', color:C.textHint, padding:'20px 0', fontSize:13 }}>저장된 파일이 없습니다.</div>}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {files.map((f,i)=>(
                  <div key={f.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
                    <img src={f.url} alt={f.name} style={{ width:'100%', height:100, objectFit:'cover', cursor:'zoom-in', display:'block' }} onClick={()=>setImgModal(f.url)} />
                    <div style={{ padding:'7px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontSize:10, color:C.textHint }}>{new Date(f.date).toLocaleDateString('ko-KR')} p.{i+1}</div>
                      <button onClick={()=>del(f.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.red, fontSize:15 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {imgModal && <div onClick={()=>setImgModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}><img src={imgModal} alt="" style={{ maxWidth:'95vw', maxHeight:'95vh', borderRadius:8 }} onClick={e=>e.stopPropagation()} /></div>}
    </>
  );
}

// ─── Attendance Page (출퇴근) ──────────────────────────────────
function AttendancePage({ role }) {
  const [records,setRecords]=useState(()=>store.get('tl_attendance')||[]);
  const [tab,setTab]=useState('clock');
  const [empList,setEmpList]=useState(()=>store.get('tl_att_employees')||[{id:1,name:'박장혁',dept:'관리'}]);
  const [newEmp,setNewEmp]=useState({name:'',dept:''});
  const [filterDate,setFilterDate]=useState('');
  const [filterName,setFilterName]=useState('');
  const [empMsg,setEmpMsg]=useState('');

  const userName=store.get('tl_user_name')||'직원';
  const today=new Date().toISOString().split('T')[0];
  const now=()=>new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});

  const todayRec=records.filter(r=>r.date===today&&r.name===userName);
  const lastIn=todayRec.filter(r=>r.type==='in').at(-1);
  const lastOut=todayRec.filter(r=>r.type==='out').at(-1);
  const alreadyIn=!!lastIn && (!lastOut || new Date(`${today}T${lastIn.time}`)<new Date(`${today}T${lastOut.time}`)?false:true);

  const punch=(type)=>{
    const rec={id:Date.now(),name:userName,date:today,time:now(),type,ts:new Date().toISOString()};
    const next=[rec,...records];
    setRecords(next); store.set('tl_attendance',next);
  };

  const addEmp=()=>{
    if(!newEmp.name.trim()){ setEmpMsg('⚠ 이름 입력 필요'); setTimeout(()=>setEmpMsg(''),2000); return; }
    const empNo=`EMP-${String(empList.length+1).padStart(3,'0')}`;
    const next=[...empList,{id:Date.now(),empNo,...newEmp}];
    setEmpList(next); store.set('tl_att_employees',next);
    setNewEmp({name:'',dept:''});
  };
  const delEmp=(id)=>{ const next=empList.filter(e=>e.id!==id); setEmpList(next); store.set('tl_att_employees',next); };

  const filteredRecs=records.filter(r=>{
    if(filterDate&&r.date!==filterDate) return false;
    if(filterName&&!r.name.includes(filterName)) return false;
    if(role==='staff'&&r.name!==userName) return false;
    return true;
  });

  const exportCSV=()=>{
    const rows=[['날짜','이름','구분','시각'],...filteredRecs.map(r=>[r.date,r.name,r.type==='in'?'출근':'퇴근',r.time])];
    const csv=rows.map(r=>r.join(',')).join('\n');
    const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`출퇴근기록_${today}.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  };

  const groupByDate=()=>{
    const map={};
    filteredRecs.forEach(r=>{ if(!map[r.date]) map[r.date]={}; if(!map[r.date][r.name]) map[r.date][r.name]={in:'',out:''}; if(r.type==='in'&&!map[r.date][r.name].in) map[r.date][r.name].in=r.time; if(r.type==='out') map[r.date][r.name].out=r.time; });
    return map;
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:15, fontWeight:700, color:C.navyDark }}>출퇴근 관리</span>
          <span style={{ background:role==='master'?'#f5f3ff':role==='admin'?'#fef9c3':'#eff6ff', color:role==='master'?'#6d28d9':role==='admin'?'#854d0e':'#1d4ed8', border:'1px solid currentColor', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
            {role==='master'?'🔑 마스터':role==='admin'?'👑 대표':'👤 직원'}&nbsp;{userName}
          </span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[['clock','출퇴근'],['records','기록 조회'],...((role==='admin'||role==='master')?[['emp','직원 관리']]:[])].map(([v,l])=>(
            <button key={v} onClick={()=>setTab(v)} style={{ ...btn(tab===v?'primary':'secondary'), height:34 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* 출퇴근 */}
      {tab==='clock' && (
        <div>
          <div style={{ ...CARD, background:`linear-gradient(135deg,${C.navyDark},${C.navyMid})`, color:'#fff' }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:13, opacity:0.7, marginBottom:4 }}>{new Date().toLocaleDateString('ko-KR',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
              <div style={{ fontSize:36, fontWeight:900, letterSpacing:'-1px' }}>{userName}</div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:12, padding:'14px', textAlign:'center' }}>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>출근</div>
                <div style={{ fontSize:20, fontWeight:800 }}>{lastIn?lastIn.time:'--:--'}</div>
              </div>
              <div style={{ background:'rgba(255,255,255,0.1)', borderRadius:12, padding:'14px', textAlign:'center' }}>
                <div style={{ fontSize:11, opacity:0.7, marginBottom:4 }}>퇴근</div>
                <div style={{ fontSize:20, fontWeight:800 }}>{lastOut?lastOut.time:'--:--'}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <button onClick={()=>punch('in')}
                style={{ background:'#fff', color:'#16a34a', border:'none', borderRadius:14, padding:'18px', fontSize:18, fontWeight:900, cursor:'pointer', boxShadow:'0 4px 16px rgba(0,0,0,0.2)', letterSpacing:'-0.3px' }}>
                ✅ 출 근
              </button>
              <button onClick={()=>punch('out')}
                style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:14, padding:'18px', fontSize:18, fontWeight:900, cursor:'pointer', letterSpacing:'-0.3px' }}>
                🏃 퇴 근
              </button>
            </div>
          </div>

          {/* 오늘 기록 */}
          {todayRec.length>0 && (
            <div style={CARD}>
              <SecHead icon="📅" title="오늘 기록" />
              {todayRec.map(r=>(
                <div key={r.id} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid ${C.tBorder}` }}>
                  <span style={{ background:r.type==='in'?C.greenBg:C.blueBg, color:r.type==='in'?C.green:C.blue, border:`1px solid ${r.type==='in'?C.greenBorder:C.blueBorder}`, borderRadius:6, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{r.type==='in'?'출근':'퇴근'}</span>
                  <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{r.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 기록 조회 */}
      {tab==='records' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} style={{ ...baseInput, width:'auto', background:C.white }} />
            {(role==='admin'||role==='master') && <input value={filterName} onChange={e=>setFilterName(e.target.value)} placeholder="이름 검색" style={{ ...baseInput, width:140, background:C.white }} />}
            {filterDate&&<button onClick={()=>{ setFilterDate(''); setFilterName(''); }} style={{ ...btn('ghost'), height:34, fontSize:12 }}>초기화</button>}
            {(role==='admin'||role==='master') && <button onClick={exportCSV} style={{ ...btn('navyGhost'), height:34, marginLeft:'auto' }}>⬇ CSV 내보내기</button>}
          </div>
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', boxShadow:sh.card }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:440 }}>
                <thead><tr>{[['날짜','left',100],['이름','left',90],['출근','center',90],['퇴근','center',90],['근무시간','right',90]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(groupByDate()).sort(([a],[b])=>b.localeCompare(a)).flatMap(([date,names])=>
                    Object.entries(names).map(([name,times],i)=>{
                      let workTime='—';
                      if(times.in&&times.out){
                        const [ih,im]=times.in.split(':').map(Number);
                        const [oh,om]=times.out.split(':').map(Number);
                        const diff=(oh*60+om)-(ih*60+im);
                        if(diff>0) workTime=`${Math.floor(diff/60)}h ${diff%60}m`;
                      }
                      return (
                        <tr key={date+name} style={{ background:i%2===0?C.white:C.tAlt }}>
                          <td style={TD('left',{fontSize:12})}>{date}</td>
                          <td style={TD('left',{fontWeight:500})}>{name}</td>
                          <td style={TD('center',{color:C.green,fontWeight:600})}>{times.in||'—'}</td>
                          <td style={TD('center',{color:C.blue,fontWeight:600})}>{times.out||'—'}</td>
                          <td style={TD('right',{fontSize:12,color:C.textSub})}>{workTime}</td>
                        </tr>
                      );
                    })
                  )}
                  {Object.keys(groupByDate()).length===0 && <tr><td colSpan={5} style={{ ...TD('center'), color:C.textHint, padding:'32px' }}>기록이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 직원 관리 (admin/master) */}
      {tab==='emp' && (role==='admin'||role==='master') && (
        <div style={CARD}>
          <SecHead icon="👥" title="직원 목록 관리" />
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div><div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>이름</div><input value={newEmp.name} onChange={e=>setNewEmp(v=>({...v,name:e.target.value}))} placeholder="이름" style={{ ...baseInput, background:C.white, width:120 }} /></div>
            <div><div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>부서/직책</div><input value={newEmp.dept} onChange={e=>setNewEmp(v=>({...v,dept:e.target.value}))} placeholder="예: 관리/청소" style={{ ...baseInput, background:C.white, width:140 }} /></div>
            <button onClick={addEmp} style={{ ...btn('primary'), height:36 }}>+ 추가</button>
            {empMsg && <span style={{ fontSize:12, color:C.red }}>{empMsg}</span>}
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{[['사번','left',90],['이름','left'],['부서/직책','left'],['','center',40]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
            <tbody>
              {empList.map((e,i)=>(
                <tr key={e.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                  <td style={TD('left',{fontFamily:'monospace',fontSize:12,fontWeight:700,color:C.navy})}>{e.empNo||`EMP-${String(i+1).padStart(3,'0')}`}</td>
                  <td style={TD('left',{fontWeight:500})}>{e.name}</td>
                  <td style={TD('left',{color:C.textSub,fontSize:12})}>{e.dept||'—'}</td>
                  <td style={TD('center')}><button onClick={()=>delEmp(e.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.red, fontSize:16 }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Approval Page (전자결재 + 긴급호출) ──────────────────────
const ACCT_CODES = ['현금','보통예금(018)','보통예금(032)','MMF','외상매출금','미수금','선급금','임대보증금','임대수입','관리비수입','전기요금수익','수도요금수익','잡수입','전기요금','수도요금','수선비','경상비','통신비','소모품비','임차료','차량유지비','급여','복리후생비','접대비','세금과공과','감가상각비','잡비'];

function ApprovalPage({ role }) {
  const [items,setItems]=useState(()=>store.get('tl_approvals')||[]);
  const [tab,setTab]=useState(role==='admin'?'pending':'submit');
  const [form,setForm]=useState({type:'report',title:'',content:'',urgent:false});
  const [reviewNotes,setReviewNotes]=useState({});
  const [flash,setFlash]=useState({text:'',ok:true});
  const [sending,setSending]=useState(false);
  const [confirmEmerg,setConfirmEmerg]=useState(false);
  const [emergLog,setEmergLog]=useState(()=>store.get('tl_emergency_log')||[]);
  const [emergCool,setEmergCool]=useState(false);
  const [renotifyAt,setRenotifyAt]=useState(null);
  const authorName=store.get('tl_user_name')||role;

  const saveItems=(next)=>{ setItems(next); store.set('tl_approvals',next); };
  const tg=()=>({ token:store.get('tl_telegram_token'), admin:store.get('tl_telegram_admin'), staff:store.get('tl_telegram_staff') });
  const msg=(text,ok=true)=>{ setFlash({text,ok}); setTimeout(()=>setFlash({text:'',ok:true}),5000); };

  // 재알림 체크 (5분 후 미확인 시 재전송)
  useEffect(()=>{
    if(!renotifyAt) return;
    const t=setTimeout(async()=>{
      const {token,admin}=tg();
      const res=await sendTelegram(token,admin,`🔔 <b>재알림: 긴급 호출 미확인</b>\n\n아직 확인되지 않은 긴급 호출이 있습니다.\n발신시각: ${new Date(renotifyAt).toLocaleString('ko-KR')}\n\n<b>즉시 확인하세요!</b>`);
      setRenotifyAt(null);
      msg(res.ok?'⚠ 5분 후 재알림 전송됨':'⚠ 재알림 전송 실패');
    },5*60*1000);
    return ()=>clearTimeout(t);
  },[renotifyAt]);

  const submitApproval=async()=>{
    if(!form.title.trim()){ msg('제목을 입력하세요.',false); return; }
    const item={id:Date.now(),type:form.type,urgent:form.urgent,title:form.title.trim(),content:form.content.trim(),author:authorName,submittedAt:new Date().toISOString(),status:'pending',reviewNote:'',reviewedAt:null};
    saveItems([item,...items]);
    setForm({type:'report',title:'',content:'',urgent:false});
    const {token,admin}=tg();
    if(token&&admin){
      const urgTag=form.urgent?'🚨 <b>[긴급]</b> ':'';
      const typeMap={report:'📋 업무보고',request:'📝 결재요청',leave:'🗓 휴가/조퇴'};
      const txt=`${urgTag}${typeMap[form.type]||''} <b>결재 요청</b>\n\n작성자: ${authorName}\n제목: <b>${form.title}</b>\n\n${form.content?form.content.slice(0,400):'(내용 없음)'}\n\n🕒 ${new Date().toLocaleString('ko-KR')}\n\n👉 <i>아래 링크로 접속 후 전자결재 탭에서 확인 가능</i>`;
      const res=await sendTelegram(token,admin,txt);
      msg(res.ok?`✓ 제출 완료 · 대표님께 Telegram 알림 전송됨`:`✓ 제출 완료 (Telegram 미설정 또는 오류: ${res.err})`);
    } else { msg('✓ 결재 요청 제출 완료 (Telegram 미설정)'); }
  };

  const doReview=async(id,status)=>{
    const note=reviewNotes[id]||'';
    const next=items.map(a=>a.id===id?{...a,status,reviewNote:note,reviewedAt:new Date().toISOString()}:a);
    saveItems(next);
    const item=items.find(a=>a.id===id);
    const {token,staff}=tg();
    if(token&&staff&&item){
      const statusTxt=status==='approved'?'✅ <b>승인</b>':'❌ <b>반려</b>';
      await sendTelegram(token,staff,`${statusTxt}\n\n제목: ${item.title}${note?`\n비고: ${note}`:''}\n\n🕒 ${new Date().toLocaleString('ko-KR')}`);
    }
    setReviewNotes(p=>{const n={...p};delete n[id];return n;});
    msg(status==='approved'?'✅ 승인 처리됐습니다.':'❌ 반려 처리됐습니다.');
  };

  const doEmergency=async()=>{
    setSending(true); setConfirmEmerg(false);
    const log={id:Date.now(),at:new Date().toISOString(),confirmed:false};
    const next=[log,...emergLog].slice(0,50);
    setEmergLog(next); store.set('tl_emergency_log',next);
    const {token,admin,staff}=tg();
    let sent=false;
    if(token&&admin){
      const res=await sendTelegram(token,admin,`🚨🚨🚨 <b>긴급 호출</b> 🚨🚨🚨\n\n발신자: ${authorName}\n시각: ${new Date().toLocaleString('ko-KR')}\n\n<b>즉시 확인이 필요합니다!</b>\n\n태림전자공업㈜ 긴급 알림 시스템`);
      sent=res.ok;
      if(staff&&staff!==admin) await sendTelegram(token,staff,`🚨 긴급 호출 발송됨\n발신: ${authorName} · 시각: ${new Date().toLocaleString('ko-KR')}`);
    }
    setSending(false);
    setEmergCool(true); setTimeout(()=>setEmergCool(false),10*60*1000);
    if(sent) setRenotifyAt(Date.now());
    msg(sent?'🚨 긴급 알림 전송 완료! 5분 내 미확인 시 재전송됩니다.':'⚠ 알림 전송 실패. 설정 > Telegram 설정을 확인하세요.',sent);
  };

  const confirmEmergency=(id)=>{
    const next=emergLog.map(e=>e.id===id?{...e,confirmed:true}:e);
    setEmergLog(next); store.set('tl_emergency_log',next);
    setRenotifyAt(null);
    msg('✓ 긴급 호출 확인 처리됐습니다.');
  };

  const pending=items.filter(a=>a.status==='pending');
  const sb=(s)=>s==='pending'?{l:'대기중',bg:C.amberBg,c:C.amber,b:C.amberBorder}:s==='approved'?{l:'승인됨',bg:C.greenBg,c:C.green,b:C.greenBorder}:{l:'반려됨',bg:C.redBg,c:C.red,b:C.redBorder};
  const typeMap={report:'업무보고',request:'결재요청',leave:'휴가/조퇴'};

  return (
    <div>
      {/* 긴급호출 패널 */}
      <div style={{ background:'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)', borderRadius:16, padding:'18px 22px', marginBottom:16, boxShadow:'0 8px 32px rgba(220,38,38,0.35)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14 }}>
          <div style={{ color:'#fff' }}>
            <div style={{ fontSize:16, fontWeight:900, letterSpacing:'-0.3px', marginBottom:4 }}>🚨 긴급 호출</div>
            <div style={{ fontSize:12, opacity:0.85, marginBottom:3 }}>누르면 대표님 Telegram에 즉시 알림 · 5분 후 미확인 시 재전송</div>
            {emergLog.length>0 && <div style={{ fontSize:11, opacity:0.65 }}>최근 호출: {new Date(emergLog[0].at).toLocaleString('ko-KR')} {emergLog[0].confirmed&&'(확인됨)'}</div>}
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {emergLog.length>0&&!emergLog[0].confirmed&&role==='admin' && (
              <button onClick={()=>confirmEmergency(emergLog[0].id)}
                style={{ background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.4)', borderRadius:10, padding:'10px 16px', fontSize:13, cursor:'pointer', fontWeight:600 }}>
                ✓ 확인 완료
              </button>
            )}
            {confirmEmerg ? (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={doEmergency} disabled={sending} style={{ background:'#fff', color:'#dc2626', border:'none', borderRadius:10, padding:'12px 22px', fontWeight:900, fontSize:15, cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
                  {sending?'전송 중…':'확인 — 전송'}
                </button>
                <button onClick={()=>setConfirmEmerg(false)} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:10, padding:'12px 16px', fontSize:13, cursor:'pointer' }}>취소</button>
              </div>
            ) : (
              <button onClick={()=>setConfirmEmerg(true)} disabled={emergCool}
                style={{ background:emergCool?'rgba(255,255,255,0.25)':'#fff', color:emergCool?'rgba(255,255,255,0.5)':'#dc2626', border:'none', borderRadius:12, padding:'14px 32px', fontWeight:900, fontSize:17, cursor:emergCool?'not-allowed':'pointer', boxShadow:emergCool?'none':'0 4px 20px rgba(0,0,0,0.25)', letterSpacing:'-0.3px' }}>
                {emergCool?'⏳ 쿨다운 (10분)':'🚨 긴급 호출'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 역할 & 알림 상태 */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:15, fontWeight:700, color:C.navyDark }}>전자결재</span>
          <span style={{ background:role==='admin'?'#fef9c3':'#eff6ff', color:role==='admin'?'#854d0e':'#1d4ed8', border:`1px solid ${role==='admin'?'#fde047':'#bfdbfe'}`, borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:700 }}>
            {role==='admin'?'👑 대표 계정':'👤 직원 계정'}&nbsp;({authorName})
          </span>
        </div>
        {pending.length>0 && <div style={{ background:C.redBg, border:`1px solid ${C.redBorder}`, borderRadius:20, padding:'4px 14px', fontSize:13, color:C.red, fontWeight:700 }}>결재 대기 {pending.length}건</div>}
      </div>

      {flash.text && <div style={{ background:flash.ok?C.greenBg:C.redBg, border:`1px solid ${flash.ok?C.greenBorder:C.redBorder}`, borderRadius:10, padding:'11px 16px', fontSize:13, color:flash.ok?C.green:C.red, marginBottom:12, fontWeight:500 }}>{flash.text}</div>}

      {/* 탭 */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {[
          ...(role==='staff'||role==='master'?[['submit','✏ 결재 요청']]:[]),
          ['pending',`⏳ 결재 대기${pending.length>0?` (${pending.length})`:''}`],
          ['history','📋 결재 현황'],
          ['contacts','🔥 비상연락망'],
          ...((role==='admin'||role==='master')?[['emerglog','🚨 긴급 로그']]:[]),
        ].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{ ...btn(tab===v?'primary':'secondary'), height:36 }}>{l}</button>
        ))}
      </div>

      {/* 결재 요청 (직원) */}
      {tab==='submit' && role==='staff' && (
        <div style={CARD}>
          <SecHead icon="📝" title="결재 요청 작성" />
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
            {[['report','📋 업무보고'],['request','📝 결재요청'],['leave','🗓 휴가/조퇴']].map(([v,l])=>(
              <button key={v} onClick={()=>setForm(f=>({...f,type:v}))} style={{ ...btn(form.type===v?'active':'ghost'), height:34 }}>{l}</button>
            ))}
            <button onClick={()=>setForm(f=>({...f,urgent:!f.urgent}))}
              style={{ ...btn(form.urgent?'danger':'secondary'), height:34 }}>
              {form.urgent?'🚨 긴급':'긴급 아님'}
            </button>
          </div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>제목</div>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="결재 제목 입력" style={{ ...baseInput, background:C.white }} />
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>내용 (보고 사항, 이유 등)</div>
            <textarea value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))} rows={7}
              placeholder="업무 내용, 요청 사유 등을 입력하세요." style={{ ...baseInput, background:C.white, resize:'vertical', lineHeight:1.9 }} />
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={submitApproval} style={btn('primary')}>📤 결재 요청 제출 (대표님께 Telegram 알림)</button>
          </div>
        </div>
      )}

      {/* 결재 대기 */}
      {tab==='pending' && (
        <div>
          {pending.length===0 ? (
            <div style={{ ...CARD, textAlign:'center', color:C.textSub, padding:'3rem', fontSize:14 }}>대기 중인 결재 항목이 없습니다. ✓</div>
          ) : pending.map(item=>(
            <div key={item.id} style={{ ...CARD, borderLeft:`4px solid ${item.urgent?C.red:C.navy}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, flexWrap:'wrap', gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                  {item.urgent && <span style={{ background:C.redBg, color:C.red, border:`1px solid ${C.redBorder}`, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>🚨 긴급</span>}
                  <span style={{ background:C.navyBg, color:C.navyMid, borderRadius:6, padding:'2px 8px', fontSize:11 }}>{typeMap[item.type]||item.type}</span>
                  <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{item.title}</span>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:C.textSub }}>{item.author} · {new Date(item.submittedAt).toLocaleString('ko-KR')}</div>
                </div>
              </div>
              {item.content && <div style={{ background:C.navyBg, borderRadius:10, padding:'12px 14px', fontSize:13, color:C.textMid, lineHeight:1.8, marginBottom:12, whiteSpace:'pre-wrap' }}>{item.content}</div>}
              {role==='admin' && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                  <input value={reviewNotes[item.id]||''} onChange={e=>setReviewNotes(n=>({...n,[item.id]:e.target.value}))}
                    placeholder="비고 입력 (선택사항)" style={{ ...baseInput, flex:1, minWidth:160, background:C.white }} />
                  <button onClick={()=>doReview(item.id,'approved')} style={btn('success')}>✅ 승인</button>
                  <button onClick={()=>doReview(item.id,'rejected')} style={btn('danger')}>❌ 반려</button>
                </div>
              )}
              {role==='staff' && <div style={{ fontSize:12, color:C.textSub }}>대표님 결재 대기 중…</div>}
            </div>
          ))}
        </div>
      )}

      {/* 결재 현황 */}
      {tab==='history' && (
        <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', boxShadow:sh.card }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:580 }}>
              <thead><tr>{[['유형','left',80],['제목','left'],['작성자','left',80],['상태','center',90],['요청일','right',110],['처리일','right',110]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
              <tbody>
                {items.length===0 && <tr><td colSpan={6} style={{ ...TD('center'), color:C.textHint, padding:'32px' }}>결재 내역이 없습니다.</td></tr>}
                {items.map((item,i)=>{
                  const s=sb(item.status);
                  return (
                    <tr key={item.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                      <td style={TD('left')}><span style={{ background:C.navyBg, color:C.navyMid, borderRadius:6, padding:'2px 7px', fontSize:11 }}>{typeMap[item.type]||item.type}</span></td>
                      <td style={TD('left',{fontWeight:500})}>{item.urgent&&<span style={{ color:C.red, marginRight:4, fontSize:12 }}>🚨</span>}{item.title}{item.reviewNote&&<span style={{ fontSize:11, color:C.textSub, marginLeft:6 }}>({item.reviewNote})</span>}</td>
                      <td style={TD('left',{fontSize:12,color:C.textSub})}>{item.author}</td>
                      <td style={TD('center')}><span style={{ background:s.bg, color:s.c, border:`1px solid ${s.b}`, borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{s.l}</span></td>
                      <td style={TD('right',{fontSize:11,color:C.textSub})}>{new Date(item.submittedAt).toLocaleDateString('ko-KR')}</td>
                      <td style={TD('right',{fontSize:11,color:C.textSub})}>{item.reviewedAt?new Date(item.reviewedAt).toLocaleDateString('ko-KR'):'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {items.length>0 && <div style={{ padding:'8px 14px', textAlign:'right' }}><button onClick={()=>{ if(window.confirm('결재 내역을 전체 삭제하시겠습니까?')){ saveItems([]); } }} style={{ ...btn('danger'), height:28, fontSize:11 }}>내역 전체 삭제</button></div>}
        </div>
      )}

      {/* 비상연락망 */}
      {tab==='contacts' && <EmergencyContactsPanel />}

      {/* 긴급 로그 (대표) */}
      {tab==='emerglog' && (role==='admin'||role==='master') && (
        <div style={CARD}>
          <SecHead icon="🚨" title="긴급 호출 기록" />
          {emergLog.length===0 ? <div style={{ textAlign:'center', color:C.textSub, padding:'2rem' }}>기록 없음</div> : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{[['No.','center',44],['호출 시각','left'],['상태','center',100],['경과','right',100]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
              <tbody>
                {emergLog.map((e,i)=>(
                  <tr key={e.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                    <td style={TD('center',{color:C.red,fontWeight:700})}>{i+1}</td>
                    <td style={TD('left')}>{new Date(e.at).toLocaleString('ko-KR')}</td>
                    <td style={TD('center')}><span style={{ background:e.confirmed?C.greenBg:C.amberBg, color:e.confirmed?C.green:C.amber, border:`1px solid ${e.confirmed?C.greenBorder:C.amberBorder}`, borderRadius:20, padding:'2px 10px', fontSize:12 }}>{e.confirmed?'확인됨':'미확인'}</span></td>
                    <td style={TD('right',{color:C.textSub,fontSize:12})}>{Math.round((Date.now()-new Date(e.at).getTime())/60000)}분 전</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 크로스 디바이스 안내 */}
      <div style={{ marginTop:16, background:'#fefce8', border:'1px solid #fde047', borderRadius:12, padding:'12px 16px' }}>
        <div style={{ fontSize:12.5, fontWeight:700, color:'#854d0e', marginBottom:4 }}>📱 대표님 Telegram 연동 필요</div>
        <div style={{ fontSize:12, color:'#713f12', lineHeight:1.8 }}>
          결재 요청·긴급호출은 <b>Telegram으로 대표님 폰에 즉시 전달</b>됩니다.<br/>
          설정 탭 → "Telegram 알림 설정"에서 봇 토큰과 대표님 Chat ID를 등록하세요.
        </div>
      </div>
    </div>
  );
}

// ─── Voucher Page (전표) ──────────────────────────────────────
function VoucherPage({ role }) {
  const [vouchers,setVouchers]=useState(()=>store.get('tl_vouchers')||[]);
  const [tab,setTab]=useState('write');
  const [vType,setVType]=useState('transfer'); // transfer/income/expense
  const [form,setForm]=useState({date:new Date().toISOString().split('T')[0],debitAcct:'',creditAcct:'',account:'',amount:'',note:'',payee:'',file:null,fileUrl:null});
  const [filter,setFilter]=useState({type:'all',month:''});
  const [flash,setFlash]=useState('');
  const [imgModal,setImgModal]=useState(null);
  const fileRef=useRef(null);
  const authorName=store.get('tl_user_name')||role;

  const msg=(t)=>{ setFlash(t); setTimeout(()=>setFlash(''),3000); };
  const saveV=(next)=>{ setVouchers(next); store.set('tl_vouchers',next); };

  const handleFile=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    const dataUrl=await compressImage(file);
    if(!dataUrl) return;
    setForm(f=>({...f,file:file.name,fileUrl:dataUrl}));
  };

  const getVNo=(type)=>{
    const prefix=type==='transfer'?'분':'income'?'입':'출';
    const count=vouchers.filter(v=>v.type===type).length+1;
    const yy=new Date().getFullYear()%100;
    return `${prefix}-${yy}${String(count).padStart(3,'0')}`;
  };

  const submitVoucher=()=>{
    const amt=Number(String(form.amount).replace(/,/g,''));
    if(!amt||amt<=0){ msg('⚠ 금액을 입력하세요.'); return; }
    if(vType==='transfer'&&(!form.debitAcct||!form.creditAcct)){ msg('⚠ 차변·대변 계정과목을 선택하세요.'); return; }
    if(vType!=='transfer'&&!form.account){ msg('⚠ 계정과목을 선택하세요.'); return; }
    const v={
      id:Date.now(), vno:getVNo(vType), type:vType,
      date:form.date, amount:amt, note:form.note,
      debitAcct:form.debitAcct, creditAcct:form.creditAcct,
      account:form.account, payee:form.payee,
      fileUrl:form.fileUrl, fileName:form.file,
      author:authorName, createdAt:new Date().toISOString(),
      status:'draft',
    };
    saveV([v,...vouchers]);
    setForm({date:new Date().toISOString().split('T')[0],debitAcct:'',creditAcct:'',account:'',amount:'',note:'',payee:'',file:null,fileUrl:null});
    msg('✓ 전표가 저장됐습니다.');
    setTab('list');
  };

  const deleteV=(id)=>{ if(window.confirm('삭제하시겠습니까?')) saveV(vouchers.filter(v=>v.id!==id)); };

  const handlePrint=(v)=>{
    const typeLabel={'transfer':'대체전표','income':'입금전표','expense':'출금전표'};
    const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:12px;color:#111;}
.page{max-width:650px;margin:16px auto;}
.hdr{background:#312e81;color:#fff;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:6px 6px 0 0;}
.box{border:1.5px solid #000;border-top:none;padding:14px 18px;}
.row{display:flex;gap:16px;margin-bottom:10px;}
.field{flex:1;}.field-label{font-size:10px;color:#555;margin-bottom:2px;}.field-val{font-size:13px;font-weight:600;border-bottom:1px solid #aaa;padding-bottom:3px;}
.amount{font-size:22px;font-weight:900;text-align:right;border:2px solid #000;padding:10px 16px;margin:12px 0;letter-spacing:1px;}
.note{border:1px solid #aaa;padding:10px;min-height:50px;margin-bottom:10px;font-size:13px;}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #000;margin-top:14px;}
.sig-cell{border-right:1px solid #000;padding:6px 10px;min-height:44px;}.sig-cell:last-child{border-right:none;}
.sig-label{font-size:10px;color:#555;font-weight:700;}
.footer{font-size:10px;color:#999;text-align:center;margin-top:8px;border-top:1px solid #eee;padding-top:6px;}
@media print{@page{margin:12mm;}}
</style></head><body>
<div class="page">
  <div class="hdr">
    <div style="font-size:14px;font-weight:700;letter-spacing:2px;">태림전자공업㈜</div>
    <div style="font-size:20px;font-weight:900;letter-spacing:5px;">${typeLabel[v.type]||'전표'}</div>
    <div style="text-align:right;font-size:11px;opacity:0.8;">전표번호: ${v.vno}</div>
  </div>
  <div class="box">
    <div class="row">
      <div class="field"><div class="field-label">작성일자</div><div class="field-val">${v.date}</div></div>
      <div class="field"><div class="field-label">작성자</div><div class="field-val">${v.author}</div></div>
      <div class="field"><div class="field-label">전표번호</div><div class="field-val">${v.vno}</div></div>
    </div>
    ${v.type==='transfer'?`<div class="row">
      <div class="field"><div class="field-label">차변 (Debit)</div><div class="field-val">${v.debitAcct}</div></div>
      <div class="field"><div class="field-label">대변 (Credit)</div><div class="field-val">${v.creditAcct}</div></div>
    </div>`:`<div class="row">
      <div class="field"><div class="field-label">계정과목</div><div class="field-val">${v.account}</div></div>
      <div class="field"><div class="field-label">${v.type==='income'?'입금처':'지출처'}</div><div class="field-val">${v.payee||'—'}</div></div>
    </div>`}
    <div class="amount">₩ ${Number(v.amount).toLocaleString('ko-KR')} 원</div>
    <div style="font-size:10px;color:#555;margin-bottom:3px;">적요 (내용)</div>
    <div class="note">${v.note||'—'}</div>
    <div class="sig">
      <div class="sig-cell"><div class="sig-label">작 성</div></div>
      <div class="sig-cell"><div class="sig-label">검 토</div></div>
      <div class="sig-cell"><div class="sig-label">승 인</div></div>
    </div>
  </div>
  <div class="footer">태림전자공업㈜ · ${CO_ADDR} · Tel: ${CO_TEL} · © ${new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD.</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){ alert('팝업이 차단됐습니다. 팝업 허용 후 다시 시도하세요.'); return; }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };

  const displayV=vouchers.filter(v=>{
    if(filter.type!=='all'&&v.type!==filter.type) return false;
    if(filter.month&&!v.date.startsWith(filter.month)) return false;
    return true;
  });
  const typeLabel={'transfer':'대체전표','income':'입금전표','expense':'출금전표'};
  const typeBadge={'transfer':{bg:'#f5f5f5',c:'#1a1a1a',b:'#ddd'},'income':{bg:C.redBg,c:C.red,b:C.redBorder},'expense':{bg:C.blueBg,c:C.blue,b:C.blueBorder}};
  const totalIncome=displayV.filter(v=>v.type==='income').reduce((s,v)=>s+v.amount,0);
  const totalExpense=displayV.filter(v=>v.type==='expense').reduce((s,v)=>s+v.amount,0);

  const acctSelect=(field,label)=>(
    <div>
      <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>{label}</div>
      <select value={form[field]} onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
        style={{ ...baseInput, background:C.white, cursor:'pointer' }}>
        <option value="">-- 선택 --</option>
        {ACCT_CODES.map(a=><option key={a} value={a}>{a}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <span style={{ fontSize:15, fontWeight:700, color:C.navyDark }}>전표 관리</span>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setTab('write')} style={{ ...btn(tab==='write'?'primary':'secondary'), height:34 }}>✏ 전표 작성</button>
          <button onClick={()=>setTab('list')} style={{ ...btn(tab==='list'?'primary':'secondary'), height:34 }}>📋 전표 목록 ({vouchers.length})</button>
        </div>
      </div>

      {tab==='write' && (
        <div style={CARD}>
          <SecHead icon="📄" title="전표 작성" />
          {/* 전표 종류 */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {[['transfer','⇄ 대체전표'],['income','↓ 입금전표'],['expense','↑ 출금전표']].map(([v,l])=>(
              <button key={v} onClick={()=>setVType(v)} style={{ ...btn(vType===v?'active':'secondary'), flex:1, minWidth:100, height:40, fontSize:13 }}>{l}</button>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>날짜</div>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{ ...baseInput, background:C.white }} />
            </div>
            <div>
              <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>금액 (원)</div>
              <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" style={{ ...baseInput, background:C.white, textAlign:'right', fontVariantNumeric:'tabular-nums', fontSize:15, fontWeight:700 }} />
            </div>
          </div>

          {vType==='transfer' ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              {acctSelect('debitAcct','차변 계정과목 (Debit ↑)')}
              {acctSelect('creditAcct','대변 계정과목 (Credit ↓)')}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
              {acctSelect('account','계정과목')}
              <div>
                <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>{vType==='income'?'입금처':'지출처'}</div>
                <input value={form.payee} onChange={e=>setForm(f=>({...f,payee:e.target.value}))} placeholder={vType==='income'?'예) 한국웨지우드마케팅㈜':'예) 한국전력공사'} style={{ ...baseInput, background:C.white }} />
              </div>
            </div>
          )}

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:4 }}>적요 (내용)</div>
            <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} rows={3} placeholder="거래 내용, 메모 등" style={{ ...baseInput, background:C.white, resize:'vertical', lineHeight:1.8 }} />
          </div>

          {/* 영수증 첨부 */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:6 }}>영수증 첨부 (선택)</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
            {form.fileUrl ? (
              <div style={{ position:'relative', display:'inline-block' }}>
                <img src={form.fileUrl} alt="영수증" style={{ height:90, borderRadius:8, border:`1px solid ${C.border}`, cursor:'pointer', objectFit:'cover' }} onClick={()=>setImgModal(form.fileUrl)} />
                <button onClick={()=>setForm(f=>({...f,file:null,fileUrl:null}))} style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', borderRadius:'50%', width:20, height:20, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              </div>
            ) : (
              <button onClick={()=>{ fileRef.current.value=''; fileRef.current.click(); }} style={{ ...btn('secondary'), height:40 }}>📎 사진 첨부</button>
            )}
          </div>

          {flash && <div style={{ background:flash.startsWith('⚠')?C.redBg:C.greenBg, border:`1px solid ${flash.startsWith('⚠')?C.redBorder:C.greenBorder}`, borderRadius:8, padding:'9px 14px', fontSize:13, color:flash.startsWith('⚠')?C.red:C.green, marginBottom:10 }}>{flash}</div>}
          <button onClick={submitVoucher} style={btn('primary')}>💾 전표 저장</button>
        </div>
      )}

      {tab==='list' && (
        <div>
          {/* 필터 + 요약 */}
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <select value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))} style={{ ...baseInput, width:'auto', background:C.white, padding:'6px 12px', cursor:'pointer' }}>
              <option value="all">전체</option>
              <option value="transfer">대체전표</option>
              <option value="income">입금전표</option>
              <option value="expense">출금전표</option>
            </select>
            <input type="month" value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))} style={{ ...baseInput, width:'auto', background:C.white }} />
            {(filter.type!=='all'||filter.month) && <button onClick={()=>setFilter({type:'all',month:''})} style={{ ...btn('ghost'), height:34, fontSize:12 }}>필터 초기화</button>}
            {totalIncome>0&&<span style={{ fontSize:12.5, color:C.green, fontWeight:600, marginLeft:'auto' }}>입금 {fmt(totalIncome)}원</span>}
            {totalExpense>0&&<span style={{ fontSize:12.5, color:C.red, fontWeight:600 }}>출금 {fmt(totalExpense)}원</span>}
          </div>
          <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', boxShadow:sh.card }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:640 }}>
                <thead><tr>{[['전표번호','left',90],['날짜','left',100],['구분','left',80],['계정','left'],['금액','right',130],['첨부','center',44],['','center',80]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
                <tbody>
                  {displayV.length===0 && <tr><td colSpan={7} style={{ ...TD('center'), color:C.textHint, padding:'32px' }}>전표가 없습니다.</td></tr>}
                  {displayV.map((v,i)=>{
                    const tb=typeBadge[v.type]||typeBadge.transfer;
                    return (
                      <tr key={v.id} style={{ background:i%2===0?C.white:C.tAlt }}>
                        <td style={TD('left',{fontWeight:600,color:C.navy,fontSize:12})}>{v.vno}</td>
                        <td style={TD('left',{fontSize:12})}>{v.date}</td>
                        <td style={TD('left')}><span style={{ background:tb.bg, color:tb.c, border:`1px solid ${tb.b}`, borderRadius:6, padding:'2px 7px', fontSize:11 }}>{typeLabel[v.type]}</span></td>
                        <td style={TD('left',{fontSize:12})}>{v.type==='transfer'?`${v.debitAcct} → ${v.creditAcct}`:(v.account+(v.payee?` (${v.payee})`:'')||(v.note||'—'))}</td>
                        <td style={TD('right',{fontWeight:700,color:v.type==='income'?C.blue:v.type==='expense'?C.red:C.text})}>{fmt(v.amount)}원</td>
                        <td style={TD('center')}>{v.fileUrl&&<span style={{ cursor:'pointer', fontSize:16 }} onClick={()=>setImgModal(v.fileUrl)}>📎</span>}</td>
                        <td style={TD('center')}>
                          <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                            <button onClick={()=>handlePrint(v)} style={{ ...btn('navyGhost'), height:26, padding:'0 8px', fontSize:11 }}>출력</button>
                            <button onClick={()=>deleteV(v.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textHint, fontSize:16, lineHeight:1 }}>×</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {imgModal && (
        <div onClick={()=>setImgModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out' }}>
          <img src={imgModal} alt="영수증" style={{ maxWidth:'92vw', maxHeight:'90vh', borderRadius:8 }} onClick={e=>e.stopPropagation()} />
          <button onClick={()=>setImgModal(null)} style={{ position:'fixed', top:18, right:22, background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', color:'#fff', borderRadius:'50%', width:36, height:36, fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── Page Footer ───────────────────────────────────────────────
function PageFooter() {
  return (
    <footer style={{ background:`linear-gradient(135deg,${C.navyDark},#1e1b4b)`, color:'rgba(255,255,255,0.45)', padding:'20px 24px', marginTop:24, textAlign:'center', fontSize:11 }}>
      <div style={{ maxWidth:980, margin:'0 auto' }}>
        <div style={{ marginBottom:5, fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.8)', letterSpacing:'0.5px' }}>태림전자공업㈜ &nbsp;·&nbsp; TAE LIM ELECTRONICS CO., LTD.</div>
        <div style={{ marginBottom:3, fontSize:11 }}>{CO_ADDR}</div>
        <div style={{ marginBottom:10, fontSize:11 }}>Tel: {CO_TEL}&nbsp;&nbsp;|&nbsp;&nbsp;Fax: {CO_FAX}</div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:10, fontSize:10, color:'rgba(255,255,255,0.3)' }}>
          © {new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD. All Rights Reserved. &nbsp;|&nbsp; 관리비 청구 시스템 v3.0
        </div>
      </div>
    </footer>
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
  const [role,setRole]=useState('staff');
  const [userProfile,setUserProfile]=useState(null);
  const [savedPw,setSavedPw]=useState(()=>store.get('tl_pw')||DEFAULT_PASSWORD);
  const [adminPw,setAdminPw]=useState(()=>store.get('tl_admin_pw')||'admin2024');
  const [masterPw,setMasterPw]=useState(()=>store.get('tl_master_pw')||'master2024');
  const [page,setPage]=useState('input');
  const [approvals,setApprovals]=useState(()=>store.get('tl_approvals')||[]);
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
  // Firebase 로그인
  const handleLogin=async(email,password)=>{
    try {
      const cred=await signInWithEmailAndPassword(auth,email,password);
      const snap=await getDoc(doc(db,'users',cred.user.uid));
      if(!snap.exists()){ await signOut(auth); return {ok:false,error:'사용자 정보가 없습니다.'}; }
      const profile=snap.data();
      if(!profile.approved){ await signOut(auth); return {ok:false,error:'관리자 승인 대기 중입니다. 대표님께 문의하세요.'}; }
      setRole(profile.role||'staff');
      setUserProfile(profile);
      store.set('tl_user_name',profile.name||email);
      setLoggedIn(true);
      return {ok:true};
    } catch(e){
      const msg={'auth/user-not-found':'등록되지 않은 이메일입니다.','auth/wrong-password':'비밀번호가 올바르지 않습니다.','auth/invalid-credential':'이메일 또는 비밀번호가 올바르지 않습니다.','auth/too-many-requests':'로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'};
      return {ok:false, error:msg[e.code]||e.message};
    }
  };
  const handleSetPw=(pw)=>{ setSavedPw(pw); store.set('tl_pw',pw); };
  const handleSetAdminPw=(pw)=>{ setAdminPw(pw); store.set('tl_admin_pw',pw); };
  const handleSetTenants=(t)=>{ setTenants(t); store.set('tl_tenants',t); };
  const pendingCount=(store.get('tl_approvals')||[]).filter(a=>a.status==='pending').length;

  if(!loggedIn) return <LoginPage onLogin={handleLogin} />;
  const calc=calcAll(reading);

  return (
    <div style={{ fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", minHeight:'100vh', background:C.pageBg }}>
      <Header page={page} setPage={setPage} onLogout={async()=>{ await signOut(auth); setLoggedIn(false); setRole('staff'); setUserProfile(null); store.set('tl_user_name',''); }} role={role} pendingCount={pendingCount} />
      <main style={{ padding:'20px 24px', maxWidth:980, margin:'0 auto' }}>
        {page==='input'     && <InputPage    reading={reading} onChange={onChange} onSave={onSave} saveMsg={saveMsg} />}
        {page==='invoice'   && <InvoicePage  reading={reading} tenants={tenants} calc={calc} />}
        {page==='quarterly' && <QuarterlyPage history={history} tenants={tenants} />}
        {page==='history'   && <HistoryPage  history={history} onLoad={(h)=>{ onChange(h); setPage('input'); }} onUpdate={(updated)=>{ setHistory(updated); store.set('tl_history',updated); }} />}
        {page==='tenant'    && <TenantPage   tenants={tenants} setTenants={handleSetTenants} role={role} />}
        {page==='finance'   && <FinancePage  />}
        {page==='notice'    && <NoticePage   />}
        {page==='approval'  && <ApprovalPage role={role} />}
        {page==='voucher'   && <VoucherPage  role={role} />}
        {page==='attendance'&& <AttendancePage role={role} />}
        {page==='report'    && <WorkReportPage />}
        {page==='settings'  && <SettingsPage savedPassword={savedPw} setSavedPassword={handleSetPw} adminPw={adminPw} setAdminPw={handleSetAdminPw} masterPw={masterPw} setMasterPw={(p)=>{ setMasterPw(p); store.set('tl_master_pw',p); }} tenants={tenants} setTenants={handleSetTenants} reading={reading} role={role} />}
      </main>
      <PageFooter />
    </div>
  );
}
