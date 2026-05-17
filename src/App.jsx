import { useState, Fragment, useEffect, useRef, useMemo } from "react";
/* global XLSX */
import { auth, db } from './firebase';
import { supabase } from './supabase';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup
} from 'firebase/auth';
import {
  doc, setDoc, getDoc, collection, addDoc,
  query, orderBy, onSnapshot, updateDoc, where, getDocs, serverTimestamp, deleteDoc
} from 'firebase/firestore';

const DEFAULT_PASSWORD = "test";
// 추가 사용자 — 이메일과 권한 매핑 (모두 master, 비번 test)
const EXTRA_USERS_DEFAULTS = [
  { id:'ceo',       name:'CEO',       formal:'박형준',  role:'master', pw:'test', email:'ceo@taelim.co'       },
  { id:'taelim',    name:'태림',      formal:'태림전자', role:'master', pw:'test', email:'taelim@taelim.co'    },
  { id:'janghyeuk', name:'장혁',      formal:'장혁',    role:'master', pw:'test', email:'janghyeuk@taelim.co' },
];
function getExtraUsers(){
  const overrides=(typeof localStorage!=='undefined')?(JSON.parse(localStorage.getItem('tl_user_pw_overrides')||'null')||{}):{};
  return EXTRA_USERS_DEFAULTS.map(u=>({ ...u, pw: overrides[u.id]||u.pw }));
}
const CO_ADDR = "우08377 서울특별시 구로구 디지털로 33길 58";
const CO_TEL  = "02-867-2000";
const CO_FAX  = "02-863-6750";
// 공급자(태림) 세금계산서 발행 정보
const CO_NAME     = "태림전자공업㈜";
const CO_BIZ_NO   = "113-81-18542";
const CO_CEO      = "박형준";
const CO_BIZ_TYPE = "제조";
const CO_BIZ_ITEM = "소형 모터";
const CO_EMAIL    = "janghyeuk@gmail.com";

const INITIAL_TENANTS = [
  { id:'wedgwood', name:'한국웨지우드', fullName:'한국웨지우드마케팅㈜', floor:'1층', suffix:'01', rent:5400000, mgmtArea:133, elevator:0,    deposit:54000000, area:439.67, contractStart:'2024-12-11', contractEnd:'2025-12-10', mgmtFee:400000, email:'janghyeuk@kakao.com' },
  { id:'taeha',   name:'태하무역',    fullName:'㈜태하무역',            floor:'2층', suffix:'02', rent:3750000, mgmtArea:160, elevator:44353,  deposit:45650000, area:481.16, contractStart:'2024-11-01', contractEnd:'2025-10-31', email:'janghyeuk@naver.com' },
  { id:'yuyeon',  name:'유연어패럴',  fullName:'유연어패럴',            floor:'3층', suffix:'03', rent:4125000, mgmtArea:200, elevator:44353,  deposit:35000000, area:481.3,  contractStart:'', contractEnd:'', email:'janghyeuk@nate.com' },
];
// 청구서 발송 시 본인이 사본 받을 BCC 주소
const INVOICE_BCC = 'ceo@taelim.co';

const INITIAL_ACCOUNTS = {
  acct018: { label:'보통018', prev:0, curr:0 },
  acct032: { label:'보통032', prev:0, curr:0 },
  mmf:     { label:'MMF',    prev:0, curr:0 },
  cash:    { label:'현금',   prev:0, curr:0 },
};
const ACCT_ORDER = ['acct018','acct032','mmf','cash'];
const ACCT_COLOR = {
  acct018: { bg:'#dbeafe', fg:'#1e40af', border:'#bfdbfe', short:'018' },
  acct032: { bg:'#e0e7ff', fg:'#3730a3', border:'#c7d2fe', short:'032' },
  mmf:     { bg:'#d1fae5', fg:'#047857', border:'#a7f3d0', short:'MMF' },
  cash:    { bg:'#fef3c7', fg:'#92400e', border:'#fde68a', short:'현금' },
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
  // 1월 검침 → 2월 청구 (수도는 격월: 1월=X)
  {
    periodStart:'2026-01-08', periodEnd:'2026-02-07', waterCalc:'X',
    elec:{ w1_220:{prev:3809,curr:3825}, t2_220:{prev:5626,curr:5648}, t2_380:{prev:8144,curr:8147}, y3_220:{prev:5012,curr:5045}, y3_380:{prev:20661,curr:25420}, o4_220:{prev:5258,curr:5285} },
    water:{ w1:{prev:1889,curr:1893}, t2:{prev:3303,curr:3310}, y3:{prev:3428,curr:3456}, o4:{prev:919,curr:925} },
    elecBill:{basicFee:974700,powerFund:97140,totalAmount:4057480,vat:359804,safetyFee:300000},
    waterBill:{totalAmount:0,basicFee:32000},
    images:{}, savedAt:'2026-02-08T00:00:00.000Z',
    amounts:{ wedgwood:6993266, taeha:5238684, yuyeon:7288290 },
  },
  // 12월 검침 → 1월 청구 (수도는 격월: 12월=O — 검침값 회사에서 채울 것)
  {
    periodStart:'2025-12-08', periodEnd:'2026-01-07', waterCalc:'O',
    elec:{ w1_220:{prev:0,curr:3809}, t2_220:{prev:0,curr:5626}, t2_380:{prev:0,curr:8144}, y3_220:{prev:0,curr:5012}, y3_380:{prev:0,curr:20661}, o4_220:{prev:0,curr:5258} },
    water:{ w1:{prev:0,curr:1889}, t2:{prev:0,curr:3303}, y3:{prev:0,curr:3428}, o4:{prev:0,curr:919} },
    elecBill:{basicFee:974700,powerFund:70110,totalAmount:2929340,vat:259703,safetyFee:300000},
    waterBill:{totalAmount:60800,basicFee:32000},
    images:{}, savedAt:'2026-01-08T00:00:00.000Z',
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

  const elecPrompt = `이 이미지는 한국전력공사(KEPCO) 전기 고지서입니다. 다음 항목의 금액을 찾아 JSON으로 반환해주세요. 숫자만 포함(쉼표 없이, 음수면 - 부호 그대로):
{
  "basicFee": 기본요금(원),
  "powerFund": 전력기금 또는 전력산업기반기금(원),
  "totalAmount": "청구금액"의 값(원). 청구금액은 보통 (당월요금계 + TV수신료)이며 빨간 글씨로 강조되어 있음. 청구서 가장 아래에 있는 최종 청구금액을 그대로 사용할 것. 당월요금계가 아니라 청구금액!
  "vat": 부가가치세(원),
  "safetyFee": 전기안전관리비 또는 전기안전대행료(원). 한전 고지서에 이 항목이 없으면 0. TV수신료는 safetyFee가 아님(safetyFee=0).
}
숫자가 명확하지 않거나 찾지 못한 항목은 0. JSON 코드블록만 반환.`;

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
      model: 'claude-opus-4-7',
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

// ─── 이메일용 청구서 HTML (인라인 스타일, 이메일 클라이언트 호환) ──
function buildInvoiceEmailHtml(tenant, reading, calc) {
  const billingNo = getBillingNo(reading.periodEnd);
  const billingMonth = getBillingMonth(reading.periodEnd);
  const fKey = tenant.id==='wedgwood'?'w1':tenant.id==='taeha'?'t2':'y3';
  const { kwh, totalKwh, elecDetail:ed, floorElec, waterCharges } = calc;
  const elecFee = floorElec[fKey]||0;
  const waterFee = reading.waterCalc==='O'?(waterCharges[fKey]||0):0;
  const mgmtFee = tenant.mgmtFee!=null?tenant.mgmtFee:tenant.mgmtArea*2500;
  const elevatorFee = tenant.elevator||0;
  const mgmtTotal = elecFee+waterFee+mgmtFee+elevatorFee;
  const mgmtVat = Math.floor(mgmtTotal*0.1);
  const rentVat = Math.floor(tenant.rent*0.1);
  const grandTotal = tenant.rent+rentVat+mgmtTotal+mgmtVat;
  const elecUsage = totalKwh>0?Math.round(ed.netElecFee*(kwh[fKey]||0)/totalKwh):0;
  const detailRow = (label, desc, amt) =>
    `<tr><td style="padding:7px 12px;font-size:12.5px;border-bottom:1px solid #eee;">${label}</td>`+
    `<td style="padding:7px 12px;font-size:11px;color:#666;border-bottom:1px solid #eee;">${desc}</td>`+
    `<td style="padding:7px 12px;text-align:right;font-size:12.5px;border-bottom:1px solid #eee;font-variant-numeric:tabular-nums;">${fmt(amt)} 원</td></tr>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;color:#0f172a;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 0;">
  <tr><td align="center">
    <table cellpadding="0" cellspacing="0" border="0" width="640" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
      <tr><td style="background:linear-gradient(135deg,#3730a3,#6366f1);padding:24px 28px;color:#fff;">
        <div style="font-size:11px;letter-spacing:2px;opacity:0.85;">TAE LIM ELECTRONICS</div>
        <div style="font-size:22px;font-weight:900;margin-top:4px;">${CO_NAME}</div>
        <div style="font-size:13px;opacity:0.85;margin-top:2px;">${billingMonth} 관리비 청구서 · No. ${billingNo}-${tenant.suffix}</div>
      </td></tr>
      <tr><td style="padding:22px 28px;">
        <div style="font-size:13px;color:#475569;margin-bottom:18px;line-height:1.7;">
          <strong style="color:#0f172a;">${tenant.fullName}</strong> 귀중<br/>
          평소 협조해 주셔서 감사합니다. ${billingMonth} 관리비 청구서를 안내드립니다.<br/>
          (검침 기간: ${reading.periodStart} ~ ${reading.periodEnd})
        </div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:18px;background:#f8fafc;border-radius:10px;overflow:hidden;">
          <tr>
            <td style="padding:14px 18px;font-size:13px;color:#64748b;font-weight:600;">이번 달 청구 총액 <span style="font-size:11px;color:#94a3b8;">(VAT 포함)</span></td>
            <td style="padding:14px 18px;text-align:right;font-size:24px;font-weight:900;color:#3730a3;font-variant-numeric:tabular-nums;">${fmt(grandTotal)} 원</td>
          </tr>
        </table>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-bottom:22px;">
          <tr style="background:#f1f5f9;">
            <th align="left"  style="padding:10px 12px;font-size:12px;color:#475569;font-weight:700;border-bottom:2px solid #cbd5e1;">구분</th>
            <th align="right" style="padding:10px 12px;font-size:12px;color:#475569;font-weight:700;border-bottom:2px solid #cbd5e1;">공급가액</th>
            <th align="right" style="padding:10px 12px;font-size:12px;color:#475569;font-weight:700;border-bottom:2px solid #cbd5e1;">부가세</th>
            <th align="right" style="padding:10px 12px;font-size:12px;color:#475569;font-weight:700;border-bottom:2px solid #cbd5e1;">합계</th>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;">임대료</td>
            <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;">${fmt(tenant.rent)}</td>
            <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;">${fmt(rentVat)}</td>
            <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;font-weight:600;">${fmt(tenant.rent+rentVat)}</td>
          </tr>
          <tr>
            <td style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;">관리비</td>
            <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;">${fmt(mgmtTotal)}</td>
            <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;">${fmt(mgmtVat)}</td>
            <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #e2e8f0;font-variant-numeric:tabular-nums;font-weight:600;">${fmt(mgmtTotal+mgmtVat)}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td colspan="3" style="padding:12px;font-size:13px;font-weight:700;border-top:2px solid #cbd5e1;">합 계</td>
            <td align="right" style="padding:12px;font-size:14px;font-weight:900;color:#3730a3;border-top:2px solid #cbd5e1;font-variant-numeric:tabular-nums;">${fmt(grandTotal)} 원</td>
          </tr>
        </table>
        <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;letter-spacing:0.5px;">◆ 관리비 산출 내역</div>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:18px;">
          ${detailRow('전기 기본요금',`${fmt(reading.elecBill.basicFee)} ÷ 4층`,ed.elecPerFloor)}
          ${detailRow('전력산업기반기금',`${fmt(reading.elecBill.powerFund)} ÷ 4층`,ed.powerFundPerFloor)}
          ${detailRow('전기 사용요금',`${fmt(kwh[fKey]||0)} kWh / ${fmt(totalKwh)} kWh`,elecUsage)}
          ${detailRow('전기안전대행료',`${fmt(reading.elecBill.safetyFee)} ÷ 4층`,ed.safetyPerFloor)}
          ${detailRow('수도료',reading.waterCalc==='O'?'사용비율 배분':'미청구',waterFee)}
          ${detailRow('관리비',tenant.mgmtFee!=null?`${fmt(tenant.mgmtFee)} (고정)`:`${tenant.mgmtArea}평 × 2,500원`,mgmtFee)}
          ${elevatorFee>0?detailRow('승강기','',elevatorFee):''}
          <tr style="background:#f8fafc;"><td colspan="2" style="padding:11px 12px;font-size:13px;font-weight:700;border-top:2px solid #cbd5e1;">관리비 합계 (부가세 별도)</td>
          <td align="right" style="padding:11px 12px;font-size:13.5px;font-weight:900;color:#0f172a;border-top:2px solid #cbd5e1;font-variant-numeric:tabular-nums;">${fmt(mgmtTotal)} 원</td></tr>
        </table>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:12px;color:#92400e;line-height:1.7;">
          ※ 본 메일은 관리비 청구서 안내입니다. 세금계산서는 별도로 발행해 드립니다.<br/>
          ※ 문의: ${CO_TEL} · ${CO_EMAIL}
        </div>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:14px 28px;font-size:11px;color:#94a3b8;text-align:center;line-height:1.7;border-top:1px solid #e2e8f0;">
        ${CO_NAME} · ${CO_ADDR}<br/>
        TEL ${CO_TEL} · FAX ${CO_FAX} · 사업자번호 ${CO_BIZ_NO}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ─── 전자세금계산서 자료 엑셀 (홈택스 일괄발행 호환) ─────────────
function exportTaxInvoice(reading, tenants, calc) {
  if (typeof XLSX === 'undefined') { alert('XLSX 라이브러리 로드 실패. 새로고침 후 다시 시도해주세요.'); return; }
  if (!tenants?.length) { alert('임차인 정보가 없습니다.'); return; }
  const writeDate = (reading.periodEnd || '').replace(/-/g,''); // YYYYMMDD
  const period    = `${reading.periodStart}~${reading.periodEnd}`;
  const ym        = (reading.periodEnd || '').slice(0,7);

  const calcTenant = (t) => {
    const fKey = t.id==='wedgwood'?'w1':t.id==='taeha'?'t2':'y3';
    const elecFee = calc.floorElec[fKey]||0;
    const waterFee = reading.waterCalc==='O'?(calc.waterCharges[fKey]||0):0;
    const mgmtFee = t.mgmtFee!=null?t.mgmtFee:t.mgmtArea*2500;
    const elevatorFee = t.elevator||0;
    const mgmtTotal = elecFee + waterFee + mgmtFee + elevatorFee;
    const rentVat = Math.floor((t.rent||0)*0.1);
    const mgmtVat = Math.floor(mgmtTotal*0.1);
    return { mgmtTotal, rentVat, mgmtVat };
  };

  // 시트1: 발행 요약 (임차인당 1행) — 한눈에 보고 홈택스 입력
  const summary = tenants.map(t => {
    const { mgmtTotal, rentVat, mgmtVat } = calcTenant(t);
    const supplyTotal = (t.rent||0) + mgmtTotal;
    const vatTotal = rentVat + mgmtVat;
    return {
      '작성일자': writeDate,
      '공급받는자_사업자번호': t.bizNo||'',
      '공급받는자_상호': t.fullName||t.name||'',
      '공급받는자_대표자': t.ceo||'',
      '공급받는자_사업장주소': t.bizAddr||'',
      '공급받는자_업태': t.bizType||'',
      '공급받는자_종목': t.bizItem||'',
      '공급받는자_이메일': t.email||'',
      '임대료_공급가액': t.rent||0,
      '임대료_세액': rentVat,
      '관리비_공급가액': mgmtTotal,
      '관리비_세액': mgmtVat,
      '공급가액_합계': supplyTotal,
      '세액_합계': vatTotal,
      '총합계금액': supplyTotal + vatTotal,
      '비고': period,
    };
  });

  // 시트2: 품목 상세 (임차인당 2행 — 임대료, 관리비) — 홈택스 일괄발행 양식과 호환
  const items = tenants.flatMap(t => {
    const { mgmtTotal, rentVat, mgmtVat } = calcTenant(t);
    const recipient = {
      '공급자_사업자번호': CO_BIZ_NO,
      '공급자_상호': CO_NAME,
      '공급자_대표자': CO_CEO,
      '공급자_주소': CO_ADDR,
      '공급자_업태': CO_BIZ_TYPE,
      '공급자_종목': CO_BIZ_ITEM,
      '공급자_이메일': CO_EMAIL,
      '공급받는자_사업자번호': t.bizNo||'',
      '공급받는자_상호': t.fullName||t.name||'',
      '공급받는자_대표자': t.ceo||'',
      '공급받는자_사업장주소': t.bizAddr||'',
      '공급받는자_업태': t.bizType||'',
      '공급받는자_종목': t.bizItem||'',
      '공급받는자_이메일': t.email||'',
    };
    return [
      { '작성일자':writeDate, ...recipient, '품목일자':writeDate, '품목명':'임대료',
        '규격':'', '수량':1, '단가':t.rent||0,
        '공급가액':t.rent||0, '세액':rentVat, '품목비고':`${t.floor||''} ${period}`.trim() },
      { '작성일자':writeDate, ...recipient, '품목일자':writeDate, '품목명':'관리비',
        '규격':'', '수량':1, '단가':mgmtTotal,
        '공급가액':mgmtTotal, '세액':mgmtVat, '품목비고':`${t.floor||''} ${period} (전기·수도·관리비 포함)`.trim() },
    ];
  });

  // 시트3: 누락 정보 안내 (사업자번호 없는 임차인 표시)
  const missing = tenants.filter(t => !t.bizNo).map(t => ({
    '임차인': t.fullName||t.name||t.id,
    '누락_항목': [!t.bizNo&&'사업자번호',!t.ceo&&'대표자',!t.bizAddr&&'사업장주소',!t.bizType&&'업태',!t.bizItem&&'종목',!t.email&&'이메일'].filter(Boolean).join(', '),
  }));

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(summary);
  ws1['!cols'] = [{wch:10},{wch:14},{wch:24},{wch:10},{wch:30},{wch:10},{wch:14},{wch:24},{wch:13},{wch:11},{wch:13},{wch:11},{wch:13},{wch:11},{wch:14},{wch:24}];
  XLSX.utils.book_append_sheet(wb, ws1, '발행요약');
  const ws2 = XLSX.utils.json_to_sheet(items);
  XLSX.utils.book_append_sheet(wb, ws2, '품목상세');
  if (missing.length) {
    const ws3 = XLSX.utils.json_to_sheet(missing);
    ws3['!cols'] = [{wch:24},{wch:50}];
    XLSX.utils.book_append_sheet(wb, ws3, '⚠ 누락정보');
  }
  XLSX.writeFile(wb, `세금계산서자료_${ym||'export'}.xlsx`);
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
      // Firebase Auth 계정 생성 + 8초 타임아웃
      const createPromise=createUserWithEmailAndPassword(auth,form.email.trim(),form.password);
      const timeoutPromise=new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),8000));
      const cred=await Promise.race([createPromise,timeoutPromise]);
      // localStorage에 프로필 저장 (Firestore 없이도 작동)
      const users=store.get('tl_fb_users')||{};
      const isFirst=Object.keys(users).length===0;
      const empNo=`EMP-${String(Object.keys(users).length+1).padStart(3,'0')}`;
      const profile={ name:form.name.trim(), email:form.email.trim(), dept:form.dept.trim(),
        role:isFirst?'master':'guest', approved:true, empNo,
        createdAt:new Date().toISOString() };
      users[cred.user.uid]=profile;
      store.set('tl_fb_users',users);
      // Firestore에도 저장 시도 (실패해도 무관)
      try { await setDoc(doc(db,'users',cred.user.uid),profile); } catch(_){}
      setDone(true);
      if(isFirst) onDone?.();
    } catch(e){
      const msg={
        'auth/email-already-in-use':'이미 사용 중인 이메일입니다. 로그인을 시도해보세요.',
        'auth/invalid-email':'이메일 형식이 올바르지 않습니다.',
        'auth/weak-password':'비밀번호가 너무 약합니다 (6자 이상).',
        'auth/operation-not-allowed':'이메일/비밀번호 가입이 비활성화되어 있습니다. (관리자 문의)',
        'auth/network-request-failed':'네트워크 오류. 인터넷 연결을 확인해주세요.',
        'auth/too-many-requests':'잠시 후 다시 시도해주세요.',
        'timeout':'연결 시간 초과. 다시 시도해주세요.',
      };
      setErr(msg[e.code]||e.message||'가입 실패. 다시 시도해주세요.');
    }
    setLoading(false);
  };

  // ─ Museum palette (홈/로그인과 동일) ─────────────────
  const paper = '#fafaf7';
  const ink   = '#1a1a1a';
  const sub   = '#6e6a64';
  const hair  = '#d9d6cf';
  const serifKR = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const serifEN = "'Cormorant Garamond', 'Times New Roman', serif";
  const sans    = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";

  const fieldLabel = { fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: '2.5px', textTransform: 'uppercase', color: sub, marginBottom: 8 };
  const fieldInput = { width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${hair}`, borderRadius:0, padding:'13px 14px', fontSize:14, color:ink, fontFamily:sans, outline:'none', transition:'border-color 0.2s' };

  const fields = [
    ['Name · 이름 *','name','text','홍길동'],
    ['Email · 이메일 *','email','email','example@email.com'],
    ['Password · 비밀번호 * (6자 이상)','password','password',''],
    ['Confirm Password · 비밀번호 확인 *','pw2','password',''],
    ['Department · 부서/직책','dept','text','예: 소방안전관리'],
  ];

  if(done) return (
    <div style={{ minHeight:'100vh', background: paper, color: ink, fontFamily: sans, padding:'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 56px)', boxSizing:'border-box', display:'flex', justifyContent:'center', alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth: 640 }}>
        <div style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, letterSpacing: '4px', textTransform: 'uppercase', color: sub, marginBottom: 20 }}>
          Tae Lim Electronics Co., Ltd.
        </div>
        <div style={{ width: 44, height: 1, background: ink, marginBottom: 24 }} />
        <h1 style={{ fontFamily: serifKR, fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 500, letterSpacing: '-1.5px', lineHeight: 1.1, color: ink, margin:'0 0 12px 0' }}>
          가입 완료
        </h1>
        <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 'clamp(17px, 2vw, 21px)', color: sub, marginBottom: 'clamp(40px, 6vw, 56px)' }}>
          Welcome aboard.
        </div>
        <div style={{ height: 1, background: ink, marginBottom: 24 }} />
        <p style={{ fontFamily: serifKR, fontSize: 17, lineHeight: 1.9, color: ink, margin: '0 0 36px 0' }}>
          바로 로그인하실 수 있습니다.<br/>
          <span style={{ fontFamily: serifEN, fontStyle:'italic', color: sub, fontSize: 15 }}>
            (초기 권한은 게스트 — 사장님께 권한 상향을 요청하세요.)
          </span>
        </p>
        <button onClick={onBack}
          style={{ width:'100%', boxSizing:'border-box', background: ink, border:'none', borderRadius:0, padding:'16px', fontSize: 12, fontWeight: 600, letterSpacing:'3.5px', textTransform:'uppercase', color:'#fff', cursor:'pointer', fontFamily: sans, transition:'background 0.15s' }}
          onMouseEnter={e=>e.currentTarget.style.background='#000'}
          onMouseLeave={e=>e.currentTarget.style.background=ink}>
          ← Back to Sign In · 로그인으로
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background: paper, color: ink, fontFamily: sans, padding:'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 56px)', boxSizing:'border-box', display:'flex', justifyContent:'center', alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth: 640 }}>

        {/* ─ Kicker ─ */}
        <div style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, letterSpacing: '4px', textTransform: 'uppercase', color: sub, marginBottom: 20 }}>
          Tae Lim Electronics Co., Ltd.
        </div>
        <div style={{ width: 44, height: 1, background: ink, marginBottom: 24 }} />

        {/* ─ Title ─ */}
        <h1 style={{ fontFamily: serifKR, fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 500, letterSpacing: '-1.5px', lineHeight: 1.1, color: ink, margin:'0 0 12px 0' }}>
          회원가입
        </h1>
        <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 'clamp(17px, 2vw, 21px)', color: sub, marginBottom: 'clamp(32px, 5vw, 48px)' }}>
          Create an account
        </div>

        {/* ─ Intro ─ */}
        <p style={{ fontFamily: serifKR, fontSize: 16, lineHeight: 1.95, color: ink, margin: '0 0 14px 0' }}>
          직원 계정을 만들어 시스템에 접근하세요.<br/>
          <span style={{ fontFamily: serifEN, fontStyle:'italic', color: sub, fontSize: 14.5 }}>
            가입 후 관리자 승인이 필요합니다.
          </span>
        </p>
        <div style={{ fontFamily: sans, fontSize: 11, letterSpacing:'1.5px', color: sub, marginBottom: 'clamp(40px, 6vw, 56px)' }}>
          관리비 청구 · 검침 관리 · 전자결재 · 긴급호출 · 전표 · 출퇴근
        </div>

        {/* ─ Form header ─ */}
        <div style={{ height: 1, background: ink, marginBottom: 20 }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 28 }}>
          <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: '3.5px', textTransform: 'uppercase', color: ink }}>
            Sign Up · 가입 신청
          </div>
          <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 12, color: sub }}>
            Staff Account
          </div>
        </div>

        {/* ─ Fields ─ */}
        {fields.map(([label,field,type,ph])=>(
          <div key={field} style={{ marginBottom: 16 }}>
            <div style={fieldLabel}>{label}</div>
            <input type={type} placeholder={ph} value={form[field]}
              onChange={e=>setForm(f=>({...f,[field]:e.target.value}))}
              onFocus={e=>e.currentTarget.style.borderColor=ink}
              onBlur={e=>e.currentTarget.style.borderColor=hair}
              style={fieldInput} />
          </div>
        ))}

        {err && <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 13, color:'#a3361f', marginTop: 4, marginBottom: 18, paddingLeft: 12, borderLeft: `2px solid #a3361f` }}>⚠ {err}</div>}

        {/* ─ Submit ─ */}
        <button onClick={submit} disabled={loading}
          style={{ width:'100%', boxSizing:'border-box', background: ink, border:'none', borderRadius:0, padding:'16px', fontSize: 12, fontWeight: 600, letterSpacing:'3.5px', textTransform:'uppercase', color:'#fff', cursor:loading?'wait':'pointer', marginTop: 8, marginBottom: 22, fontFamily: sans, transition:'background 0.15s' }}
          onMouseEnter={e=>{ if(!loading) e.currentTarget.style.background='#000'; }}
          onMouseLeave={e=>{ e.currentTarget.style.background=ink; }}>
          {loading?'Submitting…':'Submit · 가입 신청'}
        </button>

        {/* ─ Back link ─ */}
        <div style={{ textAlign:'center', marginBottom: 36 }}>
          <button onClick={onBack}
            style={{ background:'transparent', border:'none', fontFamily: serifEN, fontStyle:'italic', fontSize: 14, color: sub, cursor:'pointer', padding: 0, textDecoration:'underline', textUnderlineOffset: 3 }}>
            ← Back to Sign In · 로그인으로 돌아가기
          </button>
        </div>

        {/* ─ Footer ─ */}
        <div style={{ height: 1, background: hair, marginBottom: 14 }} />
        <div style={{ fontFamily: sans, fontSize: 9.5, letterSpacing:'2.5px', textTransform:'uppercase', color: sub, textAlign:'center' }}>
          © {new Date().getFullYear()} Tae Lim Electronics
        </div>

      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────
function LoginPage({ onLogin, onGoogleLogin }) {
  const [pw,setPw]=useState('');
  const [err,setErr]=useState('');
  const [loading,setLoading]=useState(false);
  const [gLoading,setGLoading]=useState(false);
  const [showReg,setShowReg]=useState(false);
  const [showEmail,setShowEmail]=useState(false);
  const [email,setEmail]=useState('');
  const [capsOn,setCapsOn]=useState(false);

  const go=async()=>{
    if(!pw){ setErr('비밀번호를 입력하세요.'); return; }
    setLoading(true); setErr('');
    // 이메일 비어있으면 빈 문자열로 전달 → handleLogin에서 즉시 실패 처리 (8초 대기 X)
    const result=await onLogin((email||'').trim(), pw);
    if(!result.ok){ setErr(result.error||'비밀번호가 올바르지 않습니다.'); setPw(''); }
    setLoading(false);
  };
  const googleGo=async()=>{
    setGLoading(true); setErr('');
    const result=await onGoogleLogin();
    if(!result?.ok){ setErr(result?.error||'Google 로그인 실패'); }
    setGLoading(false);
  };

  if(showReg) return <RegisterPage onBack={()=>setShowReg(false)} />;

  // ─ Museum palette (홈과 동일) ─────────────────────────
  const paper = '#fafaf7';
  const ink   = '#1a1a1a';
  const sub   = '#6e6a64';
  const hair  = '#d9d6cf';
  const serifKR = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const serifEN = "'Cormorant Garamond', 'Times New Roman', serif";
  const sans    = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";

  const fieldLabel = { fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: '2.5px', textTransform: 'uppercase', color: sub, marginBottom: 8 };
  const fieldInput = { width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${hair}`, borderRadius:0, padding:'13px 14px', fontSize:14, color:ink, fontFamily:sans, outline:'none', transition:'border-color 0.2s' };

  return (
    <div style={{ minHeight:'100vh', background: paper, color: ink, fontFamily: sans, padding:'clamp(40px, 6vw, 72px) clamp(20px, 5vw, 56px)', boxSizing:'border-box', display:'flex', justifyContent:'center', alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth: 640 }}>

        {/* ─ Kicker ─ */}
        <div style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, letterSpacing: '4px', textTransform: 'uppercase', color: sub, marginBottom: 20 }}>
          Tae Lim Electronics Co., Ltd.
        </div>
        <div style={{ width: 44, height: 1, background: ink, marginBottom: 24 }} />

        {/* ─ Title ─ */}
        <h1 style={{ fontFamily: serifKR, fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 500, letterSpacing: '-1.5px', lineHeight: 1.1, color: ink, margin:'0 0 12px 0' }}>
          태림전자공업㈜
        </h1>
        <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 'clamp(17px, 2vw, 21px)', color: sub, marginBottom: 'clamp(32px, 5vw, 48px)' }}>
          Since 1985
        </div>

        {/* ─ Hero photo ─ */}
        <figure style={{ margin: '0 0 clamp(48px, 7vw, 72px) 0' }}>
          <div style={{ aspectRatio:'16 / 9', background:'#e9e6df', overflow:'hidden' }}>
            <img src="/bg.jpg" alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', filter:'saturate(0.92)' }} />
          </div>
        </figure>

        {/* ─ Sign In header ─ */}
        <div style={{ height: 1, background: ink, marginBottom: 20 }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 28 }}>
          <div style={{ fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: '3.5px', textTransform: 'uppercase', color: ink }}>
            Sign In · 로그인
          </div>
          <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 12, color: sub }}>
            Members Only
          </div>
        </div>

        {/* ─ Google ─ */}
        <button onClick={googleGo} disabled={gLoading}
          style={{ width:'100%', boxSizing:'border-box', background:'#fff', border:`1px solid ${ink}`, padding:'14px 16px', fontSize:12, fontWeight:600, letterSpacing:'2px', textTransform:'uppercase', color:ink, cursor:gLoading?'wait':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:12, marginBottom:14, fontFamily:sans, borderRadius:0, transition:'background 0.15s' }}
          onMouseEnter={e=>{ if(!gLoading) e.currentTarget.style.background='#f3f1ec'; }}
          onMouseLeave={e=>{ e.currentTarget.style.background='#fff'; }}>
          <svg width="15" height="15" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          {gLoading?'Connecting…':'Continue with Google'}
        </button>

        {/* ─ Divider ─ */}
        <div style={{ display:'flex', alignItems:'center', gap:14, margin:'22px 0' }}>
          <div style={{ flex:1, height:1, background: hair }} />
          <span style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 13, color: sub }}>or</span>
          <div style={{ flex:1, height:1, background: hair }} />
        </div>

        {/* ─ Email (toggle) ─ */}
        {showEmail && (
          <div style={{ marginBottom: 16 }}>
            <div style={fieldLabel}>Email</div>
            <input type="email" placeholder="example@email.com" value={email}
              onChange={e=>{setEmail(e.target.value);setErr('');}}
              onKeyDown={e=>e.key==='Enter'&&go()}
              onFocus={e=>e.currentTarget.style.borderColor=ink}
              onBlur={e=>e.currentTarget.style.borderColor=hair}
              style={fieldInput} />
          </div>
        )}

        {/* ─ Password ─ */}
        <div style={{ marginBottom: 16 }}>
          <div style={fieldLabel}>Password · 비밀번호</div>
          <input type="password" placeholder="비밀번호 입력" value={pw}
            onChange={e=>{setPw(e.target.value);setErr('');}}
            onKeyDown={e=>{ if(e.key==='Enter') go(); setCapsOn(e.getModifierState&&e.getModifierState('CapsLock')); }}
            onKeyUp={e=>setCapsOn(e.getModifierState&&e.getModifierState('CapsLock'))}
            onFocus={e=>{ if(!err) e.currentTarget.style.borderColor=ink; }}
            onBlur={e=>{ if(!err) e.currentTarget.style.borderColor=hair; }}
            style={{ ...fieldInput, fontSize: 15, border: `1px solid ${err?'#a3361f':hair}` }}
            autoFocus />
          {capsOn && !err && <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 12.5, color:'#a67c2e', marginTop: 6 }}>⇪ Caps Lock 켜져 있음</div>}
          {err && <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 12.5, color:'#a3361f', marginTop: 6 }}>⚠ {err}</div>}
        </div>

        {/* ─ Submit ─ */}
        <button onClick={go} disabled={loading}
          style={{ width:'100%', boxSizing:'border-box', background: ink, border:'none', borderRadius:0, padding:'16px', fontSize: 12, fontWeight: 600, letterSpacing:'3.5px', textTransform:'uppercase', color:'#fff', cursor:loading?'wait':'pointer', marginTop: 4, marginBottom: 22, fontFamily: sans, transition:'background 0.15s' }}
          onMouseEnter={e=>{ if(!loading) e.currentTarget.style.background='#000'; }}
          onMouseLeave={e=>{ e.currentTarget.style.background=ink; }}>
          {loading?'Signing in…':'Sign In · 로그인'}
        </button>

        {/* ─ Secondary actions ─ */}
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap: 18, marginBottom: 36 }}>
          <button onClick={()=>setShowEmail(!showEmail)}
            style={{ background:'transparent', border:'none', fontFamily: serifEN, fontStyle:'italic', fontSize: 14, color: sub, cursor:'pointer', padding: 0, textDecoration:'underline', textUnderlineOffset: 3 }}>
            {showEmail?'이메일 숨기기':'이메일 로그인'}
          </button>
          <span style={{ color: hair }}>·</span>
          <button onClick={()=>setShowReg(true)}
            style={{ background:'transparent', border:'none', fontFamily: serifEN, fontStyle:'italic', fontSize: 14, color: sub, cursor:'pointer', padding: 0, textDecoration:'underline', textUnderlineOffset: 3 }}>
            회원가입
          </button>
        </div>

        {/* ─ Footer ─ */}
        <div style={{ height: 1, background: hair, marginBottom: 14 }} />
        <div style={{ fontFamily: sans, fontSize: 9.5, letterSpacing:'2.5px', textTransform:'uppercase', color: sub, textAlign:'center' }}>
          © {new Date().getFullYear()} Tae Lim Electronics
        </div>

      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────
const ALL_TABS=[['home','홈'],['gallery','갤러리'],['board','게시판'],['calendar','캘린더'],['input','검침 입력'],['invoice','청구서'],['quarterly','분기 현황'],['history','히스토리'],['tenant','임차인 현황'],['finance','자금현황'],['notice','공문'],['approval','전자결재'],['voucher','전표'],['attendance','출퇴근'],['report','업무보고'],['manual','매뉴얼'],['settings','설정']];
function tabsForRole(role){
  if(role==='guest') return [['home','홈'],['gallery','갤러리'],['board','게시판'],['notice','공문']];
  if(role==='staff') return [['home','홈'],['gallery','갤러리'],['board','게시판'],['calendar','캘린더'],['notice','공문'],['attendance','출퇴근']];
  if(role==='admin') return ALL_TABS.filter(([id])=>id!=='settings');
  return ALL_TABS;
}
function Header({ page, setPage, onLogout, role, pendingCount, userName }) {
  const baseTabs=tabsForRole(role);
  const roleStyle={
    master:{ icon:'🔑', label:'MASTER', bg:'rgba(167,139,250,0.25)', bd:'rgba(167,139,250,0.5)', fg:'#c4b5fd' },
    admin: { icon:'👑', label:'대표/이사', bg:'rgba(250,204,21,0.25)', bd:'rgba(250,204,21,0.5)', fg:'#fde047' },
    staff: { icon:'👤', label:'직원',     bg:'rgba(96,165,250,0.18)', bd:'rgba(96,165,250,0.4)', fg:'#93c5fd' },
    guest: { icon:'👁', label:'게스트',   bg:'rgba(255,255,255,0.06)', bd:'rgba(255,255,255,0.15)', fg:'rgba(255,255,255,0.55)' },
  }[role]||{ icon:'👤', label:'', bg:'rgba(255,255,255,0.08)', bd:'rgba(255,255,255,0.15)', fg:'rgba(255,255,255,0.6)' };
  return (
    <header className="tl-header" style={{ background:'rgba(49,46,129,0.97)', backdropFilter:'blur(20px) saturate(180%)', WebkitBackdropFilter:'blur(20px) saturate(180%)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px', height:54, position:'sticky', top:0, zIndex:100, boxShadow:'0 1px 0 rgba(255,255,255,0.06),0 4px 24px rgba(0,0,0,0.2)', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
      <button onClick={()=>setPage('home')} title="홈으로"
        style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0, marginRight:10, background:'transparent', border:'none', padding:0, cursor:'pointer', color:'inherit', fontFamily:'inherit' }}>
        <TLLogo size={30} />
        <div style={{ textAlign:'left' }}>
          <div style={{ fontWeight:800, fontSize:14, letterSpacing:'-0.5px' }}>태림전자공업㈜</div>
          <div style={{ fontSize:9, opacity:0.35, letterSpacing:'1px', marginTop:1 }}>MANAGEMENT SYSTEM v3.1</div>
        </div>
      </button>
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
          <span style={{ background:roleStyle.bg, border:`1px solid ${roleStyle.bd}`, borderRadius:6, padding:'3px 9px', fontSize:10.5, fontWeight:700, color:roleStyle.fg, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
            <span>{roleStyle.icon}</span>
            {userName && <span style={{ color:'#fff', fontWeight:700 }}>{userName}</span>}
            <span style={{ opacity:0.7, fontSize:9.5, letterSpacing:'0.5px' }}>{roleStyle.label}</span>
          </span>
          <button onClick={onLogout} style={{ background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:'5px 10px', fontSize:11, cursor:'pointer', color:'rgba(255,255,255,0.5)', fontFamily:'inherit', whiteSpace:'nowrap' }}>로그아웃</button>
        </div>
      </nav>
    </header>
  );
}

// ─── Home Page (환영 + 환율 + 뉴스 + 최근 공지·사진) ─────────
function HomePage({ role, setPage }) {
  const [heroV,setHeroV] = useState(0);
  const photos = store.get('tl_gallery_photos')||[];
  const notices = store.get('tl_home_notices')||[];
  const customHero = store.get('tl_home_hero');
  const heroPhoto = customHero || photos[0]?.src || '/bg.jpg';
  const canEdit = role==='master' || role==='admin';
  const fileRef = useRef(null);
  const fmtDate = (iso)=>{ const d=new Date(iso); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; };

  const [rates,setRates] = useState(null);
  const [ratesDate,setRatesDate] = useState('');
  const [ratesErr,setRatesErr] = useState(false);
  useEffect(()=>{
    fetch('https://api.frankfurter.dev/v1/latest?base=KRW&symbols=USD,EUR,JPY,CNY')
      .then(r=>r.json())
      .then(d=>{
        const inv={};
        Object.entries(d.rates||{}).forEach(([k,v])=>{ inv[k]=v>0?1/v:0; });
        if(inv.JPY) inv.JPY100 = inv.JPY*100;
        setRates(inv); setRatesDate(d.date||'');
      })
      .catch(()=>setRatesErr(true));
  },[]);

  const fmtRate=(v)=>v?Math.round(v).toLocaleString('ko-KR'):'—';
  const CCY=[
    { code:'USD', sub:'미국 1$',     val:rates?.USD    },
    { code:'EUR', sub:'유럽 1€',     val:rates?.EUR    },
    { code:'JPY', sub:'일본 100¥',   val:rates?.JPY100 },
    { code:'CNY', sub:'중국 1¥',     val:rates?.CNY    },
  ];

  const NEWS=[
    ['네이버',   'https://news.naver.com'],
    ['다음',     'https://news.daum.net'],
    ['연합뉴스', 'https://www.yna.co.kr'],
    ['YTN',      'https://www.ytn.co.kr'],
    ['조선일보', 'https://www.chosun.com'],
    ['중앙일보', 'https://www.joongang.co.kr'],
    ['한겨레',   'https://www.hani.co.kr'],
    ['BBC',      'https://www.bbc.com/news'],
  ];

  const handleHero = async (e) => {
    const file = e.target.files?.[0];
    if(fileRef.current) fileRef.current.value='';
    if(!file || !file.type.startsWith('image/')) return;
    const dataUrl = await compressImage(file, 1800, 0.85);
    if(dataUrl){ store.set('tl_home_hero', dataUrl); setHeroV(v=>v+1); }
    else alert('이미지를 불러올 수 없습니다.');
  };
  const resetHero = () => {
    if(!window.confirm('홈 메인 사진을 기본 사진으로 되돌릴까요?')) return;
    try{ localStorage.removeItem('tl_home_hero'); }catch{}
    setHeroV(v=>v+1);
  };

  // ─ Museum palette ─────────────────────────────────────
  const paper = '#fafaf7';
  const ink   = '#1a1a1a';
  const sub   = '#6e6a64';
  const hair  = '#d9d6cf';
  const serifKR = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const serifEN = "'Cormorant Garamond', 'Times New Roman', serif";
  const sans    = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";

  const kicker = {
    fontFamily: sans, fontSize: 10.5, fontWeight: 600,
    letterSpacing: '4px', textTransform: 'uppercase', color: sub,
  };
  const sectionLabel = {
    fontFamily: sans, fontSize: 10, fontWeight: 600,
    letterSpacing: '3.5px', textTransform: 'uppercase', color: ink,
  };
  const sectionMeta = {
    fontFamily: serifEN, fontStyle: 'italic', fontSize: 12, color: sub,
  };
  const ghostBtn = {
    background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)',
    border: `1px solid ${hair}`, fontFamily: sans,
    fontSize: 10.5, fontWeight: 600, letterSpacing: '1.5px',
    color: ink, padding: '7px 14px', cursor: 'pointer',
    textTransform: 'uppercase',
  };

  return (
    <div style={{
      background: paper, color: ink, fontFamily: sans,
      padding: 'clamp(48px, 7vw, 88px) clamp(24px, 5vw, 64px) clamp(64px, 8vw, 96px)',
      marginBottom: -8,
    }}>

      {/* ─ HERO ─────────────────────────────────────────── */}
      <header style={{ marginBottom: 'clamp(56px, 8vw, 88px)' }}>
        <div style={{ ...kicker, marginBottom: 22 }}>Tae Lim Electronics Co., Ltd.</div>
        <div style={{ width: 44, height: 1, background: ink, marginBottom: 26 }} />
        <h1 style={{
          fontFamily: serifKR, fontSize: 'clamp(36px, 5.5vw, 56px)',
          fontWeight: 500, letterSpacing: '-1.5px', lineHeight: 1.1,
          color: ink, margin: '0 0 14px 0',
        }}>
          태림전자공업㈜
        </h1>
        <div style={{
          fontFamily: serifEN, fontStyle: 'italic',
          fontSize: 'clamp(18px, 2.2vw, 22px)', color: sub,
          margin: '0 0 clamp(40px, 5vw, 56px) 0', fontWeight: 400,
        }}>
          Since 1985
        </div>

        <figure style={{ margin: 0, position: 'relative' }}>
          <div style={{
            aspectRatio: '16 / 9', background: '#e9e6df',
            overflow: 'hidden', position: 'relative',
          }}>
            <img key={heroV} src={heroPhoto} alt=""
              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', filter:'saturate(0.92)' }} />
            {canEdit && (
              <div style={{ position:'absolute', top:14, right:14, display:'flex', gap:8 }}>
                <label style={{ ...ghostBtn, display:'inline-flex', alignItems:'center' }}>
                  사진 변경
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleHero} />
                </label>
                {customHero && (
                  <button onClick={resetHero} style={ghostBtn}>기본</button>
                )}
              </div>
            )}
          </div>
          <figcaption style={{
            ...sectionMeta, marginTop: 16, lineHeight: 1.7,
            display:'flex', flexWrap:'wrap', gap:'4px 14px',
          }}>
            <span>{CO_ADDR}</span>
            <span style={{ color: hair }}>·</span>
            <span>T. {CO_TEL}</span>
            <span style={{ color: hair }}>·</span>
            <span>F. {CO_FAX}</span>
          </figcaption>
        </figure>
      </header>

      {/* ─ EXCHANGE ─────────────────────────────────────── */}
      <section style={{ marginBottom: 'clamp(56px, 7vw, 80px)' }}>
        <div style={{ height: 1, background: ink, marginBottom: 22 }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 26 }}>
          <div style={sectionLabel}>Exchange · KRW</div>
          <div style={sectionMeta}>
            {ratesErr ? '데이터를 불러올 수 없습니다' : ratesDate ? `Based ${ratesDate}  ·  ECB` : '…'}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 0 }}>
          {CCY.map((c,i)=>(
            <div key={c.code} style={{
              padding:'8px clamp(8px, 1.5vw, 20px) 4px',
              borderLeft: i>0 ? `1px solid ${hair}` : 'none',
              textAlign:'center',
            }}>
              <div style={{ fontFamily: serifEN, fontSize: 13, color: sub, letterSpacing:'2px', marginBottom: 10 }}>{c.code}</div>
              <div style={{ fontFamily: serifKR, fontSize: 'clamp(22px, 3vw, 30px)', color: ink, fontWeight: 500, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.3px', lineHeight:1 }}>
                {fmtRate(c.val)}
              </div>
              <div style={{ fontFamily: serifEN, fontStyle:'italic', fontSize: 11, color: sub, marginTop: 10 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─ NOTICE + GALLERY ─────────────────────────────── */}
      <section style={{
        display:'grid',
        gridTemplateColumns:'minmax(0, 1.15fr) minmax(0, 1fr)',
        gap: 'clamp(32px, 5vw, 64px)',
        marginBottom: 'clamp(56px, 7vw, 80px)',
      }}>
        <div onClick={()=>setPage('board')} style={{ cursor:'pointer' }}
          onMouseEnter={e=>{ e.currentTarget.querySelector('[data-arrow]').style.transform='translateX(4px)'; }}
          onMouseLeave={e=>{ e.currentTarget.querySelector('[data-arrow]').style.transform='translateX(0)'; }}>
          <div style={{ height: 1, background: ink, marginBottom: 22 }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 22 }}>
            <div style={sectionLabel}>Notice</div>
            <div data-arrow style={{ ...sectionMeta, transition:'transform 0.2s' }}>View all →</div>
          </div>
          {notices.length===0 ? (
            <div style={{ ...sectionMeta, padding:'8px 0' }}>등록된 공지사항이 없습니다.</div>
          ) : (
            <div>
              {notices.slice(0,4).map((n,i,arr)=>(
                <div key={n.id} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'baseline',
                  padding:'14px 0',
                  borderBottom: i < arr.length-1 ? `1px solid ${hair}` : 'none',
                }}>
                  <span style={{ fontFamily: serifKR, fontSize: 15, color: ink, fontWeight: 500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {n.title||'(제목 없음)'}
                  </span>
                  <span style={{ ...sectionMeta, fontSize: 11, whiteSpace:'nowrap', marginLeft: 14 }}>
                    {fmtDate(n.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div onClick={()=>setPage('gallery')} style={{ cursor:'pointer' }}
          onMouseEnter={e=>{ e.currentTarget.querySelector('[data-arrow]').style.transform='translateX(4px)'; }}
          onMouseLeave={e=>{ e.currentTarget.querySelector('[data-arrow]').style.transform='translateX(0)'; }}>
          <div style={{ height: 1, background: ink, marginBottom: 22 }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 22 }}>
            <div style={sectionLabel}>Gallery</div>
            <div data-arrow style={{ ...sectionMeta, transition:'transform 0.2s' }}>View all →</div>
          </div>
          {photos.length===0 ? (
            <div style={{ ...sectionMeta, padding:'8px 0' }}>등록된 사진이 없습니다.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap: 6 }}>
              {photos.slice(0,4).map(p=>(
                <div key={p.id} style={{ aspectRatio:'1/1', overflow:'hidden', background:'#e9e6df' }}>
                  <img src={p.src} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', filter:'saturate(0.92)' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─ NEWS ─────────────────────────────────────────── */}
      <section>
        <div style={{ height: 1, background: ink, marginBottom: 22 }} />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 22 }}>
          <div style={sectionLabel}>News</div>
          <div style={sectionMeta}>opens in new tab</div>
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'14px 28px' }}>
          {NEWS.map(n=>(
            <a key={n[0]} href={n[1]} target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: serifKR, fontSize: 14, fontWeight: 500,
                color: ink, textDecoration:'none', paddingBottom: 2,
                borderBottom: `1px solid ${hair}`,
                transition: 'border-color 0.2s, color 0.2s',
              }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor = ink; }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor = hair; }}>
              {n[0]}
            </a>
          ))}
        </div>
      </section>

    </div>
  );
}

// ─── Gallery Page (사진 갤러리) ─────────────────────────────
function GalleryPage({ role }) {
  const canEdit = role==='master'||role==='admin';
  const isMaster = role==='master';
  const [photos,setPhotos] = useState(()=>store.get('tl_gallery_photos')||[]);
  const [viewer,setViewer] = useState(null);
  const fileRef = useRef(null);

  const compressImage = (file)=>new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        const MAX_W = 1400;
        const ratio = Math.min(1, MAX_W/img.width);
        const w = Math.round(img.width*ratio);
        const h = Math.round(img.height*ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',0.82));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const addPhotos = async(files)=>{
    if(!files||!files.length) return;
    const adds = [];
    for(const file of Array.from(files)){
      if(!file.type.startsWith('image/')) continue;
      try {
        const dataUrl = await compressImage(file);
        adds.push({ id:Date.now()+Math.random(), src:dataUrl, caption:'', uploadedAt:new Date().toISOString() });
      } catch(err){ alert('사진 처리 실패: '+(err.message||err)); }
    }
    if(adds.length){
      const next = [...adds, ...photos];
      setPhotos(next); store.set('tl_gallery_photos',next);
    }
    if(fileRef.current) fileRef.current.value='';
  };
  const removePhoto = (id)=>{
    if(!confirm('이 사진을 삭제할까요?')) return;
    const next = photos.filter(p=>p.id!==id);
    setPhotos(next); store.set('tl_gallery_photos',next);
  };

  return (
    <div>
      <div style={CARD}>
        <SecHead icon="📷" title="사진 갤러리" action={
          canEdit && (
            <label style={{ ...btn('navyGhost'), height:30, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
              + 사진 추가
              <input ref={fileRef} type="file" accept="image/*" multiple
                onChange={e=>addPhotos(e.target.files)} style={{ display:'none' }} />
            </label>
          )
        } />
        {photos.length===0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:C.textHint, fontSize:13 }}>
            등록된 사진이 없습니다.{canEdit && ' 우측 상단 [+ 사진 추가]로 업로드하세요.'}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:10 }}>
            {photos.map(p=>(
              <div key={p.id} style={{ position:'relative', aspectRatio:'4/3', borderRadius:10, overflow:'hidden', background:'#f1f5f9', cursor:'pointer', border:`1px solid ${C.border}` }}>
                <img src={p.src} alt="" onClick={()=>setViewer(p)}
                  style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                {isMaster && (
                  <button onClick={(e)=>{ e.stopPropagation(); removePhoto(p.id); }}
                    style={{ position:'absolute', top:6, right:6, width:24, height:24, borderRadius:'50%', background:'rgba(0,0,0,0.6)', border:'none', color:'#fff', cursor:'pointer', fontSize:14, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewer && (
        <div onClick={()=>setViewer(null)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20, cursor:'pointer' }}>
          <img src={viewer.src} alt="" style={{ maxWidth:'95%', maxHeight:'95%', objectFit:'contain', borderRadius:8 }} />
          <button onClick={()=>setViewer(null)} style={{ position:'absolute', top:20, right:20, width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', cursor:'pointer', fontSize:20 }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── Board Page (게시판 / 공지사항) ──────────────────────────
function BoardPage({ role }) {
  const canEdit = role==='master'||role==='admin';
  const [notices,setNotices] = useState(()=>store.get('tl_home_notices')||[]);
  const [noticeForm,setNoticeForm] = useState({title:'',body:''});
  const [showNoticeForm,setShowNoticeForm] = useState(false);
  const [editingId,setEditingId] = useState(null);

  const addNotice = ()=>{
    const t = noticeForm.title.trim(), b = noticeForm.body.trim();
    if(!t&&!b){ alert('제목 또는 내용을 입력하세요.'); return; }
    let next;
    if(editingId){
      next = notices.map(n=>n.id===editingId?{...n, title:t, body:b, updatedAt:new Date().toISOString()}:n);
    } else {
      next = [{ id:Date.now(), title:t, body:b, createdAt:new Date().toISOString() }, ...notices];
    }
    setNotices(next); store.set('tl_home_notices',next);
    setNoticeForm({title:'',body:''}); setShowNoticeForm(false); setEditingId(null);
  };
  const startEdit = (n)=>{ setEditingId(n.id); setNoticeForm({title:n.title||'',body:n.body||''}); setShowNoticeForm(true); };
  const removeNotice = (id)=>{
    if(!confirm('이 공지를 삭제할까요?')) return;
    const next = notices.filter(n=>n.id!==id);
    setNotices(next); store.set('tl_home_notices',next);
  };

  const fmtDate = (iso)=>{ const d=new Date(iso); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; };

  return (
    <div>
      <div style={CARD}>
        <SecHead icon="📢" title="게시판 · 공지사항" action={
          canEdit && !showNoticeForm && (
            <button onClick={()=>{ setShowNoticeForm(true); setEditingId(null); setNoticeForm({title:'',body:''}); }} style={{ ...btn('navyGhost'), height:30 }}>
              + 새 글 작성
            </button>
          )
        } />
        {showNoticeForm && canEdit && (
          <div style={{ background:C.navyBg, border:`1px solid ${C.navyBg2}`, borderRadius:10, padding:14, marginBottom:14 }}>
            <input value={noticeForm.title} onChange={e=>setNoticeForm(f=>({...f,title:e.target.value}))}
              placeholder="제목" style={{ ...baseInput, marginBottom:8 }} />
            <textarea value={noticeForm.body} onChange={e=>setNoticeForm(f=>({...f,body:e.target.value}))}
              placeholder="내용" rows={5} style={{ ...baseInput, fontFamily:'inherit', resize:'vertical' }} />
            <div style={{ marginTop:10, display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={()=>{ setShowNoticeForm(false); setNoticeForm({title:'',body:''}); setEditingId(null); }} style={btn('secondary')}>취소</button>
              <button onClick={addNotice} style={btn('primary')}>{editingId?'수정 완료':'등록'}</button>
            </div>
          </div>
        )}
        {notices.length===0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px', color:C.textHint, fontSize:13 }}>등록된 공지사항이 없습니다.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {notices.map(n=>(
              <div key={n.id} style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:'12px 14px', background:C.white }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:6 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, color:C.navyDark }}>{n.title||'(제목 없음)'}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <span style={{ fontSize:11, color:C.textHint }}>{fmtDate(n.updatedAt||n.createdAt)}{n.updatedAt?' (수정)':''}</span>
                    {canEdit && (
                      <>
                        <button onClick={()=>startEdit(n)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textSub, fontSize:11, padding:'2px 4px' }}>수정</button>
                        <button onClick={()=>removeNotice(n.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textHint, fontSize:16 }}>×</button>
                      </>
                    )}
                  </div>
                </div>
                {n.body && <div style={{ fontSize:12.5, color:C.textMid, whiteSpace:'pre-wrap', lineHeight:1.65 }}>{n.body}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar Page ─────────────────────────────────────────────
function CalendarPage({ role }) {
  const canEdit = role!=='guest';
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const [ym,setYm] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [events,setEvents] = useState(()=>store.get('tl_calendar')||{});
  const [editing,setEditing] = useState(null);

  const [y,m] = ym.split('-').map(Number);
  const firstDay = new Date(y,m-1,1).getDay();
  const daysInMonth = new Date(y,m,0).getDate();
  const shiftMonth = (delta)=>{ const d=new Date(y,m-1+delta,1); setYm(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };

  const persist = (next)=>{ setEvents(next); store.set('tl_calendar',next); };

  const openNew = (date)=>{ if(!canEdit) return; setEditing({date, idx:-1, title:'', content:'', important:false}); };
  const openEdit = (date, idx)=>{
    const ev = (events[date]||[])[idx]; if(!ev) return;
    setEditing({date, idx, title:ev.title||'', content:ev.content||'', important:!!ev.important});
  };
  const saveEdit = ()=>{
    if(!editing) return;
    const {date,idx,title,content,important} = editing;
    if(!title.trim() && !content.trim()){ alert('제목 또는 내용을 입력하세요.'); return; }
    const next = {...events};
    const list = [...(next[date]||[])];
    const newEv = { id: idx>=0?list[idx].id:Date.now(), title:title.trim(), content:content.trim(), important:!!important };
    if(idx>=0) list[idx]=newEv; else list.push(newEv);
    next[date]=list; persist(next); setEditing(null);
  };
  const deleteEdit = ()=>{
    if(!editing||editing.idx<0){ setEditing(null); return; }
    if(!confirm('이 일정을 삭제할까요?')) return;
    const {date,idx} = editing;
    const next = {...events};
    const list = [...(next[date]||[])]; list.splice(idx,1);
    if(list.length===0) delete next[date]; else next[date]=list;
    persist(next); setEditing(null);
  };

  const cells = [];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  while(cells.length%7!==0) cells.push(null);

  const dayKey = (d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const monthEventCount = Object.keys(events).filter(k=>k.startsWith(`${y}-${String(m).padStart(2,'0')}`)).reduce((s,k)=>s+(events[k]?.length||0),0);
  const monthImportantCount = Object.keys(events).filter(k=>k.startsWith(`${y}-${String(m).padStart(2,'0')}`)).reduce((s,k)=>s+(events[k]||[]).filter(e=>e.important).length,0);

  const weekDays = ['일','월','화','수','목','금','토'];

  return (
    <div style={{ padding:'14px 16px' }}>
      <div style={CARD}>
        <SecHead icon="📅" title="캘린더 · 일정" action={
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:C.textHint }}>이번 달 · 일정 {monthEventCount}건 / 중요 {monthImportantCount}건</span>
          </div>
        } />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:14, marginBottom:14 }}>
          <button onClick={()=>shiftMonth(-1)} style={{ ...btn('ghost'), height:32, padding:'0 14px' }}>← 이전 달</button>
          <div style={{ fontSize:18, fontWeight:700, color:C.navy, minWidth:140, textAlign:'center', letterSpacing:'-0.3px' }}>{y}년 {m}월</div>
          <button onClick={()=>shiftMonth(1)} style={{ ...btn('ghost'), height:32, padding:'0 14px' }}>다음 달 →</button>
          <button onClick={()=>{ const n=new Date(); setYm(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`); }} style={{ ...btn('navyGhost'), height:32, padding:'0 14px' }}>오늘</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, background:C.border, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
          {weekDays.map((wd,i)=>(
            <div key={wd} style={{ background:C.tHead, padding:'8px 0', textAlign:'center', fontSize:11, fontWeight:700, color:i===0?C.red:i===6?C.blue:C.textSub, letterSpacing:'0.5px' }}>{wd}</div>
          ))}
          {cells.map((d,i)=>{
            if(!d) return <div key={i} style={{ background:C.borderLight, minHeight:90 }} />;
            const key = dayKey(d);
            const list = events[key]||[];
            const dow = (firstDay+d-1)%7;
            const isToday = key===todayStr;
            const dateColor = dow===0?C.red:dow===6?C.blue:C.text;
            return (
              <div key={i} onClick={()=>{ if(list.length===0) openNew(key); }} style={{ background:C.white, minHeight:90, padding:'4px 6px', cursor:canEdit&&list.length===0?'pointer':'default', position:'relative' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:2 }}>
                  <span style={{ fontSize:12, fontWeight:isToday?800:600, color:isToday?'#fff':dateColor, background:isToday?C.navyMid:'transparent', borderRadius:'50%', width:22, height:22, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>{d}</span>
                  {canEdit && <button onClick={(e)=>{ e.stopPropagation(); openNew(key); }} style={{ background:'transparent', border:'none', color:C.textHint, fontSize:14, cursor:'pointer', padding:0, lineHeight:1 }} title="일정 추가">+</button>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  {list.slice(0,3).map((ev,idx)=>(
                    <button key={ev.id} onClick={(e)=>{ e.stopPropagation(); openEdit(key,idx); }}
                      style={{ background:ev.important?C.amberBg:C.navyBg, color:ev.important?C.amber:C.navyMid, border:`1px solid ${ev.important?C.amberBorder:C.navyBg2}`, borderRadius:4, padding:'2px 4px', fontSize:10.5, fontWeight:600, textAlign:'left', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {ev.important?'★ ':''}{ev.title||ev.content.slice(0,12)}
                    </button>
                  ))}
                  {list.length>3 && (
                    <button onClick={(e)=>{ e.stopPropagation(); openEdit(key,3); }} style={{ background:'transparent', border:'none', color:C.textSub, fontSize:10, cursor:'pointer', textAlign:'left', padding:'0 4px' }}>+{list.length-3} 더보기</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {canEdit && <div style={{ marginTop:10, fontSize:11.5, color:C.textHint }}>💡 빈 날짜를 클릭하면 일정을 추가할 수 있어요. 일정을 클릭하면 수정 / 삭제가 가능합니다. 중요 표시(★)된 일정은 노란색으로 강조됩니다.</div>}
      </div>

      {editing && (
        <div onClick={()=>setEditing(null)} style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
          <div onClick={(e)=>e.stopPropagation()} style={{ background:C.white, borderRadius:16, padding:'22px 24px', width:'100%', maxWidth:460, boxShadow:sh.card }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:15, fontWeight:700, color:C.navy }}>{editing.idx>=0?'일정 수정':'새 일정'} · {editing.date}</div>
              <button onClick={()=>setEditing(null)} style={{ background:'transparent', border:'none', color:C.textHint, fontSize:18, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.textSub, marginBottom:4, fontWeight:600 }}>제목</div>
              <input value={editing.title} onChange={(e)=>setEditing({...editing,title:e.target.value})} placeholder="예: 임차인 미팅" style={baseInput} autoFocus />
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:C.textSub, marginBottom:4, fontWeight:600 }}>내용</div>
              <textarea value={editing.content} onChange={(e)=>setEditing({...editing,content:e.target.value})} rows={4} placeholder="메모를 입력하세요" style={{ ...baseInput, fontFamily:'inherit', resize:'vertical' }} />
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, cursor:'pointer', fontSize:13, color:C.text }}>
              <input type="checkbox" checked={editing.important} onChange={(e)=>setEditing({...editing,important:e.target.checked})} />
              <span>★ 중요 표시 (노란색으로 강조)</span>
            </label>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              {editing.idx>=0 && <button onClick={deleteEdit} style={btn('danger')}>삭제</button>}
              <button onClick={()=>setEditing(null)} style={btn('ghost')}>취소</button>
              <button onClick={saveEdit} style={btn('primary')}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Input Page ───────────────────────────────────────────────
function InputPage({ reading, onChange, onSave, saveMsg }) {
  const [analyzing,setAnalyzing]=useState(null);
  const [analyzeErr,setAnalyzeErr]=useState('');
  const [imgModal,setImgModal]=useState(null);
  const fileRef=useRef(null);
  const pendingTypeRef=useRef(null);

  // ── 월별 공과금 고지서 보관함 ──
  const [billDocs,setBillDocs]=useState(()=>store.get('tl_bill_docs')||{});
  const [docMonth,setDocMonth]=useState(()=>{ const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; });
  const [docType,setDocType]=useState('elec');
  const docFileRef=useRef(null);
  const handleDocUpload=async(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const dataUrl=await compressImage(file); if(!dataUrl) return;
    const next={...billDocs,[docMonth]:{...(billDocs[docMonth]||{}),[docType]:dataUrl}};
    setBillDocs(next); store.set('tl_bill_docs',next);
    if(docFileRef.current) docFileRef.current.value='';
  };
  const removeDoc=(month,type)=>{
    const next={...billDocs,[month]:{...(billDocs[month]||{}),[type]:null}};
    setBillDocs(next); store.set('tl_bill_docs',next);
  };

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

  // ─ Museum header tokens ─
  const _serifKR = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const _serifEN = "'Cormorant Garamond', 'Times New Roman', serif";
  const _sans    = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";
  const _ink     = '#1a1a1a';
  const _sub     = '#6e6a64';
  const _billingMonthHdr = getBillingMonth(reading.periodEnd);

  return (
    <div>
      {/* ─ Museum header ─ */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: _sans, fontSize: 10, fontWeight: 600, letterSpacing: '3.5px', textTransform: 'uppercase', color: _sub, marginBottom: 14 }}>
          Meter Reading · 검침 입력
        </div>
        <div style={{ width: 36, height: 1, background: _ink, marginBottom: 18 }} />
        <h1 style={{ fontFamily: _serifKR, fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 500, letterSpacing: '-1px', lineHeight: 1.15, color: _ink, margin: 0 }}>
          {_billingMonthHdr} 검침 입력
        </h1>
        <div style={{ fontFamily: _serifEN, fontStyle:'italic', fontSize: 14.5, color: _sub, marginTop: 8 }}>
          Electricity · Water · 공과금 자동 인식
        </div>
      </div>

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

      {/* ── 월별 공과금 고지서 보관함 ── */}
      <div style={CARD}>
        <SecHead icon="🗄️" title="월별 공과금 고지서 보관함 (전기·수도)" />
        <input ref={docFileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleDocUpload} />

        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>월 선택</div>
            <input type="month" value={docMonth} onChange={e=>setDocMonth(e.target.value)} style={{ ...baseInput, width:'auto', background:C.white }} />
          </div>
          <div>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:5, fontWeight:500 }}>고지서 종류</div>
            <div style={{ display:'flex', background:C.white, border:`1px solid ${C.border}`, borderRadius:20, overflow:'hidden' }}>
              {[['elec','⚡ 전기'],['water','💧 수도']].map(([v,label])=>(
                <button key={v} onClick={()=>setDocType(v)} style={{ ...btn(docType===v?'active':'inactive'), borderRadius:0, height:34 }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ alignSelf:'flex-end' }}>
            <button onClick={()=>{ if(docFileRef.current){ docFileRef.current.value=''; docFileRef.current.click(); } }} style={btn('navyGhost')}>📁 파일 업로드</button>
          </div>
          {billDocs[docMonth]?.[docType] && (
            <div style={{ alignSelf:'flex-end' }}>
              <button onClick={()=>setImgModal(billDocs[docMonth][docType])} style={btn('secondary')}>🔍 현재 보기</button>
            </div>
          )}
        </div>

        {Object.keys(billDocs).filter(m=>billDocs[m]?.elec||billDocs[m]?.water).length===0 ? (
          <div style={{ color:C.textHint, fontSize:13, textAlign:'center', padding:'24px 0' }}>업로드된 고지서가 없습니다.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:12 }}>
            {Object.entries(billDocs).filter(([,docs])=>docs?.elec||docs?.water).sort(([a],[b])=>b.localeCompare(a)).map(([month,docs])=>(
              <div key={month} style={{ background:C.navyBg, borderRadius:12, padding:12, border:`1px solid ${C.navyBg2}` }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.navyDark, marginBottom:8 }}>{month.replace('-','년 ')}월</div>
                <div style={{ display:'flex', gap:8 }}>
                  {[['elec','⚡ 전기'],['water','💧 수도']].map(([type,label])=>(
                    <div key={type} style={{ flex:1 }}>
                      <div style={{ fontSize:11, color:C.textSub, marginBottom:4 }}>{label}</div>
                      {docs[type] ? (
                        <div style={{ position:'relative' }}>
                          <img src={docs[type]} alt={label} style={{ width:'100%', height:75, objectFit:'cover', borderRadius:6, border:`1px solid ${C.border}`, cursor:'zoom-in', display:'block' }} onClick={()=>setImgModal(docs[type])} />
                          <button onClick={()=>removeDoc(month,type)} style={{ position:'absolute', top:3, right:3, background:'rgba(0,0,0,0.55)', border:'none', color:'#fff', borderRadius:'50%', width:18, height:18, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                        </div>
                      ) : (
                        <div style={{ width:'100%', height:75, borderRadius:6, border:`2px dashed ${C.border}`, display:'flex', alignItems:'center', justifyContent:'center', color:C.textHint, fontSize:11, cursor:'pointer' }}
                          onClick={()=>{ setDocMonth(month); setDocType(type); if(docFileRef.current){ docFileRef.current.value=''; docFileRef.current.click(); } }}>+ 업로드</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
      <div style={{ padding:'14px 18px' }}>
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
  const [sending,setSending]=useState(false);
  const printRef=useRef(null); // InvoiceCard가 여기에 handlePrint를 등록

  const sendInvoiceEmails=async()=>{
    const missing=tenants.filter(t=>!t.email);
    if(missing.length){
      if(!window.confirm(`이메일 미등록 임차인이 ${missing.length}곳 있습니다:\n${missing.map(t=>'- '+t.name).join('\n')}\n\n해당 임차인은 건너뜁니다. 계속할까요?`)) return;
    }
    const targets=tenants.filter(t=>t.email);
    if(targets.length===0){ alert('이메일이 등록된 임차인이 없습니다. 임차인 현황에서 이메일을 먼저 등록해주세요.'); return; }
    const billingMonth=getBillingMonth(reading.periodEnd);
    if(!window.confirm(`${billingMonth} 청구서를 ${targets.length}곳에 일괄 발송합니다.\n\n${targets.map(t=>`• ${t.name} → ${t.email}`).join('\n')}\n\n📋 BCC (사본 수신): ${INVOICE_BCC}\n\n발송하시겠습니까?`)) return;

    setSending(true);
    try {
      const messages=targets.map(t=>({
        to:t.email,
        subject:`[${CO_NAME}] ${billingMonth} 관리비 청구서 안내 (${t.name})`,
        html:buildInvoiceEmailHtml(t,reading,calc),
      }));
      const res=await fetch('/api/send-invoice',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ messages, bcc:INVOICE_BCC, fromName:CO_NAME }),
      });
      const data=await res.json();
      if(data.ok) alert(`✓ 발송 완료: ${data.sent}/${data.total}건`);
      else if(data.error&&!data.results) alert(`⚠ 서버 오류\n\n${data.error}\n\nVercel 환경변수(GMAIL_USER, GMAIL_APP_PASSWORD)와 배포 상태를 확인해주세요.`);
      else alert(`⚠ 일부 발송 실패: ${data.sent||0}/${data.total||targets.length}건 성공\n\n${(data.results||[]).filter(r=>!r.ok).map(r=>`✗ ${r.to}: ${r.error}`).join('\n')||'(상세 정보 없음)'}`);
    } catch(e){
      alert(`⚠ 발송 요청 실패: ${e.message}\n\n환경변수(GMAIL_USER, GMAIL_APP_PASSWORD)가 Vercel에 설정되어 있는지 확인해주세요.`);
    } finally {
      setSending(false);
    }
  };

  // ─ 테스트 발송: BCC 주소로만 1통 보내서 수신 여부 확인 ─
  const sendTestInvoice=async()=>{
    const t=tenants[active]||tenants[0];
    if(!t){ alert('임차인 데이터가 없습니다.'); return; }
    const billingMonth=getBillingMonth(reading.periodEnd);
    if(!window.confirm(`테스트 발송\n\n수신: ${INVOICE_BCC}\n내용: ${t.name} ${billingMonth} 청구서 (실제 임차인에게는 가지 않음)\n\n보낼까요?`)) return;
    setSending(true);
    try {
      const res=await fetch('/api/send-invoice',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          messages:[{
            to: INVOICE_BCC,
            subject:`[테스트] [${CO_NAME}] ${billingMonth} 관리비 청구서 (${t.name})`,
            html: buildInvoiceEmailHtml(t,reading,calc),
          }],
          fromName: CO_NAME,
        }),
      });
      const data=await res.json();
      if(data.ok) alert(`✓ 테스트 발송 완료\n\n→ ${INVOICE_BCC}\n메일함을 확인해 주세요.`);
      else alert(`⚠ 발송 실패\n\n${data.error||'상세 정보 없음'}\n\nVercel 환경변수(GMAIL_USER, GMAIL_APP_PASSWORD) 확인 필요.`);
    } catch(e){
      alert(`⚠ 발송 요청 실패: ${e.message}\n\n환경변수(GMAIL_USER, GMAIL_APP_PASSWORD)가 Vercel에 설정되어 있는지 확인해주세요.`);
    } finally {
      setSending(false);
    }
  };

  // ─ Museum header tokens ─
  const _serifKR = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const _serifEN = "'Cormorant Garamond', 'Times New Roman', serif";
  const _sans    = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";
  const _ink     = '#1a1a1a';
  const _sub     = '#6e6a64';
  const _billingMonth = getBillingMonth(reading.periodEnd);

  return (
    <div>
      {/* ─ Museum header ─ */}
      <div className="no-print" style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: _sans, fontSize: 10, fontWeight: 600, letterSpacing: '3.5px', textTransform: 'uppercase', color: _sub, marginBottom: 14 }}>
          Invoice · 관리비 청구서
        </div>
        <div style={{ width: 36, height: 1, background: _ink, marginBottom: 18 }} />
        <h1 style={{ fontFamily: _serifKR, fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 500, letterSpacing: '-1px', lineHeight: 1.15, color: _ink, margin: 0 }}>
          {_billingMonth} 관리비 청구서
        </h1>
        <div style={{ fontFamily: _serifEN, fontStyle:'italic', fontSize: 14.5, color: _sub, marginTop: 8 }}>
          Tenant billing · PDF · 일괄 발송
        </div>
      </div>

      <div className="no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 22, flexWrap:'wrap', gap: 14 }}>
        {/* ─ Tenant tabs (hairline) ─ */}
        <div style={{ display:'flex', borderTop:`1px solid ${_hair}`, borderBottom:`1px solid ${_hair}` }}>
          {tenants.map((t,i)=>(
            <button key={t.id} onClick={()=>setActive(i)}
              style={{ background: active===i?_ink:'#fff', color: active===i?'#fff':_ink, border:'none', borderLeft: i>0?`1px solid ${_hair}`:'none', padding:'10px 18px', fontSize: 11, fontFamily: _sans, fontWeight: 600, letterSpacing:'2px', textTransform:'uppercase', cursor:'pointer', transition:'background 0.15s' }}>
              <span style={{ fontFamily: _serifEN, fontStyle:'italic', textTransform:'none', letterSpacing:'normal', fontSize: 12.5, opacity: 0.85, marginRight: 6 }}>{t.floor}</span>
              {t.name}
            </button>
          ))}
        </div>
        {/* ─ Actions ─ */}
        <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
          <button onClick={()=>printRef.current?.(false)}
            style={{ background: _ink, color:'#fff', border:'none', padding:'10px 16px', fontSize: 10.5, fontFamily: _sans, fontWeight: 600, letterSpacing:'2.5px', textTransform:'uppercase', cursor:'pointer' }}>
            Print · 컬러
          </button>
          <button onClick={()=>printRef.current?.(true)}
            style={{ background:'#fff', color: _ink, border:`1px solid ${_ink}`, padding:'10px 16px', fontSize: 10.5, fontFamily: _sans, fontWeight: 600, letterSpacing:'2.5px', textTransform:'uppercase', cursor:'pointer' }}>
            Print · 흑백
          </button>
          <button onClick={()=>exportTaxInvoice(reading,tenants,calc)}
            title="홈택스 일괄발행용 엑셀 (전 임차인 임대료+관리비 자동)"
            style={{ background:'#fff', color: _ink, border:`1px solid ${_hair}`, padding:'10px 16px', fontSize: 10.5, fontFamily: _sans, fontWeight: 600, letterSpacing:'2.5px', textTransform:'uppercase', cursor:'pointer' }}>
            Tax XLS · 세금계산서
          </button>
          <button onClick={sendTestInvoice} disabled={sending}
            title={`${INVOICE_BCC} 한 곳으로만 테스트 1통 발송 (실제 임차인에게는 안 감)`}
            style={{ background:'#fff', color:'#a3361f', border:`1px solid #a3361f`, padding:'10px 16px', fontSize: 10.5, fontFamily: _sans, fontWeight: 600, letterSpacing:'2.5px', textTransform:'uppercase', cursor: sending?'wait':'pointer' }}>
            {sending?'…':'Test · 테스트 1통'}
          </button>
          <button onClick={sendInvoiceEmails} disabled={sending}
            title={`임차인 ${tenants.filter(t=>t.email).length}곳에 청구서 이메일 일괄 발송 (BCC: ${INVOICE_BCC})`}
            style={{ background: sending?_sub:_ink, color:'#fff', border:'none', padding:'10px 18px', fontSize: 10.5, fontFamily: _sans, fontWeight: 600, letterSpacing:'2.5px', textTransform:'uppercase', cursor: sending?'wait':'pointer' }}>
            {sending?'Sending…':`Send · 발송 (${tenants.filter(t=>t.email).length})`}
          </button>
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
                    <div style={{ marginTop:6, paddingTop:10, borderTop:`1px dashed ${C.border}`, fontSize:11, color:C.textHint, letterSpacing:0.5 }}>전자세금계산서 정보</div>
                    {[
                      ['사업자번호','bizNo','000-00-00000'],
                      ['대표자','ceo','홍길동'],
                      ['업태','bizType','제조'],
                      ['종목','bizItem','전자제품'],
                      ['사업장 주소','bizAddr','서울특별시 …'],
                      ['수신 이메일','email','tax@example.com'],
                    ].map(([label,field,ph])=>(
                      <div key={field} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:12, color:C.textSub, minWidth:72, flexShrink:0 }}>{label}</span>
                        <input type="text" placeholder={ph} value={t[field]||''} onChange={e=>upField(t.id,field,e.target.value)} style={{ ...baseInput, flex:1 }} />
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

                    <div style={{ background:warnBg, border:`1px solid ${warnBrd}`, borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:12, color:warnColor, fontWeight:600 }}>{warnText}</span>
                      <DdayBadge dateStr={t.contractEnd} />
                    </div>
                    {isPrivileged && (
                      <div style={{ fontSize:11, color:t.bizNo?C.textSub:C.red, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                        {t.bizNo
                          ? <><span style={{color:C.green}}>●</span><span>세금계산서 정보 등록 ({t.bizNo})</span></>
                          : <><span>○</span><span>세금계산서 정보 미등록 — 수정에서 입력</span></>
                        }
                      </div>
                    )}

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
function FinancePage({ role }) {
  const canLock = role==='master';
  const now=new Date();
  const [month,setMonth]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  // 잔고는 월별로 저장. 기존 글로벌 데이터는 처음 1회 거래내역이 있는 가장 최근 달로 마이그레이션.
  const [accountsByYm,setAccountsByYm]=useState(()=>{
    const stored=store.get('tl_finance_accounts_by_ym');
    if(stored&&typeof stored==='object') return stored;
    const legacy=store.get('tl_finance_accounts');
    if(legacy){
      const txns=store.get('tl_finance_txns')||{};
      const txnYms=Object.keys(txns).filter(m=>(txns[m]?.rows||[]).length>0).sort();
      const targetYm=txnYms.length
        ?txnYms[txnYms.length-1]
        :`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const migrated={ [targetYm]: legacy };
      store.set('tl_finance_accounts_by_ym',migrated);
      return migrated;
    }
    return {};
  });

  // 현재 month의 accounts. 저장된 값이 없으면 직전 달의 curr를 prev로 자동 이월.
  const accounts=useMemo(()=>{
    const out={};
    const cur=accountsByYm[month];
    if(cur){
      ACCT_ORDER.forEach(k=>{
        out[k]={
          label: cur[k]?.label || INITIAL_ACCOUNTS[k].label,
          prev: cur[k]?.prev || 0,
          curr: cur[k]?.curr || 0,
        };
      });
      return out;
    }
    const prevYms=Object.keys(accountsByYm).filter(m=>m<month).sort();
    const prevAccts=prevYms.length?accountsByYm[prevYms[prevYms.length-1]]:null;
    ACCT_ORDER.forEach(k=>{
      out[k]={
        label: prevAccts?.[k]?.label || INITIAL_ACCOUNTS[k].label,
        prev: prevAccts?.[k]?.curr || 0,
        curr: 0,
      };
    });
    return out;
  },[accountsByYm,month]);

  const persistAccounts=(nextForMonth)=>{
    const nb={...accountsByYm,[month]:nextForMonth};
    setAccountsByYm(nb); store.set('tl_finance_accounts_by_ym',nb); setAutoSaveAt(new Date());
  };

  // 월별 확정 잠금. 잠긴 달은 모든 수정이 차단됨.
  const [lockedByYm,setLockedByYm]=useState(()=>store.get('tl_finance_locks')||{});
  const isLocked=!!lockedByYm[month];

  // 마이그레이션: 모든 행에 acct 필드 보장 (옛 데이터 → 'acct018')
  const [txnData,setTxnData]=useState(()=>{
    const raw=store.get('tl_finance_txns')||{};
    const out={};
    Object.keys(raw).forEach(m=>{
      const d=raw[m]||{};
      out[m]={ ...d, rows:(d.rows||[]).map(r=>({ ...r, acct:r.acct||'acct018' })) };
    });
    return out;
  });

  const [autoSaveAt,setAutoSaveAt]=useState(null);
  const [importPreview,setImportPreview]=useState(null);
  const [acctFilter,setAcctFilter]=useState('all');
  const [defaultAcct,setDefaultAcct]=useState('acct018');
  const fileInputRefs=useRef({});

  const ymData=txnData[month]||{rows:[]};

  // 날짜 오름차순 + ID 안정정렬 → 001/002/003... 자동 번호
  const sortAndRenumber=(rows)=>[...rows]
    .sort((a,b)=>{ const dc=(a.date||'').localeCompare(b.date||''); return dc!==0?dc:(a.id||0)-(b.id||0); })
    .map((r,i)=>({...r, no:String(i+1).padStart(3,'0')}));

  const setYmData=(next)=>{
    if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); return; }
    const cleaned={...next, rows:sortAndRenumber(next.rows||[])};
    const nd={...txnData,[month]:cleaned};
    setTxnData(nd); store.set('tl_finance_txns',nd); setAutoSaveAt(new Date());
  };

  const upAcct=(key,field,val)=>{
    if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); return; }
    const next={...accounts,[key]:{...accounts[key],[field]:Number(val)||0}};
    persistAccounts(next);
  };

  const toggleLock=()=>{
    if(!canLock){ alert('확정 잠금/해제는 마스터만 가능합니다.'); return; }
    if(isLocked){
      if(!confirm(`${monthLabel} 확정을 해제할까요?\n해제 후 잔고 및 입출금 내역을 수정할 수 있습니다.`)) return;
      const nb={...lockedByYm}; delete nb[month];
      setLockedByYm(nb); store.set('tl_finance_locks',nb);
    } else {
      if(!confirm(`${monthLabel} 자금현황을 확정으로 잠그시겠습니까?\n잠금 후에는 잔고와 입출금 내역을 수정할 수 없습니다.\n(언제든 잠금 해제 가능)`)) return;
      const nb={...lockedByYm,[month]:true};
      setLockedByYm(nb); store.set('tl_finance_locks',nb);
    }
  };

  const acctKeys=ACCT_ORDER.filter(k=>accounts[k]);

  const acctNet=(k)=>(ymData.rows||[]).filter(r=>r.acct===k).reduce((s,r)=>s+(r.income||0)-(r.expense||0),0);
  const expectedCurr=(k)=>(accounts[k]?.prev||0)+acctNet(k);
  const mismatchDelta=(k)=>(accounts[k]?.curr||0)-expectedCurr(k);
  const mismatches=acctKeys.filter(k=>Math.abs(mismatchDelta(k))>0);
  const hasMismatch=mismatches.length>0;

  const totalPrev=acctKeys.reduce((s,k)=>s+(accounts[k].prev||0),0);
  const totalCurr=acctKeys.reduce((s,k)=>s+(accounts[k].curr||0),0);
  const totalIncome=(ymData.rows||[]).reduce((s,r)=>s+(r.income||0),0);
  const totalExpense=(ymData.rows||[]).reduce((s,r)=>s+(r.expense||0),0);
  const totalExpectedCurr=totalPrev+totalIncome-totalExpense;

  const displayRows=(ymData.rows||[]).filter(r=>acctFilter==='all'||r.acct===acctFilter);
  const computedRows=(()=>{
    if(acctFilter==='all') return displayRows.map(r=>({...r,balance:null}));
    let bal=accounts[acctFilter]?.prev||0;
    return displayRows.map(r=>{ bal+=(r.income||0)-(r.expense||0); return {...r,balance:bal}; });
  })();

  const addRow=()=>setYmData({...ymData, rows:[...(ymData.rows||[]),{
    id:Date.now(), no:'', date:`${month}-01`,
    acct:acctFilter!=='all'?acctFilter:defaultAcct,
    desc:'', income:0, expense:0,
  }]});
  const delRow=(id)=>setYmData({...ymData, rows:(ymData.rows||[]).filter(r=>r.id!==id)});
  const upRow=(id,field,val)=>setYmData({
    ...ymData,
    rows:(ymData.rows||[]).map(r=>{
      if(r.id!==id) return r;
      if(field==='income'||field==='expense') return {...r,[field]:Number(val)||0};
      return {...r,[field]:val};
    }),
  });

  const shiftMonth=(delta)=>{ const [y,m]=month.split('-').map(Number); const d=new Date(y,m-1+delta,1); setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); };
  const [yy,mm]=month.split('-');
  const monthLabel=`${yy}년 ${Number(mm)}월`;

  const inlineInputStyle=(color)=>({ ...baseInput, background:'transparent', border:'1px solid transparent', padding:'3px 5px', borderRadius:6, textAlign:color?'right':'left', color:color||C.text, fontVariantNumeric:color?'tabular-nums':'normal', transition:'border-color 0.15s' });

  const parseNum=(v)=>{ if(!v&&v!==0) return 0; return parseInt(String(v).replace(/[^0-9]/g,''))||0; };

  const handleXlsFile=(acctKey,file)=>{
    if(!file) return;
    if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); if(fileInputRefs.current[acctKey]) fileInputRefs.current[acctKey].value=''; return; }
    const reader=new FileReader();
    reader.onload=(e)=>{
      try {
        const data=new Uint8Array(e.target.result);
        const wb=XLSX.read(data,{type:'array',codepage:949});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const allRows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
        const dateRe=/^\d{4}-\d{2}-\d{2}/;
        const dataRows=allRows.filter(row=>row[0]&&dateRe.test(String(row[0])));
        if(dataRows.length===0){ alert('거래 내역을 찾을 수 없습니다.\n파일 형식을 확인해 주세요.'); return; }

        // 파일이 최신순/오래된순 어느 쪽이든 timestamp 가장 큰 행이 최신 잔액
        const latestRow=dataRows.reduce((a,b)=>String(a[0])>String(b[0])?a:b);

        let parsed=[]; let finalBalance=0;
        if(acctKey==='acct018'||acctKey==='acct032'){
          parsed=dataRows.map(row=>({
            date:String(row[0]).substring(0,10),
            desc:String(row[4]||'').trim(),
            income:parseNum(row[2]),
            expense:parseNum(row[1]),
            balance:parseNum(row[3]),
            acct:acctKey,
          })).filter(r=>r.income||r.expense);
          finalBalance=parseNum(latestRow[3]);
        } else if(acctKey==='mmf'){
          // MMF: row[1]=출금, row[2]=입금, row[3]=적요, row[4]=거래종류, row[12]=잔액
          // 매입체결처럼 자금이동 없는 행은 row[1]/row[2]=0이라 자동 필터됨
          parsed=dataRows.map(row=>{
            const memo=String(row[3]||'').trim();
            const kind=String(row[4]||'').trim();
            return {
              date:String(row[0]).substring(0,10),
              desc:[memo,kind].filter(Boolean).join(' / '),
              income:parseNum(row[2]),
              expense:parseNum(row[1]),
              balance:parseNum(row[12]),
              acct:acctKey,
            };
          }).filter(r=>r.income||r.expense);
          finalBalance=parseNum(latestRow[12])||parseNum(latestRow[6])||parseNum(latestRow[7])||0;
          if(!finalBalance){ alert('MMF 잔액을 찾을 수 없습니다.\n파일을 확인해 주세요.'); return; }
          if(parsed.length===0){
            // 거래 없음 → 잔액만 업데이트 (기존 동작 유지)
            setImportPreview({acctKey,rows:[],finalBalance,mmfOnly:true});
            return;
          }
        }

        if(parsed.length===0){ alert('파싱된 거래 내역이 없습니다.'); return; }
        const monthFiltered=parsed.filter(r=>r.date.startsWith(month));
        if(monthFiltered.length===0){
          if(!confirm(`이 파일에는 ${monthLabel} 거래내역이 없습니다.\n전체를 가져올까요? (월 필터 무시)`)) return;
          setImportPreview({acctKey,rows:parsed,finalBalance});
        } else {
          setImportPreview({acctKey,rows:monthFiltered,finalBalance});
        }
      } catch(err){ alert('파일 읽기 오류: '+err.message); }
    };
    reader.readAsArrayBuffer(file);
    if(fileInputRefs.current[acctKey]) fileInputRefs.current[acctKey].value='';
  };

  const confirmImport=()=>{
    if(!importPreview) return;
    const{acctKey,rows,finalBalance,mmfOnly}=importPreview;
    if(mmfOnly){ upAcct(acctKey,'curr',finalBalance); setImportPreview(null); return; }
    // 강력 중복 키: 날짜|계좌|입금|출금|적요30
    const dedupKey=(r)=>`${r.date}|${r.acct}|${r.income}|${r.expense}|${(r.desc||'').slice(0,30)}`;
    const existingKeys=new Set((ymData.rows||[]).map(dedupKey));
    const newRows=rows
      .filter(r=>!existingKeys.has(dedupKey(r)))
      .map((r,i)=>({
        id:Date.now()+i, no:'', date:r.date, acct:acctKey,
        desc:r.desc, income:r.income, expense:r.expense,
      }));
    const skipped=rows.length-newRows.length;
    const merged=[...(ymData.rows||[]),...newRows];
    setYmData({...ymData,rows:merged});
    if(finalBalance>0) upAcct(acctKey,'curr',finalBalance);
    setImportPreview(null);
    if(skipped>0) setTimeout(()=>alert(`${newRows.length}건 추가 · ${skipped}건 중복 제외됨.`),100);
  };

  const syncAcctsFromLedger=()=>{
    if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); return; }
    if(!confirm('거래내역 합계 기준으로 [현재 잔고]를 다시 계산해서 덮어쓸까요?')) return;
    const next={...accounts};
    acctKeys.forEach(k=>{ next[k]={...next[k], curr:expectedCurr(k)}; });
    persistAccounts(next);
  };

  const refreshPrevFromLastMonth=()=>{
    if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); return; }
    const prevYms=Object.keys(accountsByYm).filter(m=>m<month).sort();
    if(!prevYms.length){ alert('이전 달 잔고 데이터가 없습니다.'); return; }
    const prevYm=prevYms[prevYms.length-1];
    const prevAccts=accountsByYm[prevYm];
    const [py,pm]=prevYm.split('-');
    const prevLabel=`${py}년 ${Number(pm)}월`;
    if(!confirm(`${prevLabel}의 [현재 잔고]를 ${monthLabel}의 [전월 잔고]로 다시 가져올까요?\n(${monthLabel} 현재 잔고와 거래내역은 그대로 유지)`)) return;
    const next={...accounts};
    acctKeys.forEach(k=>{ next[k]={...next[k], prev:prevAccts?.[k]?.curr||0}; });
    persistAccounts(next);
  };

  // 번호 정리 (수동) + 되돌리기 한 단계
  const [undoState,setUndoState]=useState(()=>store.get('tl_finance_txns_undo')||null);
  const hasUndoForMonth = undoState && undoState.month===month;
  const renumberMonth=()=>{
    if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); return; }
    const rows=(ymData.rows||[]);
    if(rows.length===0){ alert('정리할 내역이 없습니다.'); return; }
    if(!confirm(`${monthLabel} 입출금 내역 ${rows.length}건의 번호를 날짜순으로 다시 매기시겠습니까?\n(되돌리기 버튼이 나옵니다)`)) return;
    const undo={month, rows:rows.map(r=>({...r})), at:Date.now()};
    setUndoState(undo); store.set('tl_finance_txns_undo',undo);
    const cleaned=sortAndRenumber(rows);
    const nd={...txnData,[month]:{...ymData, rows:cleaned}};
    setTxnData(nd); store.set('tl_finance_txns',nd); setAutoSaveAt(new Date());
  };
  const undoRenumber=()=>{
    if(!hasUndoForMonth) return;
    if(!confirm('번호 정리 직전 상태로 되돌리시겠습니까?')) return;
    const nd={...txnData,[month]:{...ymData, rows:undoState.rows}};
    setTxnData(nd); store.set('tl_finance_txns',nd); setAutoSaveAt(new Date());
    setUndoState(null); store.set('tl_finance_txns_undo',null);
  };

  // 자동 번호 정리: 월 진입 시 1회. 번호가 어긋나 있으면 백업 후 silent 재정렬.
  useEffect(()=>{
    if(isLocked) return;
    const rows=(txnData[month]?.rows)||[];
    if(rows.length===0) return;
    const cleaned=sortAndRenumber(rows);
    const same=rows.every((r,i)=>r.no===cleaned[i]?.no && r.id===cleaned[i]?.id);
    if(same) return;
    // 같은 달에 이미 undo 백업이 있으면 덮어쓰지 않음 (수동 후 자동이 백업 날리는 거 방지)
    if(undoState && undoState.month===month) return;
    const undo={month, rows:rows.map(r=>({...r})), at:Date.now()};
    setUndoState(undo); store.set('tl_finance_txns_undo',undo);
    const nd={...txnData,[month]:{...(txnData[month]||{}), rows:cleaned}};
    setTxnData(nd); store.set('tl_finance_txns',nd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[month]);

  const IMPORT_BTNS=[
    {key:'acct018', label:'보통018 가져오기', color:'#1d4ed8'},
    {key:'acct032', label:'보통032 가져오기', color:'#3730a3'},
    {key:'mmf',     label:'MMF 잔액 업데이트', color:'#047857'},
  ];

  // ─ Museum header tokens (페이지 진입감) ────────────────
  const _serifKR = "'Noto Serif KR', 'Nanum Myeongjo', serif";
  const _serifEN = "'Cormorant Garamond', 'Times New Roman', serif";
  const _sans    = "system-ui, 'Segoe UI', 'Malgun Gothic', sans-serif";
  const _ink     = '#1a1a1a';
  const _sub     = '#6e6a64';
  const _hair    = '#d9d6cf';

  return (
    <div>
      {/* ─ Museum header ─ */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: _sans, fontSize: 10, fontWeight: 600, letterSpacing: '3.5px', textTransform: 'uppercase', color: _sub, marginBottom: 14 }}>
          Finance · 자금현황
        </div>
        <div style={{ width: 36, height: 1, background: _ink, marginBottom: 18 }} />
        <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <h1 style={{ fontFamily: _serifKR, fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 500, letterSpacing: '-1px', lineHeight: 1.15, color: _ink, margin: 0 }}>
            {monthLabel} 자금현황
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
            <button onClick={()=>shiftMonth(-1)} title="이전 달"
              style={{ background:'transparent', border:`1px solid ${_hair}`, borderRadius:0, padding:'7px 12px', fontSize:13, fontFamily: _serifEN, fontStyle:'italic', color: _ink, cursor:'pointer' }}>‹</button>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
              style={{ background:'#fff', border:`1px solid ${_hair}`, borderRadius:0, padding:'7px 10px', fontSize:13, fontFamily: _sans, color: _ink, outline:'none' }} />
            <button onClick={()=>shiftMonth(1)} title="다음 달"
              style={{ background:'transparent', border:`1px solid ${_hair}`, borderRadius:0, padding:'7px 12px', fontSize:13, fontFamily: _serifEN, fontStyle:'italic', color: _ink, cursor:'pointer' }}>›</button>
            {canLock && (
              <button onClick={toggleLock} title={isLocked?'잠금 해제':'확정 잠금'}
                style={{ background: isLocked?_ink:'transparent', border:`1px solid ${_ink}`, borderRadius:0, padding:'7px 14px', fontSize:10, fontFamily: _sans, fontWeight:600, letterSpacing:'2px', textTransform:'uppercase', color: isLocked?'#fff':_ink, cursor:'pointer', marginLeft:6 }}>
                {isLocked?'🔓 Unlock':'🔒 Lock'}
              </button>
            )}
          </div>
        </div>
        <div style={{ fontFamily: _serifEN, fontStyle:'italic', fontSize: 14.5, color: _sub, marginTop: 8 }}>
          Monthly cash position · 잔고와 입출금 내역
        </div>
      </div>

      {/* 확정 잠금 상태 배너 */}
      {isLocked && (
        <div style={{ background:C.amberBg, border:`1.5px solid ${C.amberBorder}`, borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🔒</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:2 }}>{monthLabel} 확정 잠금</div>
              <div style={{ fontSize:11.5, color:'#78350f' }}>청구서가 발송된 확정 자료입니다. 잔고와 입출금 내역을 수정할 수 없습니다.{!canLock && ' (해제는 마스터만 가능)'}</div>
            </div>
          </div>
          {canLock && <button onClick={toggleLock} style={{ ...btn('amber'), height:32 }}>🔓 잠금 해제</button>}
        </div>
      )}

      {/* ─ Museum summary cards ─ */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:0, marginBottom:24, border:`1px solid ${_hair}`, background:'#fff' }}>
        {[
          {kicker:'Total Balance', label:'총 잔고',        value: totalCurr,          accent:_ink,      sub:`전월 대비 ${(totalCurr-totalPrev)>=0?'+':'−'}${fmt(Math.abs(totalCurr-totalPrev))}원`},
          {kicker:'Inflow',        label:`${monthLabel} 입금`, value: totalIncome,    accent:'#1e3a8a', sub:`${(ymData.rows||[]).filter(r=>r.income).length}건`},
          {kicker:'Outflow',       label:`${monthLabel} 출금`, value: totalExpense,   accent:'#7c2d12', sub:`${(ymData.rows||[]).filter(r=>r.expense).length}건`},
          {kicker:'Projected',     label:'예상 잔고',      value: totalExpectedCurr,  accent: hasMismatch?'#a67c2e':_ink, sub: hasMismatch?`수기와 ${fmt(Math.abs(totalCurr-totalExpectedCurr))}원 차이`:'잔고와 일치'},
        ].map(({kicker,label,value,accent,sub},i)=>(
          <div key={label} style={{ padding:'22px 22px 20px', borderRight: i<3?`1px solid ${_hair}`:'none', borderTop:`1px solid transparent` }}>
            <div style={{ fontFamily: _sans, fontSize: 9.5, fontWeight: 600, letterSpacing: '2.5px', textTransform: 'uppercase', color: _sub, marginBottom: 6 }}>{kicker}</div>
            <div style={{ fontFamily: _serifEN, fontStyle:'italic', fontSize: 12.5, color: _sub, marginBottom: 14 }}>{label}</div>
            <div style={{ fontFamily: _serifEN, fontSize: 'clamp(26px, 2.4vw, 32px)', fontWeight: 500, color: accent, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px', lineHeight: 1, marginBottom: 8 }}>
              {fmt(value)}<span style={{ fontFamily: _sans, fontSize: 11, fontWeight:600, letterSpacing:'1.5px', color:_sub, marginLeft: 6 }}>KRW</span>
            </div>
            <div style={{ width: 22, height: 1, background: _hair, margin:'10px 0 8px' }} />
            <div style={{ fontFamily: _sans, fontSize: 11, color: _sub, lineHeight: 1.5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* 미스매치 경고 */}
      {hasMismatch && (
        <div style={{ background:C.amberBg, border:`1.5px solid ${C.amberBorder}`, borderRadius:12, padding:'12px 16px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, flex:1, minWidth:280 }}>
            <span style={{ fontSize:20 }}>⚠️</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.amber, marginBottom:2 }}>잔고와 거래내역이 안 맞습니다</div>
              <div style={{ fontSize:11.5, color:'#78350f' }}>
                {mismatches.map(k=>`${accounts[k].label} ${mismatchDelta(k)>=0?'+':''}${fmt(mismatchDelta(k))}원`).join(' · ')}
              </div>
            </div>
          </div>
          <button onClick={syncAcctsFromLedger} style={{ ...btn('amber'), height:32 }}>🔄 거래내역 기준으로 잔고 맞추기</button>
        </div>
      )}

      {/* XLS 가져오기 */}
      <div style={CARD}>
        <SecHead icon="📂" title="통장 내역 가져오기 (XLS)" action={<span style={{fontSize:11,color:C.textHint}}>{monthLabel} 거래만 자동 추출 · 중복 제외 · 날짜순 정렬</span>} />
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          {IMPORT_BTNS.map(({key,label,color})=>(
            <label key={key} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',background:color+'18',border:`1.5px solid ${color}44`,borderRadius:10,cursor:isLocked?'not-allowed':'pointer',fontSize:13,fontWeight:600,color,transition:'background 0.15s',opacity:isLocked?0.4:1,pointerEvents:isLocked?'none':'auto'}}
              onMouseEnter={e=>{ if(!isLocked) e.currentTarget.style.background=color+'30'; }}
              onMouseLeave={e=>{ if(!isLocked) e.currentTarget.style.background=color+'18'; }}>
              📂 {label}
              <input type="file" accept=".xls,.xlsx" style={{display:'none'}} disabled={isLocked}
                ref={el=>fileInputRefs.current[key]=el}
                onChange={e=>handleXlsFile(key,e.target.files[0])} />
            </label>
          ))}
        </div>
      </div>

      {/* 가져오기 미리보기 모달 */}
      {importPreview&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:C.white,borderRadius:16,padding:24,width:'100%',maxWidth:importPreview.mmfOnly?440:720,maxHeight:'80vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <span style={{fontSize:15,fontWeight:800,color:C.navyDark}}>{importPreview.mmfOnly?'MMF 잔액 업데이트':`가져오기 미리보기 (${importPreview.rows.length}건)`}</span>
              <button onClick={()=>setImportPreview(null)} style={{background:'transparent',border:'none',fontSize:22,cursor:'pointer',color:C.textHint}}>×</button>
            </div>
            {importPreview.mmfOnly?(
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <div style={{fontSize:13,color:C.textSub,marginBottom:12}}>파일에서 읽은 MMF 최종 잔액</div>
                <div style={{fontSize:28,fontWeight:900,color:'#047857',marginBottom:20}}>{fmt(importPreview.finalBalance)}원</div>
                <div style={{fontSize:12,color:C.textHint,marginBottom:20}}>거래내역은 추가되지 않고 MMF 잔액만 업데이트됩니다.</div>
              </div>
            ):(
              <div style={{overflowY:'auto',flex:1,marginBottom:16}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
                  <thead><tr style={{background:C.navyBg}}>
                    {['날짜','적요','입금','출금','잔액'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:h==='날짜'||h==='적요'?'left':'right',fontWeight:700,color:C.navy,borderBottom:`1px solid ${C.tBorder}`}}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {importPreview.rows.map((r,i)=>(
                      <tr key={i} style={{background:i%2===0?C.white:C.tAlt}}>
                        <td style={{padding:'7px 10px',color:C.textSub,whiteSpace:'nowrap'}}>{r.date}</td>
                        <td style={{padding:'7px 10px',color:C.text}}>{r.desc}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',color:r.income?C.blue:C.textHint,fontWeight:r.income?600:400}}>{r.income?fmt(r.income)+' 원':'-'}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',color:r.expense?C.red:C.textHint,fontWeight:r.expense?600:400}}>{r.expense?fmt(r.expense)+' 원':'-'}</td>
                        <td style={{padding:'7px 10px',textAlign:'right',color:C.navyDark,fontWeight:600}}>{r.balance?fmt(r.balance)+' 원':'-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!importPreview.mmfOnly&&importPreview.finalBalance>0&&(
              <div style={{padding:'10px 14px',background:C.greenBg,borderRadius:10,marginBottom:14,fontSize:13,color:C.green,fontWeight:600}}>
                ✓ 계좌 잔액이 <strong>{fmt(importPreview.finalBalance)}원</strong> 으로 자동 업데이트됩니다.
              </div>
            )}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>setImportPreview(null)} style={btn('secondary')}>취소</button>
              <button onClick={confirmImport} style={btn('primary')}>{importPreview.mmfOnly?'잔액 업데이트':'가져오기 확인'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 예금·잔고 현황 */}
      <div style={CARD}>
        <SecHead icon="🏦" title="예금·잔고 현황" action={
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {autoSaveAt && <span style={{ fontSize:11, color:C.green }}>✓ 자동저장 {autoSaveAt.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>}
            <span style={{ fontSize:11, color:C.textHint }} title="이전 달의 현재잔고가 자동으로 이번 달의 전월잔고가 됩니다">🔁 자동 이월</span>
            {!isLocked && (
              <button onClick={refreshPrevFromLastMonth} title="이전 달의 현재잔고를 다시 가져와 이번 달 전월잔고를 새로고침합니다"
                style={{ padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  background:C.white, color:C.textSub, border:`1px solid ${C.border}` }}>
                🔄 전월잔고 새로고침
              </button>
            )}
            {canLock && (
              <button onClick={toggleLock} title={isLocked?'잠금 해제':'이 달을 확정 상태로 잠그기'}
                style={{ padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
                  background:isLocked?C.amberBg:C.white, color:isLocked?C.amber:C.textSub, border:`1px solid ${isLocked?C.amberBorder:C.border}` }}>
                {isLocked?'🔒 확정됨':'🔓 확정 잠금'}
              </button>
            )}
            {!canLock && isLocked && (
              <span style={{ padding:'4px 10px', borderRadius:14, fontSize:11, fontWeight:700, background:C.amberBg, color:C.amber, border:`1px solid ${C.amberBorder}` }}>🔒 확정됨</span>
            )}
          </div>
        } />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {[['계정','left',140],['전월 잔고','right'],['현재 잔고','right'],['거래 합계','right',120],['예상 잔고','right',120],['일치','center',56]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {acctKeys.map((key,i)=>{
                const a=accounts[key];
                const net=acctNet(key);
                const exp=expectedCurr(key);
                const delta=mismatchDelta(key);
                const matched=delta===0;
                const c=ACCT_COLOR[key];
                return (
                  <tr key={key} style={{ background:i%2===0?C.white:C.tAlt }}>
                    <td style={TD('left')}>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:c.fg, background:c.bg, border:`1px solid ${c.border}`, padding:'2px 7px', borderRadius:6, letterSpacing:'0.3px' }}>{c.short}</span>
                        <span style={{ fontWeight:600, color:C.navy }}>{a.label}</span>
                      </span>
                    </td>
                    <td style={TD('right')}>
                      <input type="number" value={a.prev||''} onChange={e=>upAcct(key,'prev',e.target.value)} readOnly={isLocked}
                        style={{ ...inlineInputStyle(C.textMid), width:'100%', cursor:isLocked?'not-allowed':'text', background:isLocked?'#f8fafc':'transparent' }}
                        onFocus={e=>(!isLocked&&(e.target.style.borderColor=C.navyBg2))}
                        onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('right')}>
                      <input type="number" value={a.curr||''} onChange={e=>upAcct(key,'curr',e.target.value)} readOnly={isLocked}
                        style={{ ...inlineInputStyle(C.navyDark), width:'100%', fontWeight:700, cursor:isLocked?'not-allowed':'text', background:isLocked?'#f8fafc':'transparent' }}
                        onFocus={e=>(!isLocked&&(e.target.style.borderColor=C.navyBg2))}
                        onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('right',{fontWeight:600,color:net>=0?C.blue:C.red})}>{net>=0?'+':''}{fmt(net)}</td>
                    <td style={TD('right',{fontWeight:600,color:C.text})}>{fmt(exp)}</td>
                    <td style={TD('center')}>
                      {matched
                        ?<span style={{ fontSize:13, color:C.green }}>✓</span>
                        :<span title={`차이 ${fmt(delta)}원`} style={{ fontSize:13, color:C.amber, fontWeight:700 }}>⚠</span>}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background:C.navyBg, borderTop:`2px solid ${C.navyBg2}` }}>
                <td style={TD('left',{fontWeight:800,color:C.navyDark,fontSize:14})}>합 계</td>
                <td style={TD('right',{fontWeight:600,color:C.navyDark})}>{fmt(totalPrev)}</td>
                <td style={TD('right',{fontWeight:800,color:C.navyDark,fontSize:16})}>{fmt(totalCurr)}</td>
                <td style={TD('right',{fontWeight:700,color:(totalIncome-totalExpense)>=0?C.blue:C.red})}>{(totalIncome-totalExpense)>=0?'+':''}{fmt(totalIncome-totalExpense)}</td>
                <td style={TD('right',{fontWeight:700,color:C.text,fontSize:14})}>{fmt(totalExpectedCurr)}</td>
                <td style={TD('center')}>{hasMismatch?<span style={{color:C.amber,fontWeight:700}}>⚠</span>:<span style={{color:C.green}}>✓</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 입출금 내역 */}
      <div style={CARD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${C.tBorder}`, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:28, height:28, borderRadius:8, background:C.navyBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>📋</div>
            <span style={{ fontSize:14, fontWeight:700, color:C.navy }}>입출금 내역</span>
            <span style={{ fontSize:11.5, color:C.textHint, marginLeft:4 }}>총 {(ymData.rows||[]).length}건 · 날짜 자동 정렬 · 번호 자동매김</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={()=>shiftMonth(-1)} style={{ ...btn('secondary'), padding:'0 12px', height:30, borderRadius:20 }}>←</button>
            <span style={{ fontSize:14, fontWeight:700, color:C.navyDark, minWidth:100, textAlign:'center' }}>{monthLabel}</span>
            <button onClick={()=>shiftMonth(1)}  style={{ ...btn('secondary'), padding:'0 12px', height:30, borderRadius:20 }}>→</button>
          </div>
        </div>

        {/* 계좌 필터 칩 */}
        <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:11.5, color:C.textSub, marginRight:4 }}>계좌 필터</span>
          {[['all','전체',null], ...acctKeys.map(k=>[k,accounts[k].label,ACCT_COLOR[k]])].map(([k,label,color])=>{
            const active=acctFilter===k;
            const cnt=k==='all'?(ymData.rows||[]).length:(ymData.rows||[]).filter(r=>r.acct===k).length;
            return (
              <button key={k} onClick={()=>setAcctFilter(k)} style={{
                padding:'5px 12px', borderRadius:16, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                background: active?(color?color.fg:C.navyDark):(color?color.bg:C.white),
                color:    active?'#fff':(color?color.fg:C.textMid),
                border:`1px solid ${active?(color?color.fg:C.navyDark):(color?color.border:C.border)}`,
                transition:'all 0.15s',
              }}>{label} <span style={{ opacity:0.7, marginLeft:4 }}>({cnt})</span></button>
            );
          })}
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>
              {[['No','left',56],['날짜','left',120],['계좌','left',86],['적요','left'],['입금','right',130],['출금','right',130],...(acctFilter!=='all'?[['잔액','right',130]]:[]),['','center',36]].map(([h,a,w])=><th key={h+a} style={TH(a,w)}>{h}</th>)}
            </tr></thead>
            <tbody>
              {computedRows.length===0 && (
                <tr><td colSpan={acctFilter!=='all'?8:7} style={{ ...TD('center'), color:C.textHint, padding:'32px', fontSize:13 }}>내역이 없습니다. [+ 행 추가] 또는 통장 XLS 가져오기로 추가하세요.</td></tr>
              )}
              {computedRows.map((row,idx)=>{
                const c=ACCT_COLOR[row.acct]||{ bg:'#f1f5f9', fg:'#64748b', border:'#e2e8f0', short:'?' };
                return (
                  <tr key={row.id} style={{ background:idx%2===0?C.white:C.tAlt }}>
                    <td style={TD('left',{color:C.textHint,fontSize:11.5,fontVariantNumeric:'tabular-nums'})}>{row.no||String(idx+1).padStart(3,'0')}</td>
                    <td style={TD('left')}>
                      <input type="date" value={row.date||''} onChange={e=>upRow(row.id,'date',e.target.value)} readOnly={isLocked} style={{ ...inlineInputStyle(), fontSize:12, cursor:isLocked?'not-allowed':'text' }} onFocus={e=>(!isLocked&&(e.target.style.borderColor=C.navyBg2))} onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('left')}>
                      <select value={row.acct||''} onChange={e=>upRow(row.id,'acct',e.target.value)} disabled={isLocked}
                        style={{ ...inlineInputStyle(), background:c.bg, color:c.fg, border:`1px solid ${c.border}`, fontSize:11, fontWeight:700, padding:'3px 6px', cursor:isLocked?'not-allowed':'pointer' }}>
                        {acctKeys.map(k=><option key={k} value={k}>{ACCT_COLOR[k].short}</option>)}
                      </select>
                    </td>
                    <td style={TD('left')}>
                      <input value={row.desc||''} onChange={e=>upRow(row.id,'desc',e.target.value)} readOnly={isLocked} placeholder="적요" style={{ ...inlineInputStyle(), minWidth:120, cursor:isLocked?'not-allowed':'text' }} onFocus={e=>(!isLocked&&(e.target.style.borderColor=C.navyBg2))} onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('right')}>
                      <input type="number" value={row.income||''} onChange={e=>upRow(row.id,'income',e.target.value)} readOnly={isLocked} style={{ ...inlineInputStyle(row.income?C.blue:C.textHint), width:'100%', cursor:isLocked?'not-allowed':'text' }} onFocus={e=>(!isLocked&&(e.target.style.borderColor=C.navyBg2))} onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={TD('right')}>
                      <input type="number" value={row.expense||''} onChange={e=>upRow(row.id,'expense',e.target.value)} readOnly={isLocked} style={{ ...inlineInputStyle(row.expense?C.red:C.textHint), width:'100%', cursor:isLocked?'not-allowed':'text' }} onFocus={e=>(!isLocked&&(e.target.style.borderColor=C.navyBg2))} onBlur={e=>(e.target.style.borderColor='transparent')} />
                    </td>
                    {acctFilter!=='all' && <td style={TD('right',{fontWeight:700,color:row.balance>=0?C.text:C.red})}>{fmt(row.balance)}</td>}
                    <td style={TD('center')}>
                      {!isLocked && <button onClick={()=>delRow(row.id)} style={{ background:'transparent', border:'none', cursor:'pointer', color:C.textHint, fontSize:18, lineHeight:1, padding:'0 4px' }}>×</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop:14, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <button onClick={addRow} disabled={isLocked} style={{ ...btn('navyGhost'), opacity:isLocked?0.4:1, cursor:isLocked?'not-allowed':'pointer' }}>+ 행 추가</button>
            <button onClick={renumberMonth} disabled={isLocked} title="이 달의 모든 행을 날짜순으로 정렬하고 번호를 001/002/003...으로 다시 매김"
              style={{ ...btn('secondary'), opacity:isLocked?0.4:1, cursor:isLocked?'not-allowed':'pointer' }}>🔢 번호 정리</button>
            {hasUndoForMonth && (
              <button onClick={undoRenumber} title="번호 정리 직전 상태로 복원"
                style={{ ...btn('amber'), background:C.amberBg, color:C.amber, border:`1px solid ${C.amberBorder}` }}>↶ 되돌리기</button>
            )}
            {acctFilter==='all' && (
              <select value={defaultAcct} onChange={e=>setDefaultAcct(e.target.value)} style={{ ...baseInput, width:'auto', padding:'6px 10px', fontSize:12, cursor:'pointer' }}>
                {acctKeys.map(k=><option key={k} value={k}>새 행 → {accounts[k].label}</option>)}
              </select>
            )}
            <button onClick={()=>{
              if(isLocked){ alert(`${monthLabel}은(는) 확정 잠금 상태입니다. 잠금을 먼저 해제해 주세요.`); return; }
              const target=acctFilter==='all'?'전체':accounts[acctFilter].label;
              if(window.confirm(`${monthLabel} 입출금 내역${acctFilter!=='all'?` (${target}만)`:''} 전부 삭제할까요?`)){
                const rest=acctFilter==='all'?[]:(ymData.rows||[]).filter(r=>r.acct!==acctFilter);
                setYmData({...ymData,rows:rest});
              }
            }} disabled={isLocked} style={{...btn('secondary'),color:C.red,borderColor:C.red+'44', opacity:isLocked?0.4:1, cursor:isLocked?'not-allowed':'pointer'}}>🗑 {acctFilter==='all'?'전부 삭제':'필터 계좌 삭제'}</button>
          </div>
          {displayRows.length>0 && (
            <div style={{ fontSize:13, color:C.textSub, display:'flex', gap:16, flexWrap:'wrap' }}>
              <span>입금 <span style={{ fontWeight:700, color:C.blue }}>{fmt(displayRows.reduce((s,r)=>s+(r.income||0),0))}원</span></span>
              <span>출금 <span style={{ fontWeight:700, color:C.red }}>{fmt(displayRows.reduce((s,r)=>s+(r.expense||0),0))}원</span></span>
              {acctFilter!=='all' && <span>계좌 잔액 <span style={{ fontWeight:800, color:C.navyDark }}>{fmt(computedRows.at(-1)?.balance||accounts[acctFilter].prev||0)}원</span></span>}
            </div>
          )}
        </div>
      </div>

      {/* 인쇄 */}
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
        <button onClick={()=>handleFinancePrint(monthLabel,accounts,acctKeys,totalPrev,totalCurr,ymData,acctFilter,acctNet,expectedCurr)} style={{...btn('primary'),gap:6}}>🖨️ 자금현황 인쇄</button>
      </div>
    </div>
  );
}

function handleFinancePrint(monthLabel,accounts,acctKeys,totalPrev,totalCurr,ymData,acctFilter,acctNet,expectedCurr){
  const fmt2=(n)=>Math.round(Number(n||0)).toLocaleString('ko-KR');
  const totalIncome=(ymData.rows||[]).reduce((s,r)=>s+(r.income||0),0);
  const totalExpense=(ymData.rows||[]).reduce((s,r)=>s+(r.expense||0),0);
  const totalExpectedCurr=totalPrev+totalIncome-totalExpense;

  const acctRows=acctKeys.map(k=>{
    const a=accounts[k];
    const net=acctNet(k);
    const exp=expectedCurr(k);
    const delta=(a.curr||0)-exp;
    return `<tr>
      <td>${a.label}</td>
      <td class="num">${fmt2(a.prev)}</td>
      <td class="num"><strong>${fmt2(a.curr)}</strong></td>
      <td class="num" style="color:${net>=0?'#1d4ed8':'#dc2626'}">${net>=0?'+':''}${fmt2(net)}</td>
      <td class="num">${fmt2(exp)}</td>
      <td class="num" style="color:${delta===0?'#15803d':'#92400e'}">${delta===0?'✓ 일치':'⚠ '+fmt2(delta)}</td>
    </tr>`;
  }).join('');

  const filtered=acctFilter==='all'?(ymData.rows||[]):(ymData.rows||[]).filter(r=>r.acct===acctFilter);
  const txnRows=filtered.map(r=>`<tr>
    <td>${r.no||''}</td>
    <td>${r.date||''}</td>
    <td>${accounts[r.acct]?.label||r.acct||''}</td>
    <td>${r.desc||''}</td>
    <td class="num" style="color:#1d4ed8">${r.income?fmt2(r.income):''}</td>
    <td class="num" style="color:#dc2626">${r.expense?fmt2(r.expense):''}</td>
  </tr>`).join('');

  const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:11px;color:#111;padding:20px;}
h1{font-size:16px;font-weight:800;color:#1e3a8a;margin-bottom:4px;}
h2{font-size:12px;font-weight:700;color:#1e3a8a;margin:16px 0 6px;padding-bottom:4px;border-bottom:2px solid #1e3a8a;}
.subtitle{font-size:11px;color:#666;margin-bottom:16px;}
table{width:100%;border-collapse:collapse;margin-bottom:8px;}
th{background:#1e3a8a;color:#fff;padding:6px 8px;text-align:left;font-size:10.5px;}
th.num,td.num{text-align:right;}
td{padding:5px 8px;border-bottom:1px solid #e5e7eb;}
tr:nth-child(even){background:#f8fafc;}
.total-row td{font-weight:800;background:#dbeafe;border-top:2px solid #1e3a8a;}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;}
.card{border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;}
.card-label{font-size:9.5px;color:#666;margin-bottom:2px;}
.card-value{font-size:13px;font-weight:800;}
@media print{body{padding:10px;}@page{margin:10mm;}}
</style></head><body>
<h1>태 림 전 자 공 업 주 식 회 사</h1>
<div class="subtitle">${monthLabel} 자금 현황표${acctFilter!=='all'?` · ${accounts[acctFilter]?.label} 만`:''}</div>

<div class="summary">
  <div class="card"><div class="card-label">총 잔고 (현재)</div><div class="card-value" style="color:#1e3a8a">${fmt2(totalCurr)}원</div></div>
  <div class="card"><div class="card-label">입금 합계</div><div class="card-value" style="color:#1d4ed8">${fmt2(totalIncome)}원</div></div>
  <div class="card"><div class="card-label">출금 합계</div><div class="card-value" style="color:#dc2626">${fmt2(totalExpense)}원</div></div>
  <div class="card"><div class="card-label">예상 잔고</div><div class="card-value" style="color:#15803d">${fmt2(totalExpectedCurr)}원</div></div>
</div>

<h2>예금 · 잔고 현황</h2>
<table>
  <thead><tr><th>계정</th><th class="num">전월 잔고</th><th class="num">현재 잔고</th><th class="num">거래합계</th><th class="num">예상 잔고</th><th class="num">일치</th></tr></thead>
  <tbody>${acctRows}
    <tr class="total-row"><td>합 계</td><td class="num">${fmt2(totalPrev)}</td><td class="num">${fmt2(totalCurr)}</td><td class="num">${(totalIncome-totalExpense)>=0?'+':''}${fmt2(totalIncome-totalExpense)}</td><td class="num">${fmt2(totalExpectedCurr)}</td><td></td></tr>
  </tbody>
</table>

<h2>입출금 내역${acctFilter!=='all'?` (${accounts[acctFilter]?.label})`:''}</h2>
<table>
  <thead><tr><th>No.</th><th>날짜</th><th>계좌</th><th>적요</th><th class="num">입금</th><th class="num">출금</th></tr></thead>
  <tbody>${txnRows||'<tr><td colspan="6" style="text-align:center;color:#999;padding:20px;">내역 없음</td></tr>'}
  </tbody>
</table>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;

  const w=window.open('','_blank','width=900,height=700');
  w.document.write(html);
  w.document.close();
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
  const [userPws,setUserPws]=useState(()=>{
    const overrides=store.get('tl_user_pw_overrides')||{};
    const out={};
    EXTRA_USERS_DEFAULTS.forEach(u=>{ out[u.id]=overrides[u.id]||u.pw; });
    return out;
  });
  const [userPwMsg,setUserPwMsg]=useState('');
  const saveUserPw=(id)=>{
    const newPw=(userPws[id]||'').trim();
    if(!newPw){ setUserPwMsg('⚠ 비밀번호를 입력하세요.'); setTimeout(()=>setUserPwMsg(''),3000); return; }
    const overrides=store.get('tl_user_pw_overrides')||{};
    overrides[id]=newPw;
    store.set('tl_user_pw_overrides',overrides);
    const u=EXTRA_USERS_DEFAULTS.find(x=>x.id===id);
    setUserPwMsg(`✓ ${u.name} 비밀번호가 저장됐습니다.`);
    setTimeout(()=>setUserPwMsg(''),3000);
  };
  // Telegram
  const [tgToken,setTgToken]=useState(()=>store.get('tl_telegram_token')||'');
  const [tgAdmin,setTgAdmin]=useState(()=>store.get('tl_telegram_admin')||'');
  const [tgAdmin2,setTgAdmin2]=useState(()=>store.get('tl_telegram_admin2')||'');
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
  // 공과금 보관함 (설정 페이지에도 잔존)
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
  // 백업/복원
  const backupFileRef=useRef(null);
  const [bkMsg,setBkMsg]=useState('');
  const handleExportBackup=()=>{
    const data={};
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k&&k.startsWith('tl_')){
        try{ data[k]=JSON.parse(localStorage.getItem(k)); }catch{ data[k]=localStorage.getItem(k); }
      }
    }
    const payload={ meta:{ app:'taelim-mgmt', exportedAt:new Date().toISOString(), version:1, count:Object.keys(data).length }, data };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const ts=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
    a.href=url; a.download=`taelim-backup-${ts}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setBkMsg(`✓ ${Object.keys(data).length}개 항목 백업 완료`);
    setTimeout(()=>setBkMsg(''),3500);
  };
  const handleImportBackup=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const obj=JSON.parse(ev.target.result);
        const data=obj?.data||obj;
        if(!data||typeof data!=='object') throw new Error('형식 오류');
        const keys=Object.keys(data).filter(k=>k.startsWith('tl_'));
        if(keys.length===0) throw new Error('유효한 백업 키가 없습니다');
        if(!window.confirm(`백업의 ${keys.length}개 항목으로 현재 데이터를 덮어씁니다.\n계속하시겠습니까?`)) return;
        keys.forEach(k=>{
          const v=data[k];
          try{ localStorage.setItem(k, typeof v==='string'?v:JSON.stringify(v)); }catch{}
        });
        setBkMsg('✓ 복원 완료 — 페이지를 새로고침합니다…');
        setTimeout(()=>window.location.reload(),1200);
      }catch(err){
        setBkMsg('⚠ 복원 실패: '+err.message);
        setTimeout(()=>setBkMsg(''),5000);
      }
    };
    reader.readAsText(file);
  };
  // ── 클라우드(Supabase) 백업/복원 ──
  const handleCloudBackup=async()=>{
    if(!window.confirm('현재 이 기기의 데이터를 클라우드에 업로드합니다.\n(다른 기기의 클라우드 데이터를 덮어씁니다)\n계속하시겠습니까?')) return;
    setBkMsg('☁️ 클라우드 업로드 중...');
    try{
      const rows=[];
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(!k||!k.startsWith('tl_')) continue;
        let raw=localStorage.getItem(k);
        let v; try{ v=JSON.parse(raw); }catch{ v=raw; }
        rows.push({ key:k, value:v, updated_at:new Date().toISOString() });
      }
      const{error}=await supabase.from('kv_backups').upsert(rows,{ onConflict:'key' });
      if(error) throw error;
      setBkMsg(`✓ 클라우드 업로드 완료 — ${rows.length}개 저장`);
      setTimeout(()=>setBkMsg(''),5000);
    }catch(e){
      setBkMsg('⚠ 업로드 실패: '+(e.message||e));
      setTimeout(()=>setBkMsg(''),7000);
    }
  };
  const handleCloudRestore=async()=>{
    if(!window.confirm('클라우드에서 데이터를 받아와 이 기기의 현재 데이터를 덮어씁니다.\n계속하시겠습니까?')) return;
    setBkMsg('☁️ 클라우드 다운로드 중...');
    try{
      const{data,error}=await supabase.from('kv_backups').select('key,value');
      if(error) throw error;
      const arr=data||[];
      if(arr.length===0){ setBkMsg('⚠ 클라우드에 백업 데이터가 없습니다'); setTimeout(()=>setBkMsg(''),5000); return; }
      let restored=0;
      arr.forEach(r=>{
        const k=r.key, v=r.value;
        if(k&&k.startsWith('tl_')&&v!==undefined){
          try{ localStorage.setItem(k, JSON.stringify(v)); restored++; }catch{}
        }
      });
      setBkMsg(`✓ ${restored}개 항목 복원 — 새로고침합니다…`);
      setTimeout(()=>window.location.reload(),1500);
    }catch(e){
      setBkMsg('⚠ 다운로드 실패: '+(e.message||e));
      setTimeout(()=>setBkMsg(''),7000);
    }
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
    store.set('tl_telegram_admin2',tgAdmin2);
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
          <div><FL text="박형준 (대표이사) Chat ID — 긴급호출 + 결재알림 수신" /><input value={tgAdmin} onChange={e=>setTgAdmin(e.target.value)} placeholder="예: 123456789" style={{ ...baseInput, background:C.white, fontFamily:'monospace' }} /></div>
          <div><FL text="박호준 (이사) Chat ID — 결재알림 수신 (선택)" /><input value={tgAdmin2} onChange={e=>setTgAdmin2(e.target.value)} placeholder="예: 987654321 (없으면 비워두세요)" style={{ ...baseInput, background:C.white, fontFamily:'monospace' }} /></div>
          <div><FL text="직원 Chat ID — 승인/반려 결과 수신 (선택)" /><input value={tgStaff} onChange={e=>setTgStaff(e.target.value)} placeholder="예: 555555555 (없으면 비워두세요)" style={{ ...baseInput, background:C.white, fontFamily:'monospace' }} /></div>
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
                          {['master','admin','staff','guest','pending'].map(r=><option key={r} value={r}>{r==='master'?'🔑마스터':r==='admin'?'👑대표':r==='staff'?'👤직원':r==='guest'?'👁게스트':'⏳대기'}</option>)}
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
        <div style={{ display:'grid', gridTemplateColumns: role==='master'?'1fr 1fr 1fr':'1fr 1fr', gap:20 }}>
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

      {role==='master' && (
        <div style={CARD}>
          <SecHead icon="👥" title="사용자 비밀번호 관리" />
          <div style={{ fontSize:12, color:C.textSub, marginBottom:14, lineHeight:1.6 }}>
            아버지·작은아버지·직원·게스트가 로그인할 때 쓰는 비밀번호를 변경합니다. (마스터 비번은 위 카드에서 따로 관리)
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
            {EXTRA_USERS_DEFAULTS.map(u=>{
              const roleLabel=u.role==='admin'?'👑 이사':u.role==='staff'?'👤 직원':'👁 게스트';
              return (
                <div key={u.id} style={{ background:C.borderLight, padding:'12px 14px', borderRadius:10, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:12.5, fontWeight:600, color:C.navy, marginBottom:6 }}>
                    {u.name} <span style={{ fontSize:11, color:C.textHint, fontWeight:400 }}>({u.formal} · {roleLabel})</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <input type="text" value={userPws[u.id]||''}
                      onChange={(e)=>setUserPws(p=>({...p,[u.id]:e.target.value}))}
                      style={{ ...baseInput, flex:1, background:C.white }} />
                    <button onClick={()=>saveUserPw(u.id)} style={{ ...btn('navyGhost'), height:34, padding:'0 14px' }}>저장</button>
                  </div>
                </div>
              );
            })}
          </div>
          {userPwMsg && <div style={{ marginTop:12, fontSize:12.5, fontWeight:600, color:userPwMsg.includes('✓')?C.green:C.red }}>{userPwMsg}</div>}
        </div>
      )}

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

      {/* ── 데이터 백업 / 복원 ── */}
      <div style={CARD}>
        <SecHead icon="💾" title="데이터 백업 / 복원" />
        <input ref={backupFileRef} type="file" accept="application/json" style={{ display:'none' }} onChange={handleImportBackup} />
        <div style={{ background:'#FFF8E6', border:`1px solid #F5D78A`, borderRadius:8, padding:'10px 12px', marginBottom:12, fontSize:12.5, color:'#7A5300', lineHeight:1.6 }}>
          ⚠ 브라우저 캐시·쿠키를 지우면 검침/자금현황/임차인/사용자/비밀번호 등 <b>모든 로컬 데이터가 삭제</b>됩니다. 정기적으로 백업 파일을 받아두세요.
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <button onClick={handleExportBackup} style={btn('primary')}>📥 전체 백업 다운로드 (.json)</button>
          <button onClick={()=>{ backupFileRef.current.value=''; backupFileRef.current.click(); }} style={btn('navyGhost')}>📤 백업 파일에서 복원</button>
        </div>
        <div style={{ marginTop:14, paddingTop:14, borderTop:`1px dashed ${C.border}` }}>
          <div style={{ fontSize:12.5, fontWeight:700, color:C.text, marginBottom:8 }}>☁️ 클라우드 동기화 (기기 간 데이터 공유)</div>
          <div style={{ background:'#E8F4FD', border:`1px solid #93C5FD`, borderRadius:8, padding:'10px 12px', marginBottom:10, fontSize:12, color:'#1E40AF', lineHeight:1.6 }}>
            ① <b>데이터가 있는 기기</b>에서 "클라우드에 업로드" 클릭<br/>
            ② <b>다른 기기</b>에서 "클라우드에서 복원" 클릭하면 같은 데이터로 동기화됨
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={handleCloudBackup} style={btn('primary')}>☁️⬆ 클라우드에 업로드</button>
            <button onClick={handleCloudRestore} style={btn('navyGhost')}>☁️⬇ 클라우드에서 복원</button>
          </div>
        </div>
        {bkMsg && <div style={{ marginTop:10, fontSize:12.5, fontWeight:600, color:bkMsg.includes('✓')?C.green:bkMsg.includes('☁')?C.text:C.red }}>{bkMsg}</div>}
        <div style={{ marginTop:10, fontSize:11.5, color:C.textHint, lineHeight:1.6 }}>
          포함 항목: 검침/히스토리, 자금현황, 임차인, 사용자, 비밀번호(평문), 출퇴근, 결재, 알림 토큰, 고지서 이미지 등 모든 <code>tl_*</code> 데이터.
          <br/>※ 전표는 Supabase에 별도 저장되어 백업 대상이 아닙니다.
          <br/>※ 클라우드 업로드 시 1MB 이상 항목(대용량 이미지)은 자동 스킵됩니다.
        </div>
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
  const [photos,setPhotos]=useState([]);
  const [recipient,setRecipient]=useState('both');
  const [urgent,setUrgent]=useState(false);
  const [submitMsg,setSubmitMsg]=useState('');
  const [photoModal,setPhotoModal]=useState(null);
  const photoFileRef=useRef(null);

  const saveAuthor=(v)=>{ setAuthor(v); store.set('tl_report_author',v); };
  const addTodayTask=()=>setTodayTasks(t=>[...t,{id:Date.now(),done:false,text:''}]);
  const updTodayTask=(id,field,val)=>setTodayTasks(t=>t.map(r=>r.id===id?{...r,[field]:val}:r));
  const delTodayTask=(id)=>setTodayTasks(t=>t.filter(r=>r.id!==id));
  const addNextTask=()=>setNextTasks(t=>[...t,{id:Date.now(),text:''}]);
  const updNextTask=(id,val)=>setNextTasks(t=>t.map(r=>r.id===id?{...r,text:val}:r));
  const delNextTask=(id)=>setNextTasks(t=>t.filter(r=>r.id!==id));

  const handlePhotoUpload=async(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length) return;
    const added=[];
    for(const f of files){
      const url=await compressImage(f,1400,0.7);
      if(url) added.push({ id:Date.now()+Math.random(), url, name:f.name });
    }
    setPhotos(p=>[...p,...added]);
    if(photoFileRef.current) photoFileRef.current.value='';
  };
  const delPhoto=(id)=>setPhotos(p=>p.filter(x=>x.id!==id));

  const buildReportContent=()=>{
    const isWeekly=reportType==='weekly';
    const periodText=isWeekly?getWeekRange(date):dateLabel(date);
    const lines=[];
    lines.push(`📅 ${isWeekly?'주간':'일일'} 업무 보고`);
    lines.push(`기간: ${periodText}`);
    lines.push('');
    lines.push(`【${isWeekly?'주간':'금일'} 수행 업무】`);
    todayTasks.filter(t=>t.text.trim()).forEach(t=>lines.push(`${t.done?'✅':'○'} ${t.text}`));
    if(issues.trim()){ lines.push(''); lines.push('【특이사항 / 비고】'); lines.push(issues.trim()); }
    const validNext=nextTasks.filter(t=>t.text.trim());
    if(validNext.length){ lines.push(''); lines.push(`【${isWeekly?'차주':'익일'} 예정 업무】`); validNext.forEach((t,i)=>lines.push(`${i+1}. ${t.text}`)); }
    if(isWeekly && weekNote.trim()){ lines.push(''); lines.push('【주간 종합 의견】'); lines.push(weekNote.trim()); }
    return lines.join('\n');
  };

  const submitToApproval=async()=>{
    if(!author.trim()){ setSubmitMsg('⚠ 작성자 이름을 입력하세요.'); setTimeout(()=>setSubmitMsg(''),4000); return; }
    const validTasks=todayTasks.filter(t=>t.text.trim());
    if(validTasks.length===0 && !issues.trim()){ setSubmitMsg('⚠ 수행 업무 또는 특이사항을 입력하세요.'); setTimeout(()=>setSubmitMsg(''),4000); return; }
    const isWeekly=reportType==='weekly';
    const periodText=isWeekly?getWeekRange(date):dateLabel(date);
    const title=`${isWeekly?'주간':'일일'} 업무보고 · ${periodText}`;
    const content=buildReportContent();
    const item={
      id:Date.now(), type:'report', urgent,
      title, content, author:author.trim(),
      recipient, photos: photos.map(p=>({id:p.id, url:p.url, name:p.name})),
      submittedAt:new Date().toISOString(), status:'pending',
      reviewNote:'', reviewedAt:null,
    };
    const existing=store.get('tl_approvals')||[];
    store.set('tl_approvals',[item,...existing]);

    const token=store.get('tl_telegram_token');
    const admin=store.get('tl_telegram_admin');
    const admin2=store.get('tl_telegram_admin2');
    if(!token){ setSubmitMsg('✓ 전자결재 제출 완료 (Telegram 미설정 — 결재 탭에서 확인)'); setTimeout(()=>setSubmitMsg(''),6000); return; }
    const urgTag=urgent?'🚨 <b>[긴급]</b> ':'';
    const recipLabel={hyungjun:'박형준 대표이사',hojun:'박호준 이사',both:'박형준 대표이사 + 박호준 이사'}[recipient]||'';
    const photoNote=photos.length?`\n📷 첨부 사진: ${photos.length}장`:'';
    const txt=`${urgTag}📋 ${isWeekly?'주간':'일일'} <b>업무보고</b>\n\n작성자: ${author.trim()}\n수신: ${recipLabel}\n기간: ${periodText}${photoNote}\n\n${content.slice(0,500)}\n\n🕒 ${new Date().toLocaleString('ko-KR')}\n\n👉 <i>전자결재 탭에서 확인 후 처리해주세요.</i>`;
    const targets=[];
    if((recipient==='hyungjun'||recipient==='both')&&admin) targets.push({chat:admin,name:'박형준'});
    if((recipient==='hojun'||recipient==='both')&&admin2) targets.push({chat:admin2,name:'박호준'});
    if(targets.length===0){ setSubmitMsg('✓ 제출 완료 (수신자 Chat ID 미설정)'); setTimeout(()=>setSubmitMsg(''),6000); return; }
    const results=await Promise.all(targets.map(t=>sendTelegram(token,t.chat,txt)));
    const oks=results.filter(r=>r.ok).length;
    setSubmitMsg(oks===targets.length?`✓ 제출 완료 · ${targets.map(t=>t.name).join('·')}님께 Telegram 알림`:`✓ 제출 완료 · 일부 알림 실패 (${oks}/${targets.length})`);
    setTimeout(()=>setSubmitMsg(''),6000);
  };

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

      <div style={CARD}>
        <SecHead icon="📷" title="사진 첨부" action={
          <button onClick={()=>{ if(photoFileRef.current){ photoFileRef.current.value=''; photoFileRef.current.click(); } }}
            style={{ ...btn('navyGhost'), height:28, padding:'0 12px', fontSize:12 }}>+ 사진 추가</button>
        } />
        <input ref={photoFileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handlePhotoUpload} />
        {photos.length===0 ? (
          <div style={{ color:C.textHint, fontSize:13, textAlign:'center', padding:'24px 0', border:`2px dashed ${C.border}`, borderRadius:10 }}>
            보고서에 첨부할 사진을 추가하세요. (현장 사진, 영수증, 자료 등)
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
            {photos.map(p=>(
              <div key={p.id} style={{ position:'relative', background:C.borderLight, borderRadius:10, overflow:'hidden', border:`1px solid ${C.border}` }}>
                <img src={p.url} alt={p.name} onClick={()=>setPhotoModal(p.url)}
                  style={{ width:'100%', height:110, objectFit:'cover', display:'block', cursor:'zoom-in' }} />
                <button onClick={()=>delPhoto(p.id)}
                  style={{ position:'absolute', top:4, right:4, background:'rgba(0,0,0,0.6)', border:'none', color:'#fff', borderRadius:'50%', width:22, height:22, cursor:'pointer', fontSize:14, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={CARD}>
        <SecHead icon="📤" title="전자결재로 제출" />
        <div style={{ marginBottom:10 }}>
          <FL text="결재자 선택" />
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {[['hyungjun','👑 박형준 대표이사'],['hojun','👑 박호준 이사'],['both','👑 두 분 모두']].map(([v,l])=>(
              <button key={v} onClick={()=>setRecipient(v)}
                style={{ ...btn(recipient===v?'active':'ghost'), height:32, fontSize:12 }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <button onClick={()=>setUrgent(!urgent)}
            style={{ ...btn(urgent?'danger':'secondary'), height:32, fontSize:12 }}>
            {urgent?'🚨 긴급으로 표시됨':'긴급 아님'}
          </button>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={handlePrint} style={btn('secondary')}>🖨️ PDF 출력 / 인쇄</button>
          <button onClick={submitToApproval} style={btn('primary')}>📤 전자결재로 제출</button>
          {submitMsg && <span style={{ fontSize:12.5, fontWeight:600, color:submitMsg.includes('✓')?C.green:submitMsg.includes('⚠')?C.red:C.textSub }}>{submitMsg}</span>}
        </div>
        <div style={{ marginTop:10, fontSize:11.5, color:C.textHint, lineHeight:1.6 }}>
          제출하면 전자결재 탭의 [결재 대기] 목록에 사진과 함께 올라가고, 결재자에게 Telegram 알림이 발송됩니다.
        </div>
      </div>

      {photoModal && (
        <div onClick={()=>setPhotoModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16, cursor:'zoom-out' }}>
          <img src={photoModal} alt="첨부 사진" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
        </div>
      )}
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

const VOUCHER_TYPES = {
  income:   { title:'입 금 전 표', short:'입금전표', accent:'#DC2626', badge:'RECEIPT · 入金', badgeBg:'#FEE2E2', badgeFg:'#991B1B', titleColor:'#DC2626' },
  expense:  { title:'출 금 전 표', short:'출금전표', accent:'#1D4ED8', badge:'PAYMENT · 出金', badgeBg:'#DBEAFE', badgeFg:'#1E3A8A', titleColor:'#1D4ED8' },
  transfer: { title:'대 체 전 표', short:'대체전표', accent:'#111111', badge:'JOURNAL · 振替', badgeBg:'#F3F2EE', badgeFg:'#111111', titleColor:'#111111' },
};

const VOUCHER_CSS = `
.vt { font-family:'Malgun Gothic','맑은 고딕',sans-serif; margin:0 0 1.2rem; }
.vt .frame { background:#FFFFFF; border:1px solid #E8E6DF; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05); }
.vt .accent { height:3px; }
.vt .head { display:flex; padding:18px 22px; gap:20px; align-items:flex-start; border-bottom:1px solid #EFEDE6; flex-wrap:wrap; }
.vt .h-left { flex:1; min-width:240px; }
.vt .h-co { font-size:11px; color:#999; letter-spacing:2px; margin-bottom:8px; font-weight:500; }
.vt .h-title-row { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
.vt .h-title { font-size:21px; font-weight:500; letter-spacing:9px; color:#111; }
.vt .h-badge { font-size:11px; padding:3px 8px; border-radius:3px; letter-spacing:1.5px; font-weight:500; }
.vt .h-meta { display:flex; gap:20px; font-size:12.5px; color:#555; flex-wrap:wrap; align-items:center; }
.vt .h-meta input.ed { font-family:inherit; font-size:12.5px; border:none; border-bottom:1px dotted #BBB; outline:none; padding:1px 5px; background:transparent; min-width:32px; color:#111; text-align:center; }
.vt .h-meta input.ed:focus { background:#FFF8DD; border-bottom-color:#B89200; }
.vt .h-meta input.ed-no { min-width:90px; text-align:left; }
.vt .appr { display:flex; gap:5px; }
.vt .appr-cell { width:60px; border:1px solid #E8E6DF; border-radius:4px; overflow:hidden; background:#fff; cursor:pointer; transition:background 0.15s; }
.vt .appr-cell:hover { background:#FFFAEC; }
.vt .appr-lbl { background:#FAFAF6; font-size:11px; text-align:center; padding:5px 0; border-bottom:1px solid #EFEDE6; font-weight:500; letter-spacing:1px; color:#666; }
.vt .appr-st { height:46px; display:flex; align-items:center; justify-content:center; }
.vt .stamp-mark { width:32px; height:32px; border:1.5px solid #C53030; color:#C53030; border-radius:50%; font-size:16px; font-weight:600; display:flex; align-items:center; justify-content:center; transform:rotate(-6deg); font-family:serif; }
.vt table { border-collapse:collapse; width:100%; table-layout:fixed; }
.vt th { background:#FBFAF6; font-size:11px; font-weight:500; text-align:center; padding:11px 4px; color:#777; letter-spacing:1.5px; border-bottom:1px solid #EFEDE6; }
.vt td { padding:0; font-size:12.5px; color:#222; border-bottom:1px solid #F2F0EA; height:36px; vertical-align:middle; }
.vt input.cell { width:100%; height:36px; padding:8px 10px; outline:none; border:none; background:transparent; font-family:inherit; font-size:12.5px; color:#222; box-sizing:border-box; }
.vt input.cell:focus { background:#FFF8DD; }
.vt td.num input.cell { text-align:right; font-variant-numeric:tabular-nums; color:#222; }
.vt .vsep { border-right:1px solid #D5D2C9; }
.vt .hsep { border-right:1px solid #EFEDE6; }
.vt .sum td { background:#FAF9F4; font-weight:500; padding:13px 10px; border-bottom:none; border-top:1px solid #DDD9CF; color:#111; }
.vt .sum .lbl-cell { letter-spacing:6px; text-align:center; color:#555; font-size:12.5px; }
.vt .sum td.num { text-align:right; font-variant-numeric:tabular-nums; color:#111; font-weight:700; }
.vt .footer-row { display:flex; justify-content:space-between; align-items:center; padding:11px 22px; border-top:1px dashed #DDD9CF; background:#FDFCF8; font-size:11.5px; }
.vt .add-btn-link { cursor:pointer; color:#666; font-weight:500; letter-spacing:1px; user-select:none; background:transparent; border:none; padding:4px 10px; font-family:inherit; font-size:11.5px; border-radius:4px; }
.vt .add-btn-link:hover { color:#111; background:rgba(0,0,0,0.04); }
.vt .balance { color:#999; font-size:11.5px; }
.vt .balance.ok { color:#15803D; font-weight:600; }
.vt .balance.bad { color:#C53030; font-weight:600; }
.vt .ft { padding:11px 22px 14px; display:flex; justify-content:space-between; font-size:11px; color:#888; letter-spacing:1px; flex-wrap:wrap; gap:8px; border-top:1px dashed #DDD9CF; background:#FDFCF8; }
.vt .del-row { background:transparent; border:none; cursor:pointer; color:#ddd; font-size:14px; padding:0 6px; line-height:1; }
.vt .del-row:hover { color:#C53030; }
.vt-type-btn { flex:1; min-width:120px; height:42px; font-size:13px; font-family:inherit; cursor:pointer; border-radius:6px; font-weight:600; letter-spacing:1.5px; transition:all 0.15s; }
`;

function ApprovalPage({ role }) {
  const [items,setItems]=useState(()=>store.get('tl_approvals')||[]);
  const [tab,setTab]=useState(role==='admin'?'pending':'submit');
  const [form,setForm]=useState({type:'report',title:'',content:'',urgent:false,recipient:'both'});
  const [reviewNotes,setReviewNotes]=useState({});
  const [flash,setFlash]=useState({text:'',ok:true});
  const [sending,setSending]=useState(false);
  const [confirmEmerg,setConfirmEmerg]=useState(false);
  const [emergLog,setEmergLog]=useState(()=>store.get('tl_emergency_log')||[]);
  const [emergCool,setEmergCool]=useState(false);
  const [renotifyAt,setRenotifyAt]=useState(null);
  const [photoModal,setPhotoModal]=useState(null);
  const authorName=store.get('tl_user_name')||role;

  const saveItems=(next)=>{ setItems(next); store.set('tl_approvals',next); };
  const tg=()=>({ token:store.get('tl_telegram_token'), admin:store.get('tl_telegram_admin'), admin2:store.get('tl_telegram_admin2'), staff:store.get('tl_telegram_staff') });
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
    const item={id:Date.now(),type:form.type,urgent:form.urgent,title:form.title.trim(),content:form.content.trim(),author:authorName,recipient:form.recipient,submittedAt:new Date().toISOString(),status:'pending',reviewNote:'',reviewedAt:null};
    saveItems([item,...items]);
    setForm({type:'report',title:'',content:'',urgent:false,recipient:'both'});
    const {token,admin,admin2}=tg();
    if(!token){ msg('✓ 제출 완료 (Telegram 미설정)'); return; }
    const urgTag=form.urgent?'🚨 <b>[긴급]</b> ':'';
    const typeMap={report:'📋 업무보고',request:'📝 결재요청',leave:'🗓 휴가/조퇴'};
    const recipLabel={hyungjun:'박형준 대표이사',hojun:'박호준 이사',both:'박형준 대표이사 + 박호준 이사'}[form.recipient]||'';
    const txt=`${urgTag}${typeMap[form.type]||''} <b>결재 요청</b>\n\n작성자: ${authorName}\n수신: ${recipLabel}\n제목: <b>${form.title}</b>\n\n${form.content?form.content.slice(0,400):'(내용 없음)'}\n\n🕒 ${new Date().toLocaleString('ko-KR')}\n\n👉 <i>전자결재 탭에서 확인 후 처리해주세요.</i>`;
    const targets=[];
    if((form.recipient==='hyungjun'||form.recipient==='both')&&admin)  targets.push({chat:admin,name:'박형준'});
    if((form.recipient==='hojun'||form.recipient==='both')&&admin2)    targets.push({chat:admin2,name:'박호준'});
    if(targets.length===0){ msg('✓ 제출 완료 (수신자 Chat ID 미설정)'); return; }
    const results=await Promise.all(targets.map(t=>sendTelegram(token,t.chat,txt)));
    const oks=results.filter(r=>r.ok).length;
    msg(oks===targets.length?`✓ 제출 완료 · ${targets.map(t=>t.name).join('·')}님께 Telegram 알림`:`✓ 제출 완료 · 일부 알림 실패 (${oks}/${targets.length})`,oks>0);
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
      <div style={{ background:'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)', borderRadius:16, padding:'20px 24px', marginBottom:16, boxShadow:'0 8px 32px rgba(220,38,38,0.35)' }}>
        {/* 상단 타이틀 */}
        <div style={{ textAlign:'center', marginBottom:18, borderBottom:'1px solid rgba(255,255,255,0.2)', paddingBottom:16 }}>
          <div style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:'4px', textShadow:'0 3px 12px rgba(0,0,0,0.4)', fontFamily:"'Arial Black',Arial,sans-serif" }}>전자결재 · 소방안전</div>
          <div style={{ fontSize:11.5, color:'rgba(255,255,255,0.55)', marginTop:6, letterSpacing:'3px', fontWeight:600 }}>ELECTRONIC APPROVAL &nbsp;|&nbsp; FIRE SAFETY</div>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14 }}>
          <div style={{ color:'#fff' }}>
            <div style={{ fontSize:17, fontWeight:900, letterSpacing:'-0.3px', marginBottom:4 }}>🚨 긴급 호출</div>
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

      {/* 결재 요청 (직원/사장님) */}
      {tab==='submit' && (role==='staff'||role==='master') && (
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
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11.5, color:C.textSub, marginBottom:6 }}>결재자 선택</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {[['hyungjun','👑 박형준 대표이사'],['hojun','👑 박호준 이사'],['both','👑 두 분 모두']].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(f=>({...f,recipient:v}))}
                  style={{ ...btn(form.recipient===v?'active':'ghost'), height:32, fontSize:12 }}>{l}</button>
              ))}
            </div>
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
              {item.photos?.length>0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11.5, color:C.textSub, marginBottom:6, fontWeight:600 }}>📷 첨부 사진 ({item.photos.length}장)</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:8 }}>
                    {item.photos.map(p=>(
                      <img key={p.id} src={p.url} alt={p.name||''} onClick={()=>setPhotoModal(p.url)}
                        style={{ width:'100%', height:90, objectFit:'cover', borderRadius:8, border:`1px solid ${C.border}`, cursor:'zoom-in', display:'block' }} />
                    ))}
                  </div>
                </div>
              )}
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

      {photoModal && (
        <div onClick={()=>setPhotoModal(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300, padding:16, cursor:'zoom-out' }}>
          <img src={photoModal} alt="첨부 사진" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
        </div>
      )}
    </div>
  );
}

// ─── Voucher Page (전표) ──────────────────────────────────────
function VoucherPage({ role }) {
  const [vouchers,setVouchers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState('write');
  const [vType,setVType]=useState('income');
  const [form,setForm]=useState(()=>emptyVoucherForm('income'));
  const [editId,setEditId]=useState(null);
  const [filter,setFilter]=useState({type:'all',month:'',q:''});
  const [flash,setFlash]=useState('');
  const authorName=store.get('tl_user_name')||role;

  useEffect(()=>{
    if(document.getElementById('tl-voucher-css')) return;
    const style=document.createElement('style');
    style.id='tl-voucher-css';
    style.textContent=VOUCHER_CSS;
    document.head.appendChild(style);
  },[]);

  const msg=(t)=>{ setFlash(t); setTimeout(()=>setFlash(''),3000); };

  // DB ↔ 폼 변환 (rows를 note 필드에 JSON으로 직렬화)
  const vToDb=(v)=>{
    const total=computeTotal(v.rows,v.type);
    return {
      id:v.id, vno:v.vno, type:v.type, date:v.date,
      amount:total,
      note:JSON.stringify({rows:v.rows,summary:v.summary||''}),
      debit_acct:'', credit_acct:'', account:'', payee:'',
      file_url:null, file_name:null,
      author:v.author||'', created_at:v.createdAt||'',
      status:v.status||'draft', approvals:v.approvals||{},
    };
  };
  const dbToV=(r)=>{
    let rows=null, summary='';
    if(r.note){
      try{
        const p=JSON.parse(r.note);
        if(p&&Array.isArray(p.rows)){ rows=p.rows; summary=p.summary||''; }
      }catch{/* 레거시 텍스트 note */}
    }
    if(!rows){
      // 레거시(단일행) 자동 변환
      if(r.type==='transfer'){
        rows=[{dr_acct:r.debit_acct||'',dr_note:r.note||'',dr_amt:r.amount||0,cr_acct:r.credit_acct||'',cr_note:'',cr_amt:r.amount||0}];
      } else {
        rows=[{acct:r.account||'',payee:r.payee||'',note:r.note||'',amount:r.amount||0}];
      }
    }
    // 결재 키 마이그레이션
    const keyMap={'이사':'담당','부사장':'검토','대표':'확인'};
    const apr={};
    Object.entries(r.approvals||{}).forEach(([k,vv])=>{ apr[keyMap[k]||k]=vv; });
    return { id:r.id, vno:r.vno, type:r.type, date:r.date, rows, summary, author:r.author, createdAt:r.created_at, status:r.status, approvals:apr };
  };

  useEffect(()=>{
    const load=async()=>{
      setLoading(true);
      const{data,error}=await supabase.from('vouchers').select('*').order('id',{ascending:false});
      if(error){ console.error(error); msg('⚠ DB 로드 실패: '+error.message); }
      else setVouchers((data||[]).map(dbToV));
      setLoading(false);
    };
    load();
  },[]);

  const getVNo=(type,dateStr)=>{
    const prefix=type==='income'?'입':type==='expense'?'출':'분';
    const yy=Number((dateStr||form.date||'').slice(0,4))||new Date().getFullYear();
    const yy2=yy%100;
    // 같은 연도+타입의 최대 번호 + 1 (삭제 후에도 충돌 없음)
    const re=new RegExp(`^${prefix}-${yy2}(\\d+)$`);
    const maxSeq=vouchers
      .filter(v=>v.type===type&&(v.date||'').startsWith(String(yy)))
      .map(v=>{const m=String(v.vno||'').match(re);return m?Number(m[1]):0;})
      .reduce((a,b)=>Math.max(a,b),0);
    return `${prefix}-${yy2}${String(maxSeq+1).padStart(3,'0')}`;
  };

  const newForm=(type)=>{ setVType(type); setForm({...emptyVoucherForm(type),vno:getVNo(type)}); setEditId(null); };

  useEffect(()=>{
    if(!loading&&!form.vno){ setForm(f=>({...f,vno:getVNo(vType)})); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading]);

  const updateRow=(i,field,val)=>setForm(f=>({...f,rows:f.rows.map((r,idx)=>idx===i?{...r,[field]:val}:r)}));
  const addRow=()=>setForm(f=>({...f,rows:[...f.rows,vType==='transfer'?emptyJournalRow():emptyRow()]}));
  const delRow=(i)=>setForm(f=>({...f,rows:f.rows.length>1?f.rows.filter((_,idx)=>idx!==i):f.rows}));
  const toggleStamp=(slot)=>setForm(f=>{
    const apr={...f.approvals};
    if(apr[slot]) delete apr[slot];
    else apr[slot]={name:authorName,at:new Date().toISOString()};
    return {...f,approvals:apr};
  });

  const submitVoucher=async()=>{
    const total=computeTotal(form.rows,vType);
    if(total<=0){ msg('⚠ 금액을 입력하세요.'); return; }
    if(vType==='transfer'){
      const{dr,cr}=computeJournalTotals(form.rows);
      if(dr!==cr){ if(!window.confirm(`차변(${fmt(dr)})·대변(${fmt(cr)}) 합계가 다릅니다.\n그래도 저장하시겠습니까?`)) return; }
    }
    const v={
      id:editId||Date.now(),
      vno:form.vno||getVNo(vType),
      type:vType, date:form.date,
      rows:form.rows.filter(rowHasContent), summary:form.summary,
      author:editId?(form.author||authorName):authorName,
      createdAt:editId?(form.createdAt||new Date().toISOString()):new Date().toISOString(),
      status:'draft', approvals:form.approvals||{},
    };
    if(v.rows.length===0){ msg('⚠ 입력된 행이 없습니다.'); return; }
    const{error}=await supabase.from('vouchers').upsert(vToDb(v));
    if(error){ msg('⚠ 저장 실패: '+error.message); return; }
    setVouchers(prev=>{ const idx=prev.findIndex(x=>x.id===v.id); return idx>=0?prev.map(x=>x.id===v.id?v:x):[v,...prev]; });
    msg(editId?'✓ 전표가 수정됐습니다.':'✓ 전표가 저장됐습니다.');
    newForm(vType);
    setTab('list');
  };

  const editVoucher=(v)=>{
    setVType(v.type);
    setForm({date:v.date,vno:v.vno,rows:v.rows.length?v.rows:(v.type==='transfer'?[emptyJournalRow()]:[emptyRow()]),summary:v.summary||'',approvals:v.approvals||{},author:v.author,createdAt:v.createdAt});
    setEditId(v.id);
    setTab('write');
  };

  const deleteV=async(id)=>{
    const v=vouchers.find(x=>x.id===id);
    const total=v?computeTotal(v.rows,v.type):0;
    const meta=v?VOUCHER_TYPES[v.type]:null;
    const label=v?`${meta?.short||''} ${v.vno||''} (${v.date||''}) · ${fmt(total)}원`:'';
    if(!window.confirm(`다음 전표를 삭제할까요?\n\n${label}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    const{error}=await supabase.from('vouchers').delete().eq('id',id);
    if(error){ msg('⚠ 삭제 실패: '+error.message); return; }
    setVouchers(prev=>prev.filter(vv=>vv.id!==id));
    msg('✓ 전표가 삭제됐습니다.');
  };

  const exportExcel=()=>{
    if(typeof XLSX==='undefined'){ msg('⚠ XLSX 라이브러리 로드 실패. 새로고침 후 다시 시도해주세요.'); return; }
    if(displayV.length===0){ msg('⚠ 내보낼 전표가 없습니다.'); return; }
    const apprName=(v,slot)=>v.approvals?.[slot]?.name||'';
    const rows=displayV.flatMap(v=>{
      const typeLabel=VOUCHER_TYPES[v.type]?.short||v.type;
      const common={ 일자:v.date||'', 전표번호:v.vno||'', 구분:typeLabel,
        작성자:v.author||'', 담당:apprName(v,'담당'), 검토:apprName(v,'검토'), 확인:apprName(v,'확인') };
      return (v.rows||[]).map(r=>{
        if(v.type==='income'){
          return { ...common, 차변과목:'', 차변금액:'', 대변과목:r.acct||'', 대변금액:Number(r.amount)||'',
            거래처:r.payee||'', 적요:r.note||'' };
        }
        if(v.type==='expense'){
          return { ...common, 차변과목:r.acct||'', 차변금액:Number(r.amount)||'', 대변과목:'', 대변금액:'',
            거래처:r.payee||'', 적요:r.note||'' };
        }
        return { ...common, 차변과목:r.dr_acct||'', 차변금액:Number(r.dr_amt)||'',
          대변과목:r.cr_acct||'', 대변금액:Number(r.cr_amt)||'',
          거래처:'', 적요:[r.dr_note,r.cr_note].filter(Boolean).join(' / ') };
      });
    });
    const cols=['일자','전표번호','구분','차변과목','차변금액','대변과목','대변금액','거래처','적요','작성자','담당','검토','확인'];
    const ordered=rows.map(r=>{const o={};cols.forEach(k=>o[k]=r[k]??'');return o;});
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(ordered,{header:cols});
    ws['!cols']=[{wch:12},{wch:11},{wch:8},{wch:14},{wch:13},{wch:14},{wch:13},{wch:16},{wch:30},{wch:10},{wch:10},{wch:10},{wch:10}];
    XLSX.utils.book_append_sheet(wb,ws,'전표내역');
    // 월별 요약
    const monthly={};
    displayV.forEach(v=>{
      const ym=(v.date||'').slice(0,7); if(!ym) return;
      if(!monthly[ym]) monthly[ym]={입금:0,출금:0,대체:0};
      const t=computeTotal(v.rows,v.type);
      if(v.type==='income') monthly[ym].입금+=t;
      else if(v.type==='expense') monthly[ym].출금+=t;
      else monthly[ym].대체+=t;
    });
    const sumRows=Object.keys(monthly).sort().map(ym=>({
      월:ym, 입금:monthly[ym].입금, 출금:monthly[ym].출금,
      순액:monthly[ym].입금-monthly[ym].출금, 대체:monthly[ym].대체 }));
    if(sumRows.length){
      const ws2=XLSX.utils.json_to_sheet(sumRows,{header:['월','입금','출금','순액','대체']});
      ws2['!cols']=[{wch:10},{wch:14},{wch:14},{wch:14},{wch:14}];
      XLSX.utils.book_append_sheet(wb,ws2,'월별요약');
    }
    const today=new Date().toISOString().slice(0,10);
    const tag=filter.month?`_${filter.month}`:filter.type!=='all'?`_${VOUCHER_TYPES[filter.type]?.short||filter.type}`:'';
    XLSX.writeFile(wb,`전표${tag}_${today}.xlsx`);
    msg(`✓ ${displayV.length}건 내보내기 완료`);
  };

  const handlePrint=(v)=>{
    const meta=VOUCHER_TYPES[v.type]||VOUCHER_TYPES.income;
    const total=computeTotal(v.rows,v.type);
    const{dr,cr}=v.type==='transfer'?computeJournalTotals(v.rows):{dr:0,cr:0};
    const stampHtml=(slot)=>{
      const ap=v.approvals?.[slot];
      return `<div class="appr-cell"><div class="appr-lbl">${slot}</div><div class="appr-st">${ap?'<span class="stamp-mark">印</span>':''}</div></div>`;
    };
    const tableHtml=v.type==='transfer'?
      `<table>
        <colgroup><col style="width:14%"><col><col style="width:16%"><col style="width:14%"><col><col style="width:16%"></colgroup>
        <thead><tr>
          <th class="hsep">차변과목</th><th class="hsep">적　요</th><th class="vsep">차 변 금 액</th>
          <th class="hsep">대변과목</th><th class="hsep">적　요</th><th>대 변 금 액</th>
        </tr></thead>
        <tbody>
          ${v.rows.map(r=>`<tr>
            <td class="hsep"><span class="cell">${esc(r.dr_acct)}</span></td>
            <td class="hsep"><span class="cell">${esc(r.dr_note)}</span></td>
            <td class="num vsep"><span class="cell">${r.dr_amt?fmtN(r.dr_amt):''}</span></td>
            <td class="hsep"><span class="cell">${esc(r.cr_acct)}</span></td>
            <td class="hsep"><span class="cell">${esc(r.cr_note)}</span></td>
            <td class="num"><span class="cell">${r.cr_amt?fmtN(r.cr_amt):''}</span></td>
          </tr>`).join('')}
          <tr class="sum"><td colspan="2" class="lbl-cell hsep">차변 합계</td><td class="num vsep">${fmtN(dr)}</td><td colspan="2" class="lbl-cell hsep">대변 합계</td><td class="num">${fmtN(cr)}</td></tr>
        </tbody>
      </table>`
      :`<table>
        <colgroup><col style="width:18%"><col style="width:18%"><col><col style="width:18%"></colgroup>
        <thead><tr>
          <th class="hsep">계정과목</th><th class="hsep">거래처</th><th class="hsep">적　　　요</th><th>금　　　액</th>
        </tr></thead>
        <tbody>
          ${v.rows.map(r=>`<tr>
            <td class="hsep"><span class="cell">${esc(r.acct)}</span></td>
            <td class="hsep"><span class="cell">${esc(r.payee)}</span></td>
            <td class="hsep"><span class="cell">${esc(r.note)}</span></td>
            <td class="num"><span class="cell">${r.amount?fmtN(r.amount):''}</span></td>
          </tr>`).join('')}
          <tr class="sum"><td colspan="3" class="lbl-cell hsep">합　계</td><td class="num">${fmtN(total)}</td></tr>
        </tbody>
      </table>`;
    const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>${meta.short} ${v.vno||''}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;padding:20px;background:#fff;}
.vt{margin:0 auto;max-width:780px;}
.vt .frame{background:#fff;border:1px solid #E8E6DF;border-radius:8px;overflow:hidden;}
.vt .accent{height:3px;background:${meta.accent};}
.vt .head{display:flex;padding:18px 22px;gap:20px;align-items:flex-start;border-bottom:1px solid #EFEDE6;}
.vt .h-left{flex:1;min-width:0;}
.vt .h-co{font-size:11px;color:#999;letter-spacing:2px;margin-bottom:8px;font-weight:500;}
.vt .h-title-row{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
.vt .h-title{font-size:21px;font-weight:500;letter-spacing:9px;color:${meta.titleColor};}
.vt .h-badge{font-size:11px;padding:3px 8px;border-radius:3px;letter-spacing:1.5px;font-weight:500;background:${meta.badgeBg};color:${meta.badgeFg};}
.vt .h-meta{display:flex;gap:20px;font-size:12.5px;color:#555;flex-wrap:wrap;}
.vt .appr{display:flex;gap:5px;}
.vt .appr-cell{width:60px;border:1px solid #E8E6DF;border-radius:4px;overflow:hidden;background:#fff;}
.vt .appr-lbl{background:#FAFAF6;font-size:11px;text-align:center;padding:5px 0;border-bottom:1px solid #EFEDE6;font-weight:500;letter-spacing:1px;color:#666;}
.vt .appr-st{height:46px;display:flex;align-items:center;justify-content:center;}
.vt .stamp-mark{width:32px;height:32px;border:1.5px solid #C53030;color:#C53030;border-radius:50%;font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;transform:rotate(-6deg);font-family:serif;}
.vt table{border-collapse:collapse;width:100%;table-layout:fixed;}
.vt th{background:#FBFAF6;font-size:11px;font-weight:500;text-align:center;padding:11px 4px;color:#777;letter-spacing:1.5px;border-bottom:1px solid #EFEDE6;}
.vt td{padding:0;font-size:12.5px;color:#222;border-bottom:1px solid #F2F0EA;height:36px;vertical-align:middle;}
.vt .cell{display:block;padding:8px 10px;min-height:36px;box-sizing:border-box;}
.vt td.num .cell{text-align:right;font-variant-numeric:tabular-nums;color:#222;}
.vt .vsep{border-right:1px solid #D5D2C9;}
.vt .hsep{border-right:1px solid #EFEDE6;}
.vt .sum td{background:#FAF9F4;font-weight:600;padding:13px 10px;border-bottom:none;border-top:1px solid #DDD9CF;color:#111;}
.vt .sum .lbl-cell{letter-spacing:6px;text-align:center;color:#555;}
.vt .sum td.num{text-align:right;font-variant-numeric:tabular-nums;color:#111;font-weight:700;}
.vt .ft{padding:11px 22px 14px;display:flex;justify-content:space-between;font-size:11px;color:#888;letter-spacing:1px;border-top:1px dashed #DDD9CF;background:#FDFCF8;}
.warn{padding:9px 22px;background:#FEF3C7;color:#92400E;font-size:12px;text-align:center;border-bottom:1px solid #FDE68A;font-weight:600;}
@media print{@page{margin:14mm;}body{padding:0;}}
</style></head><body>
<div class="vt"><div class="frame">
  <div class="accent"></div>
  <div class="head">
    <div class="h-left">
      <div class="h-co">㈜ TAELIM ELECTRONICS</div>
      <div class="h-title-row">
        <div class="h-title">${meta.title}</div>
        <span class="h-badge">${meta.badge}</span>
      </div>
      <div class="h-meta">
        <span>${formatKDate(v.date)}</span>
        <span>No. ${v.vno||''}</span>
      </div>
    </div>
    <div class="appr">${stampHtml('담당')}${stampHtml('검토')}${stampHtml('확인')}</div>
  </div>
  ${v.type==='transfer'&&dr!==cr?`<div class="warn">⚠ 차변·대변 불일치 — 차이 ${fmtN(Math.abs(dr-cr))}원</div>`:''}
  ${tableHtml}
  <div class="ft"><span>${CO_ADDR}</span><span>Tel ${CO_TEL}　·　Fax ${CO_FAX}</span></div>
</div></div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){ alert('팝업이 차단됐습니다.'); return; }
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };

  // 폼 헤더의 날짜 분해
  const dp=(()=>{ const [y,m,d]=(form.date||'').split('-'); return {y:y||'',m:m||'',d:d||''}; })();
  const setDatePart=(part,val)=>{
    const next={...dp,[part]:val};
    setForm(f=>({...f,date:`${next.y}-${String(next.m||'').padStart(2,'0')}-${String(next.d||'').padStart(2,'0')}`}));
  };

  const meta=VOUCHER_TYPES[vType];
  const totals=(()=>{
    if(vType==='transfer'){
      const{dr,cr}=computeJournalTotals(form.rows);
      if(dr===0&&cr===0) return {balanceClass:'',balanceText:''};
      if(dr===cr) return {balanceClass:'ok',balanceText:`✓ 차대변 일치 · 합계 ${fmt(dr)}원`};
      return {balanceClass:'bad',balanceText:`⚠ 차이 ${fmt(Math.abs(dr-cr))}원`};
    }
    const t=computeTotal(form.rows,vType);
    return {balanceClass:'',balanceText:t?`합계 ${fmt(t)}원`:''};
  })();

  const displayV=vouchers.filter(v=>{
    if(filter.type!=='all'&&v.type!==filter.type) return false;
    if(filter.month&&!v.date.startsWith(filter.month)) return false;
    if(filter.q){
      const q=filter.q.toLowerCase();
      const hay=[v.vno,v.summary,...(v.rows||[]).flatMap(r=>[r.acct,r.payee,r.note,r.dr_acct,r.cr_acct,r.dr_note,r.cr_note])]
        .filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  const totalIncome=displayV.filter(v=>v.type==='income').reduce((s,v)=>s+computeTotal(v.rows,'income'),0);
  const totalExpense=displayV.filter(v=>v.type==='expense').reduce((s,v)=>s+computeTotal(v.rows,'expense'),0);
  const netTotal=totalIncome-totalExpense;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <span style={{fontSize:15,fontWeight:700,color:C.navyDark}}>전표 관리 {loading&&<span style={{fontSize:12,color:C.textHint,fontWeight:400}}>로딩 중...</span>}</span>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>setTab('write')} style={{...btn(tab==='write'?'primary':'secondary'),height:34}}>✏ 전표 작성</button>
          <button onClick={()=>setTab('list')} style={{...btn(tab==='list'?'primary':'secondary'),height:34}}>📋 전표 목록 ({vouchers.length})</button>
        </div>
      </div>

      {tab==='write'&&(
        <>
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            {Object.entries(VOUCHER_TYPES).map(([key,m])=>(
              <button key={key} type="button" onClick={()=>{
                if(vType===key) return;
                if(editId){
                  if(!window.confirm('편집 중인 전표를 종류 변경하면 편집이 취소됩니다. 계속할까요?')) return;
                } else if(form.rows.some(rowHasContent)){
                  if(!window.confirm('작성 중인 내용이 사라집니다. 전표 종류를 변경할까요?')) return;
                }
                newForm(key);
              }} className="vt-type-btn" style={{
                border:`1.5px solid ${vType===key?m.accent:'#E8E6DF'}`,
                background:vType===key?m.accent:'#fff',
                color:vType===key?'#fff':m.titleColor,
              }}>{m.short}</button>
            ))}
          </div>

          <div className="vt">
            <div className="frame">
              <div className="accent" style={{background:meta.accent}}></div>
              <div className="head">
                <div className="h-left">
                  <div className="h-co">㈜ TAELIM ELECTRONICS</div>
                  <div className="h-title-row">
                    <div className="h-title" style={{color:meta.titleColor}}>{meta.title}</div>
                    <span className="h-badge" style={{background:meta.badgeBg,color:meta.badgeFg}}>{meta.badge}</span>
                  </div>
                  <div className="h-meta">
                    <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
                      <input type="number" className="ed" value={dp.y} onChange={e=>setDatePart('y',e.target.value)} style={{width:50}}/> 년
                      <input type="number" className="ed" value={dp.m} onChange={e=>setDatePart('m',e.target.value)} style={{width:34}}/> 월
                      <input type="number" className="ed" value={dp.d} onChange={e=>setDatePart('d',e.target.value)} style={{width:34}}/> 일
                    </span>
                    <span style={{display:'inline-flex',alignItems:'center',gap:4}}>No. <input className="ed ed-no" value={form.vno} onChange={e=>setForm(f=>({...f,vno:e.target.value}))} placeholder="자동"/></span>
                  </div>
                </div>
                <div className="appr">
                  {['담당','검토','확인'].map(slot=>(
                    <div key={slot} className="appr-cell" onClick={()=>toggleStamp(slot)} title={form.approvals[slot]?`${form.approvals[slot].name||''} · ${fmtAt(form.approvals[slot].at)}`:'클릭하여 도장 / 재클릭 해제'}>
                      <div className="appr-lbl">{slot}</div>
                      <div className="appr-st">{form.approvals[slot]&&<span className="stamp-mark">印</span>}</div>
                    </div>
                  ))}
                </div>
              </div>

              {vType==='transfer'?(
                <table>
                  <colgroup><col style={{width:'14%'}}/><col/><col style={{width:'16%'}}/><col style={{width:'14%'}}/><col/><col style={{width:'16%'}}/></colgroup>
                  <thead><tr>
                    <th className="hsep">차변과목</th><th className="hsep">적　요</th><th className="vsep">차 변 금 액</th>
                    <th className="hsep">대변과목</th><th className="hsep">적　요</th><th>대 변 금 액</th>
                  </tr></thead>
                  <tbody>
                    {form.rows.map((r,i)=>(
                      <tr key={i}>
                        <td className="hsep"><input className="cell" list="acct-list" value={r.dr_acct||''} onChange={e=>updateRow(i,'dr_acct',e.target.value)}/></td>
                        <td className="hsep"><input className="cell" value={r.dr_note||''} onChange={e=>updateRow(i,'dr_note',e.target.value)}/></td>
                        <td className="num vsep"><AmountInput value={r.dr_amt} onChange={v=>updateRow(i,'dr_amt',v)}/></td>
                        <td className="hsep"><input className="cell" list="acct-list" value={r.cr_acct||''} onChange={e=>updateRow(i,'cr_acct',e.target.value)}/></td>
                        <td className="hsep"><input className="cell" value={r.cr_note||''} onChange={e=>updateRow(i,'cr_note',e.target.value)}/></td>
                        <td className="num" style={{position:'relative'}}>
                          <AmountInput value={r.cr_amt} onChange={v=>updateRow(i,'cr_amt',v)}/>
                          {form.rows.length>1&&<button type="button" className="del-row" onClick={()=>delRow(i)} style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)'}}>×</button>}
                        </td>
                      </tr>
                    ))}
                    <tr className="sum">
                      <td colSpan={2} className="lbl-cell hsep">차변 합계</td>
                      <td className="num vsep">{(()=>{const{dr}=computeJournalTotals(form.rows);return dr?fmt(dr):'';})()}</td>
                      <td colSpan={2} className="lbl-cell hsep">대변 합계</td>
                      <td className="num">{(()=>{const{cr}=computeJournalTotals(form.rows);return cr?fmt(cr):'';})()}</td>
                    </tr>
                  </tbody>
                </table>
              ):(
                <table>
                  <colgroup><col style={{width:'18%'}}/><col style={{width:'18%'}}/><col/><col style={{width:'18%'}}/></colgroup>
                  <thead><tr>
                    <th className="hsep">계정과목</th><th className="hsep">거래처</th><th className="hsep">적　　　요</th><th>금　　　액</th>
                  </tr></thead>
                  <tbody>
                    {form.rows.map((r,i)=>(
                      <tr key={i}>
                        <td className="hsep"><input className="cell" list="acct-list" value={r.acct||''} onChange={e=>updateRow(i,'acct',e.target.value)}/></td>
                        <td className="hsep"><input className="cell" value={r.payee||''} onChange={e=>updateRow(i,'payee',e.target.value)}/></td>
                        <td className="hsep"><input className="cell" value={r.note||''} onChange={e=>updateRow(i,'note',e.target.value)}/></td>
                        <td className="num" style={{position:'relative'}}>
                          <AmountInput value={r.amount} onChange={v=>updateRow(i,'amount',v)}/>
                          {form.rows.length>1&&<button type="button" className="del-row" onClick={()=>delRow(i)} style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)'}}>×</button>}
                        </td>
                      </tr>
                    ))}
                    <tr className="sum">
                      <td colSpan={3} className="lbl-cell hsep">합　계</td>
                      <td className="num">{(()=>{const t=computeTotal(form.rows,vType);return t?fmt(t):'';})()}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              <div className="footer-row">
                <button type="button" className="add-btn-link" onClick={addRow}>＋ 행 추가</button>
                <span className={`balance ${totals.balanceClass}`}>{totals.balanceText}</span>
              </div>
              <div className="ft">
                <span>{CO_ADDR}</span>
                <span>Tel {CO_TEL}　·　Fax {CO_FAX}</span>
              </div>
            </div>
          </div>

          <datalist id="acct-list">
            {ACCT_CODES.map(a=><option key={a} value={a}/>)}
          </datalist>

          {flash&&<div style={{marginTop:14,background:flash.startsWith('⚠')?C.redBg:C.greenBg,border:`1px solid ${flash.startsWith('⚠')?C.redBorder:C.greenBorder}`,borderRadius:8,padding:'9px 14px',fontSize:13,color:flash.startsWith('⚠')?C.red:C.green}}>{flash}</div>}

          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}>
            {editId&&<button onClick={()=>newForm(vType)} style={btn('ghost')}>✕ 편집 취소</button>}
            <button onClick={submitVoucher} style={btn('primary')}>{editId?'💾 수정 저장':'💾 전표 저장'}</button>
          </div>
        </>
      )}

      {tab==='list'&&(
        <div>
          <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            <select value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))} style={{...baseInput,width:'auto',background:C.white,padding:'6px 12px',cursor:'pointer'}}>
              <option value="all">전체</option>
              <option value="income">입금전표</option>
              <option value="expense">출금전표</option>
              <option value="transfer">대체전표</option>
            </select>
            <input type="month" value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))} style={{...baseInput,width:'auto',background:C.white}}/>
            <input type="text" placeholder="🔍 거래처·적요·번호 검색" value={filter.q} onChange={e=>setFilter(f=>({...f,q:e.target.value}))} style={{...baseInput,width:220,background:C.white}}/>
            {(filter.type!=='all'||filter.month||filter.q)&&<button onClick={()=>setFilter({type:'all',month:'',q:''})} style={{...btn('ghost'),height:34,fontSize:12}}>필터 초기화</button>}
            <button onClick={exportExcel} style={{...btn('secondary'),height:34,fontSize:12,background:'#10B981',color:'#fff'}} title="현재 필터 결과를 엑셀로 내보냅니다">📊 엑셀 ({displayV.length})</button>
            <div style={{display:'flex',gap:14,marginLeft:'auto',alignItems:'center',flexWrap:'wrap'}}>
              {totalIncome>0&&<span style={{fontSize:12.5,color:'#DC2626',fontWeight:600}}>입금 {fmt(totalIncome)}원</span>}
              {totalExpense>0&&<span style={{fontSize:12.5,color:'#1D4ED8',fontWeight:600}}>출금 {fmt(totalExpense)}원</span>}
              {(totalIncome>0||totalExpense>0)&&<span style={{fontSize:12.5,color:netTotal>=0?'#15803D':'#C53030',fontWeight:700,padding:'3px 10px',background:netTotal>=0?'#F0FDF4':'#FEF2F2',border:`1px solid ${netTotal>=0?'#BBF7D0':'#FECACA'}`,borderRadius:6}}>순액 {netTotal>=0?'+':''}{fmt(netTotal)}원</span>}
            </div>
          </div>
          <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden',boxShadow:sh.card}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:780}}>
                <thead><tr>{[['전표번호','left',100],['날짜','left',100],['구분','left',92],['요약','left'],['금액','right',130],['결재','center',110],['','center',132]].map(([h,a,w])=><th key={h} style={TH(a,w)}>{h}</th>)}</tr></thead>
                <tbody>
                  {displayV.length===0&&<tr><td colSpan={7} style={{...TD('center'),color:C.textHint,padding:'32px'}}>전표가 없습니다.</td></tr>}
                  {displayV.map((v,i)=>{
                    const m=VOUCHER_TYPES[v.type]||VOUCHER_TYPES.income;
                    const total=computeTotal(v.rows,v.type);
                    const summary=v.type==='transfer'
                      ?(v.rows[0]?.dr_acct||v.rows[0]?.cr_acct?`${v.rows[0].dr_acct||'?'} → ${v.rows[0].cr_acct||'?'}${v.rows.length>1?` 외 ${v.rows.length-1}건`:''}`:'—')
                      :(v.rows[0]?.acct||v.rows[0]?.note?`${v.rows[0].acct||v.rows[0].note}${v.rows[0].payee?` (${v.rows[0].payee})`:''}${v.rows.length>1?` 외 ${v.rows.length-1}건`:''}`:'—');
                    return (
                      <tr key={v.id} style={{background:i%2===0?C.white:C.tAlt,borderLeft:`4px solid ${m.accent}`}}>
                        <td style={TD('left',{fontWeight:600,color:C.navy,fontSize:12})}>{v.vno}</td>
                        <td style={TD('left',{fontSize:12})}>{v.date}</td>
                        <td style={TD('left')}><span style={{background:m.badgeBg,color:m.badgeFg,border:`1px solid ${m.accent}33`,borderRadius:5,padding:'2px 7px',fontSize:11,fontWeight:700,letterSpacing:0.5}}>{m.short}</span></td>
                        <td style={TD('left',{fontSize:12})}>{summary}</td>
                        <td style={TD('right',{fontWeight:800,color:m.accent,fontSize:13})}>{fmt(total)}원</td>
                        <td style={TD('center')}>
                          <div style={{display:'flex',gap:3,justifyContent:'center'}}>
                            {['담당','검토','확인'].map(slot=>{
                              const ap=v.approvals?.[slot];
                              return ap?(
                                <span key={slot} title={`${ap.name||''}\n${fmtAt(ap.at)}`} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:'50%',border:'1.5px solid #C53030',color:'#C53030',fontSize:12,fontWeight:600,fontFamily:'serif',transform:'rotate(-6deg)',background:'#fff'}}>印</span>
                              ):(
                                <span key={slot} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:26,height:26,borderRadius:'50%',border:'1px dashed #e5e7eb',fontSize:9,color:'#cbd5e1'}}>{slot[0]}</span>
                              );
                            })}
                          </div>
                        </td>
                        <td style={TD('center')}>
                          <div style={{display:'flex',gap:4,justifyContent:'center'}}>
                            <button onClick={()=>editVoucher(v)} style={{...btn('ghost'),height:26,padding:'0 8px',fontSize:11}}>편집</button>
                            <button onClick={()=>handlePrint(v)} style={{...btn('navyGhost'),height:26,padding:'0 8px',fontSize:11}}>출력</button>
                            <button onClick={()=>deleteV(v.id)} style={{background:'transparent',border:'none',cursor:'pointer',color:C.textHint,fontSize:16,lineHeight:1}}>×</button>
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
    </div>
  );
}

// ─── Voucher 헬퍼 ─────────────────────────────────────────────
function emptyRow(){ return {acct:'',payee:'',note:'',amount:''}; }
function emptyJournalRow(){ return {dr_acct:'',dr_note:'',dr_amt:'',cr_acct:'',cr_note:'',cr_amt:''}; }
function emptyVoucherForm(type){
  const rows=type==='transfer'
    ?[emptyJournalRow(),emptyJournalRow(),emptyJournalRow(),emptyJournalRow(),emptyJournalRow()]
    :[emptyRow(),emptyRow(),emptyRow(),emptyRow()];
  return { date:new Date().toISOString().split('T')[0], vno:'', rows, summary:'', approvals:{} };
}
function rowHasContent(r){ return Object.values(r).some(v=>v!==''&&v!==0&&v!=null); }
function computeTotal(rows,type){
  if(type==='transfer'){ const{dr,cr}=computeJournalTotals(rows); return Math.max(dr,cr); }
  return rows.reduce((s,r)=>s+(Number(r.amount)||0),0);
}
function computeJournalTotals(rows){
  const dr=rows.reduce((s,r)=>s+(Number(r.dr_amt)||0),0);
  const cr=rows.reduce((s,r)=>s+(Number(r.cr_amt)||0),0);
  return {dr,cr};
}
function fmtAt(iso){ if(!iso) return ''; const d=new Date(iso); return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function fmtN(n){ return Math.round(Number(n)||0).toLocaleString('ko-KR'); }
function esc(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatKDate(d){ if(!d) return ''; const [y,m,dd]=d.split('-'); return `${y} 년 ${Number(m)} 월 ${Number(dd)} 일`; }

function AmountInput({value,onChange}){
  const [text,setText]=useState(value?Number(value).toLocaleString('ko-KR'):'');
  useEffect(()=>{ setText(value?Number(value).toLocaleString('ko-KR'):''); },[value]);
  return (
    <input className="cell" value={text}
      onChange={e=>setText(e.target.value)}
      onBlur={()=>{
        const n=Number(String(text).replace(/[^\d-]/g,''))||0;
        setText(n?n.toLocaleString('ko-KR'):'');
        onChange(n);
      }}
      inputMode="numeric"/>
  );
}

// ─── Manual Page (사용 설명서) ────────────────────────────────
function ManualPage() {
  const [activeSection,setActiveSection]=useState(null);

  const sections=[
    {
      icon:'🔐', title:'로그인 방법', color:'#4f46e5',
      desc:'사이트 주소(taelim.co)에 접속하여 비밀번호 또는 구글 계정으로 로그인합니다',
      steps:[
        { title:'사이트 접속', detail:'인터넷 브라우저(크롬 권장)를 열고 주소창에 taelim.co 를 입력합니다. 즐겨찾기에 저장해 두시면 편합니다.\n(www.taelim.co 도 작동하지만 자동으로 taelim.co 로 이동됩니다)' },
        { title:'비밀번호로 로그인', detail:'화면 가운데 비밀번호 칸에 본인의 비밀번호를 입력합니다.\n계정 종류:\n▸ 아버지 (박형준 이사)\n▸ 작은아버지 (박호준 이사)\n▸ 직원1 / 직원2\n▸ Guest1 / Guest2 (보기 전용)\n\n비밀번호는 설정 탭 → "사용자 비밀번호 관리"에서 사장님이 변경하실 수 있습니다.\n(비밀번호는 대소문자를 구분합니다. Caps Lock이 켜져 있으면 안 됩니다.)' },
        { title:'구글 계정으로 로그인 (신규)', detail:'상단의 [G Google 계정으로 계속] 버튼을 클릭하면 본인 지메일/구글 계정으로 바로 가입·로그인할 수 있습니다.\n처음 로그인하는 사람은 자동으로 [게스트] 권한이 부여되어 홈/갤러리/게시판/공문만 볼 수 있습니다.\n사장님이 설정에서 권한을 승격해 주시면 더 많은 메뉴를 볼 수 있습니다.' },
        { title:'로그인 버튼 클릭', detail:'비밀번호 입력 후 파란 [로그인] 버튼을 클릭합니다. 잠시 기다리면 메인 화면으로 이동합니다.' },
        { title:'로그아웃', detail:'오른쪽 상단 [로그아웃] 버튼을 누르면 안전하게 종료됩니다. 다른 사람이 사용할 수 있는 공용 PC에서는 반드시 로그아웃 해주세요.' },
        { title:'비밀번호를 잊어버렸을 때', detail:'설정 탭에서 비밀번호를 변경할 수 있습니다. 접속이 안 될 경우 박장혁 이사에게 연락 주세요.' },
      ],
      tip:'💡 처음 가입하는 직원/지인은 [게스트]로 시작하니 권한을 부여할 수 있어요.',
    },
    {
      icon:'⚡', title:'검침 입력', color:'#d97706',
      desc:'매월 전기·수도 계량기 숫자를 기록합니다',
      steps:[
        { title:'검침 입력 탭 클릭', detail:'상단 메뉴에서 [검침 입력]을 클릭합니다.' },
        { title:'적용 기간 입력', detail:'이번 달 검침 기간을 입력합니다.\n예) 시작일: 2025-05-08 / 종료일: 2025-06-07\n달력 아이콘을 클릭하거나 직접 숫자를 입력할 수 있습니다.' },
        { title:'전기 검침값 입력', detail:'각 층별로 [전월] 숫자와 [금월] 숫자를 입력합니다.\n▸ 전월: 지난달 계량기 숫자\n▸ 금월: 이번달 계량기 숫자\n(계량기 화면에 표시된 숫자 그대로 입력)' },
        { title:'수도 검침값 입력', detail:'전기와 동일하게 각 층별로 전월/금월 수도 계량기 숫자를 입력합니다.' },
        { title:'수도 요금 청구 여부', detail:'수도 요금을 이번 달에 청구할지 선택합니다.\n▸ O: 이번 달 수도 요금 청구함\n▸ X: 이번 달 수도 요금 청구 안 함 (격월 청구 시 사용)' },
        { title:'전기·수도 고지서 금액 입력', detail:'한전에서 온 전기 고지서와 수도 고지서의 금액을 입력합니다.\n▸ 전기: 기본요금, 전력산업기반기금, 총요금, 부가세, 안전관리비 등\n▸ 수도: 총요금, 기본요금' },
        { title:'고지서 사진 첨부 (선택)', detail:'고지서 사진을 찍어 첨부하면 나중에 확인할 수 있습니다. [📸] 버튼을 클릭하여 사진을 선택합니다.' },
        { title:'히스토리 저장', detail:'모든 입력이 끝나면 하단 [💾 히스토리 저장] 버튼을 클릭합니다. 저장 완료 메시지가 표시되면 성공입니다.' },
      ],
      tip:'💡 숫자를 잘못 입력했을 경우 언제든지 다시 수정하고 저장할 수 있습니다. 히스토리 탭에서 이전 달 기록도 확인할 수 있습니다.',
    },
    {
      icon:'📋', title:'청구서 발행', color:'#312e81',
      desc:'임차인에게 관리비 청구서를 출력하거나 이메일로 보냅니다',
      steps:[
        { title:'청구서 탭 클릭', detail:'상단 메뉴에서 [청구서]를 클릭합니다.' },
        { title:'업체 선택', detail:'화면 상단에서 청구서를 발행할 업체를 선택합니다.\n▸ 1층 웨지우드 / 2층 태하무역 / 3층 유연어패럴' },
        { title:'청구 내용 확인', detail:'자동으로 계산된 청구 내용이 표시됩니다.\n▸ 임대료, 관리비, 전기세, 수도세, 부가세 등\n내용이 맞는지 확인합니다.' },
        { title:'PDF 출력', detail:'[🎨 컬러 PDF 출력] 또는 [⬜ 흑백 PDF 출력] 버튼을 클릭합니다.\n인쇄 창이 뜨면 프린터를 선택하고 인쇄합니다.\nPDF로 저장하려면 프린터 대신 "PDF로 저장"을 선택합니다.' },
        { title:'이메일 발송 (선택)', detail:'[📧 이메일 발송] 버튼을 클릭하면 Gmail이 열리면서 청구서가 첨부됩니다. 받는 사람 주소를 확인하고 발송합니다.' },
        { title:'여러 업체 순서대로', detail:'한 업체 처리 후 상단에서 다른 업체를 선택하면 됩니다. 매월 3개 업체 모두 발행해 주세요.' },
      ],
      tip:'💡 청구서는 매월 검침 후 발행합니다. 발행 전에 검침 입력이 저장되어 있어야 정확한 금액이 계산됩니다.',
    },
    {
      icon:'🚨', title:'긴급 호출', color:'#dc2626',
      desc:'응급 상황 시 대표님께 즉시 Telegram 알림을 보냅니다',
      steps:[
        { title:'전자결재 탭 클릭', detail:'상단 메뉴에서 [전자결재]를 클릭합니다.' },
        { title:'빨간 패널 확인', detail:'화면 왼쪽(또는 하단)에 빨간 배경의 [전자결재 · 소방안전] 패널이 있습니다.' },
        { title:'긴급 호출 버튼 클릭', detail:'빨간 패널 안의 [🚨 긴급 호출] 버튼을 클릭합니다.' },
        { title:'확인 창', detail:'확인 창이 뜨면 상황을 간략히 확인 후 [확인 — 전송] 버튼을 클릭합니다.\n(실수로 누른 경우 [취소] 버튼 클릭)' },
        { title:'전송 완료', detail:'대표님 휴대폰 Telegram 앱에 즉시 알림이 전송됩니다.\n"긴급 호출 전송 완료" 메시지가 화면에 표시됩니다.' },
        { title:'미확인 자동 재전송', detail:'5분 후에도 확인이 없으면 자동으로 다시 전송됩니다.' },
      ],
      tip:'⚠️ 긴급 호출은 실제 응급 상황에만 사용해 주세요. 설정 탭에서 Telegram 봇 토큰이 설정되어 있어야 작동합니다.',
    },
    {
      icon:'📄', title:'전표 작성', color:'#166534',
      desc:'입금·출금·대체 전표를 작성하고 PDF로 출력합니다',
      steps:[
        { title:'전표 탭 클릭', detail:'상단 메뉴에서 [전표]를 클릭합니다.' },
        { title:'전표 종류 선택', detail:'새 전표 작성 창에서 종류를 선택합니다.\n▸ 입금전표: 돈이 들어올 때 (현금 수령 등)\n▸ 출금전표: 돈이 나갈 때 (비용 지불 등)\n▸ 대체전표: 계좌 간 이체, 비용 배분 등' },
        { title:'날짜 입력', detail:'해당 거래가 발생한 날짜를 입력합니다. 기본값은 오늘 날짜입니다.' },
        { title:'금액 입력', detail:'거래 금액을 숫자로 입력합니다. 콤마(,)는 자동으로 표시됩니다.' },
        { title:'계정과목 입력', detail:'거래 내용에 맞는 계정과목을 입력합니다.\n예) 임대료수입, 관리비수입, 전기요금, 소모품비 등' },
        { title:'거래처 입력 (선택)', detail:'거래 상대방 이름을 입력합니다.\n예) 한국웨지우드마케팅, 한국전력, 서울시 등' },
        { title:'적요(내용) 입력', detail:'거래 내용을 간략하게 메모합니다.\n예) "2025년 5월 임대료", "화장실 수리비" 등' },
        { title:'영수증 사진 첨부 (선택)', detail:'[📎 사진 첨부] 버튼으로 영수증이나 세금계산서 사진을 첨부합니다.' },
        { title:'전표 저장', detail:'모든 입력 후 [💾 전표 저장] 버튼을 클릭합니다.' },
        { title:'PDF 출력', detail:'목록에서 해당 전표 오른쪽 [출력] 버튼을 클릭하면 A4 PDF가 생성됩니다.' },
      ],
      tip:'💡 전표 목록에서 색깔 줄로 종류를 구분합니다: 빨간줄=입금, 파란줄=출금, 검은줄=대체',
    },
    {
      icon:'📅', title:'출퇴근 체크', color:'#0284c7',
      desc:'출근·퇴근 시간을 기록하고 조회합니다',
      steps:[
        { title:'출퇴근 탭 클릭', detail:'상단 메뉴에서 [출퇴근]을 클릭합니다.' },
        { title:'출근 체크', detail:'출근 시 [✅ 출 근] 버튼을 클릭합니다.\n현재 시각이 자동으로 기록됩니다.' },
        { title:'퇴근 체크', detail:'퇴근 시 [🏃 퇴 근] 버튼을 클릭합니다.\n근무 시간이 자동으로 계산됩니다.' },
        { title:'오늘 기록 확인', detail:'오늘의 출근/퇴근 시간과 근무 시간이 화면에 표시됩니다.' },
        { title:'이전 기록 조회', detail:'[기록 조회] 탭을 클릭하면 날짜별 출퇴근 내역을 확인할 수 있습니다. 월별로 필터링할 수 있습니다.' },
      ],
      tip:'💡 출근 버튼은 하루에 한 번만 눌러주세요. 실수로 눌렀을 경우 관리자에게 연락하여 수정 요청하시면 됩니다.',
    },
    {
      icon:'🔥', title:'비상연락망 (소방)', color:'#991b1b',
      desc:'소방 담당자 연락처를 관리하고 긴급 시 바로 연락합니다',
      steps:[
        { title:'전자결재 탭 클릭', detail:'상단 메뉴에서 [전자결재]를 클릭합니다.' },
        { title:'비상연락망 탭 클릭', detail:'전자결재 화면 안의 [🔥 비상연락망] 탭을 클릭합니다.' },
        { title:'연락처 확인', detail:'소방서, 경찰서, 가스회사, 건물 담당자 등의 연락처가 표시됩니다.' },
        { title:'전화 걸기', detail:'전화번호를 클릭하면 스마트폰에서 바로 전화 앱이 열립니다.' },
        { title:'연락처 수정', detail:'[편집] 버튼을 클릭하면 담당자 이름과 전화번호를 수정할 수 있습니다.\n수정 후 [저장] 클릭.' },
        { title:'소방 문서 보관', detail:'소방계획서, 점검 기록 등은 [📁 소방·안전 문서 보관함]에 사진으로 업로드하여 보관합니다.' },
      ],
      tip:'⚠️ 119 신고는 직접 119에 전화하세요. 비상연락망은 건물 관계자 연락용입니다.',
    },
    {
      icon:'📑', title:'계약서 관리', color:'#7c3aed',
      desc:'임차인별 임대 계약서를 사진으로 보관합니다',
      steps:[
        { title:'임차인 현황 탭 클릭', detail:'상단 메뉴에서 [임차인 현황]을 클릭합니다.' },
        { title:'업체 카드 찾기', detail:'1층, 2층, 3층 업체 카드가 표시됩니다. 계약서를 추가할 업체의 카드를 찾습니다.' },
        { title:'계약서 버튼 클릭', detail:'업체 카드 하단의 [📑 계약서] 버튼을 클릭합니다.' },
        { title:'사진 추가', detail:'[📷 계약서 사진/파일 추가] 버튼을 클릭합니다.\n스마트폰 카메라로 계약서를 촬영하거나, 스캔 파일을 선택합니다.' },
        { title:'여러 페이지 추가', detail:'계약서가 여러 장인 경우 [추가] 버튼을 반복 클릭하여 페이지별로 추가합니다.' },
        { title:'사진 크게 보기', detail:'추가된 사진을 클릭하면 크게 볼 수 있습니다. 핀치 줌(두 손가락 벌리기)으로 확대 가능합니다.' },
      ],
      tip:'💡 계약서 원본은 안전한 곳에 별도 보관하고, 이 시스템에는 사진 백업으로 활용하세요.',
    },
    {
      icon:'💰', title:'자금 현황', color:'#0369a1',
      desc:'회사 계좌별 잔액과 자금 흐름을 월별로 관리합니다',
      steps:[
        { title:'자금현황 탭 클릭', detail:'상단 메뉴에서 [자금현황]을 클릭합니다.' },
        { title:'월 이동', detail:'화면 중앙의 [← 2026년 5월 →] 버튼으로 보고 싶은 달로 이동합니다.\n월별로 잔고와 거래내역이 따로 저장되므로 4월 내역은 4월에서만, 5월 내역은 5월에서만 보입니다.' },
        { title:'자동 이월 (전월 잔고 → 이번달 전월잔고)', detail:'이전 달의 [현재 잔고]가 자동으로 이번 달의 [전월 잔고]로 넘어옵니다. 별도 입력 불필요.\n(예금·잔고 현황 카드 우측에 🔁 자동 이월 표시)\n\n※ 이번 달을 한 번이라도 저장한 뒤에 전월(예: 4월) 잔고를 수정했다면, 이번 달 [전월 잔고]는 자동으로 갱신되지 않아요.\n그럴 땐 우측 [🔄 전월잔고 새로고침] 버튼을 누르면 전월의 현재잔고를 다시 가져옵니다.' },
        { title:'통장 내역 가져오기 (XLS)', detail:'은행에서 받은 거래내역 엑셀 파일을 [📂 보통018/보통032/MMF 가져오기] 버튼으로 업로드하면\n해당 월 거래만 자동으로 추출되고, 중복된 행은 자동 제외됩니다. 잔액도 함께 업데이트됩니다.' },
        { title:'입출금 내역 수기 입력', detail:'[+ 행 추가] 버튼으로 직접 입력할 수도 있습니다.\n날짜·계좌·적요·입금·출금을 입력하면 자동 정렬 및 번호 매김됩니다.' },
        { title:'잔고 직접 수정', detail:'[예금·잔고 현황] 표에서 전월/현재 잔고를 직접 입력할 수 있습니다. 통장과 비교하여 맞춰 주세요.' },
        { title:'미스매치 확인', detail:'거래내역 합계와 수기 입력 잔고가 다르면 노란색 경고가 표시됩니다.\n[🔄 거래내역 기준으로 잔고 맞추기] 버튼으로 자동 보정할 수 있습니다.' },
        { title:'🔒 확정 잠금 (사장님만)', detail:'청구서 발송 완료된 달은 [🔓 확정 잠금] 버튼으로 잠그시면 됩니다.\n잠긴 달은 잔고·입출금 내역 수정, 통장 가져오기, 행 추가/삭제가 모두 막힙니다.\n실수로 숫자가 바뀌는 것을 막아줍니다. 잠금 해제도 사장님(마스터)만 가능합니다.' },
        { title:'인쇄 / PDF 저장', detail:'화면 하단의 [🖨️ 자금현황 인쇄] 버튼으로 해당 월 보고서를 출력하거나 PDF로 저장할 수 있습니다.' },
      ],
      tip:'💡 매월 통장 가져오기 → 미스매치 확인 → 잔고 맞춤 → 확정 잠금 순서로 마감하시면 됩니다. 잠금 후에도 언제든 해제 가능하니 안심하고 잠그세요.',
    },
    {
      icon:'☁️', title:'데이터 백업 / 클라우드 동기화', color:'#0891b2',
      desc:'데이터를 클라우드에 안전하게 보관하고 여러 기기에서 같은 데이터를 봅니다',
      steps:[
        { title:'백업이 왜 필요한가', detail:'이 시스템의 검침/자금현황/임차인/결재 등 모든 데이터는 기본적으로 사용하시는 브라우저에 저장됩니다.\n브라우저 캐시를 지우거나 다른 기기에서 접속하면 데이터가 비어 보일 수 있습니다.\n클라우드 백업을 사용하면 어느 기기에서든 같은 데이터를 볼 수 있고, 분실 위험이 없어집니다.' },
        { title:'설정 탭 → 데이터 백업/복원', detail:'상단 [설정] 탭을 누르고 아래로 스크롤하여 💾 [데이터 백업 / 복원] 카드를 찾습니다.\n(설정 탭은 마스터 권한에서만 보입니다)' },
        { title:'① 파일로 백업 (수동)', detail:'[📥 전체 백업 다운로드 (.json)] 버튼을 클릭하면 모든 데이터가 담긴 JSON 파일이 다운로드됩니다.\n이 파일을 본인 이메일이나 구글 드라이브에 저장해두면 안전한 백업이 됩니다.\n복원할 때는 [📤 백업 파일에서 복원] 버튼으로 그 파일을 선택합니다.' },
        { title:'② 클라우드에 업로드', detail:'[☁️⬆ 클라우드에 업로드] 버튼을 누르면 현재 기기의 데이터가 클라우드(Supabase)에 저장됩니다.\n업로드 완료 메시지가 뜨면 끝입니다. (수십 초 걸릴 수 있음)' },
        { title:'③ 다른 기기에서 클라우드 복원', detail:'다른 기기(휴대폰/노트북)에서 taelim.co 접속 → 마스터 로그인 → 설정 → [☁️⬇ 클라우드에서 복원] 버튼 클릭.\n클라우드의 데이터가 그 기기로 내려와 자동 새로고침되며 같은 데이터를 보게 됩니다.' },
        { title:'동기화 흐름 요약', detail:'데이터 입력하신 기기에서 ☁️⬆ 업로드 → 다른 기기에서 ☁️⬇ 복원.\n자금현황 매월 마감 후, 검침/청구서 발행 후 등 중요한 작업 후에 한 번씩 업로드해 두시면 좋습니다.' },
      ],
      tip:'⚠️ 클라우드 업로드는 기존 클라우드 데이터를 덮어씁니다. 여러 기기에서 다른 데이터를 가지고 있다면 최신 데이터가 있는 기기에서만 업로드하세요. 매일 또는 매주 한 번씩 정기적으로 백업 파일(.json)도 받아두시면 가장 안전합니다.',
    },
    {
      icon:'📢', title:'업무 보고', color:'#0891b2',
      desc:'일일 업무 내용을 기록하고 공유합니다',
      steps:[
        { title:'업무보고 탭 클릭', detail:'상단 메뉴에서 [업무보고]를 클릭합니다.' },
        { title:'새 보고 작성', detail:'[✏️ 새 업무보고 작성] 버튼을 클릭합니다.' },
        { title:'날짜 및 내용 입력', detail:'날짜를 선택하고 오늘 한 업무 내용을 입력합니다.\n예) "1층 웨지우드 관리비 청구서 발송 완료", "화장실 형광등 교체" 등' },
        { title:'저장', detail:'[저장] 버튼을 클릭합니다. 저장된 보고는 목록에서 날짜별로 확인 가능합니다.' },
      ],
      tip:'💡 매일 간단하게라도 업무 기록을 남겨두시면 나중에 참고하기 좋습니다.',
    },
  ];

  const handlePrint=()=>{
    const html=`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>태림전자공업 사용 설명서</title><style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11.5px;color:#111;background:#fff;}
.page{max-width:780px;margin:0 auto;padding:16px;}
.hdr{background:#312e81;color:#fff;padding:16px 22px;border-radius:8px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;}
.hdr-title{font-size:20px;font-weight:900;letter-spacing:2px;}
.hdr-sub{font-size:10.5px;opacity:0.65;margin-top:3px;}
.section{margin-bottom:18px;border:1.5px solid #ddd;border-radius:10px;overflow:hidden;break-inside:avoid;}
.sec-hdr{padding:10px 16px;display:flex;align-items:center;gap:10px;}
.sec-icon{font-size:20px;}
.sec-title{font-size:14px;font-weight:800;color:#fff;}
.sec-desc{font-size:10px;color:rgba(255,255,255,0.72);margin-top:2px;}
.steps{padding:12px 16px;background:#fafafa;}
.step{display:flex;gap:9px;margin-bottom:9px;align-items:flex-start;}
.step-no{background:#312e81;color:#fff;border-radius:50%;width:19px;height:19px;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;}
.step-body{}
.step-title{font-size:11.5px;font-weight:700;color:#111;margin-bottom:2px;}
.step-detail{font-size:10.5px;line-height:1.65;color:#444;white-space:pre-line;}
.tip{margin:8px 0 0;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:7px 10px;font-size:10.5px;color:#92400e;line-height:1.6;}
.footer{margin-top:16px;text-align:center;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px;}
@media print{@page{size:A4;margin:10mm;}body{font-size:10.5px;}.section{break-inside:avoid;}}
</style></head><body>
<div class="page">
<div class="hdr">
  <div>
    <div class="hdr-title">태림전자공업㈜ 시스템 사용 설명서</div>
    <div class="hdr-sub">TAE LIM ELECTRONICS CO., LTD. · ${CO_ADDR}</div>
  </div>
  <div style="text-align:right;font-size:10px;opacity:0.7;">출력일: ${new Date().toLocaleDateString('ko-KR')}</div>
</div>
${sections.map(s=>`
<div class="section">
  <div class="sec-hdr" style="background:${s.color};">
    <span class="sec-icon">${s.icon}</span>
    <div>
      <div class="sec-title">${s.title}</div>
      <div class="sec-desc">${s.desc}</div>
    </div>
  </div>
  <div class="steps">
    ${s.steps.map((st,i)=>`<div class="step">
      <div class="step-no">${i+1}</div>
      <div class="step-body">
        <div class="step-title">${st.title}</div>
        <div class="step-detail">${st.detail.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      </div>
    </div>`).join('')}
    ${s.tip?`<div class="tip">${s.tip}</div>`:''}
  </div>
</div>`).join('')}
<div class="footer">
  <div style="font-weight:700;margin-bottom:3px;">문의: ${CO_TEL} (박장혁 이사) · Fax: ${CO_FAX}</div>
  <div>${CO_ADDR}</div>
  <div style="margin-top:5px;">© ${new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD. All Rights Reserved.</div>
</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const w=window.open(url,'_blank');
    if(!w){alert('팝업이 차단됐습니다.'); return;}
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:17, fontWeight:800, color:C.navyDark }}>시스템 사용 설명서</div>
          <div style={{ fontSize:12, color:C.textSub, marginTop:3 }}>태림전자공업㈜ 통합 관리 시스템 · 기능별 상세 사용법</div>
        </div>
        <button onClick={handlePrint} style={{ ...btn('primary'), gap:6 }}>🖨️ A4 인쇄 / PDF 저장</button>
      </div>

      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        {sections.map((s,i)=>(
          <button key={i} onClick={()=>setActiveSection(activeSection===i?null:i)} style={{ padding:'6px 14px', borderRadius:20, border:`2px solid ${activeSection===i?s.color:'#e5e7eb'}`, background:activeSection===i?s.color:'#fff', color:activeSection===i?'#fff':C.textMid, fontSize:12.5, fontWeight:600, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:5 }}>
            <span>{s.icon}</span>{s.title}
          </button>
        ))}
        {activeSection!==null && <button onClick={()=>setActiveSection(null)} style={{ padding:'6px 12px', borderRadius:20, border:'2px solid #e5e7eb', background:'#f9fafb', color:C.textSub, fontSize:12, cursor:'pointer' }}>✕ 전체 보기</button>}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
        {sections.map((s,i)=>{
          if(activeSection!==null && activeSection!==i) return null;
          return (
            <div key={i} style={{ background:C.white, borderRadius:14, overflow:'hidden', boxShadow:sh.card, border:`1px solid ${C.border}` }}>
              <div style={{ background:s.color, padding:'13px 16px', display:'flex', alignItems:'center', gap:11 }}>
                <span style={{ fontSize:24 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize:14.5, fontWeight:800, color:'#fff' }}>{s.title}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.72)', marginTop:2 }}>{s.desc}</div>
                </div>
              </div>
              <div style={{ padding:'14px 16px' }}>
                {s.steps.map((st,j)=>(
                  <div key={j} style={{ display:'flex', gap:10, marginBottom:12, alignItems:'flex-start' }}>
                    <span style={{ background:s.color, color:'#fff', borderRadius:'50%', width:20, height:20, fontSize:10.5, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>{j+1}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:C.textDark, marginBottom:3 }}>{st.title}</div>
                      <div style={{ fontSize:12, color:C.textMid, lineHeight:1.7, whiteSpace:'pre-line' }}>{st.detail}</div>
                    </div>
                  </div>
                ))}
                {s.tip && (
                  <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'9px 12px', fontSize:12, color:'#92400e', lineHeight:1.7, marginTop:4 }}>
                    {s.tip}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop:18, background:C.navyBg, border:`1px solid ${C.navyBg2}`, borderRadius:12, padding:'15px 18px', fontSize:13, color:C.navyDark, lineHeight:2 }}>
        <div style={{ fontWeight:800, marginBottom:6, fontSize:13.5 }}>📌 꼭 알아두세요</div>
        <div>· <b>비밀번호</b> — 아버지·작은아버지·직원·게스트 모두 설정 탭 → "사용자 비밀번호 관리"에서 사장님이 변경 가능합니다.</div>
        <div>· <b>데이터 저장</b> — 이 기기(PC/스마트폰)에 저장됩니다. 브라우저 캐시 삭제 시 초기화될 수 있으나, 설정 탭 ☁️ <b>클라우드 백업/복원</b>으로 복구 가능합니다.</div>
        <div>· <b>Telegram 알림</b> — 설정 탭에서 봇 토큰을 설정해야 긴급호출 알림이 작동합니다.</div>
        <div>· <b>문의</b> — 시스템 문제 시 박장혁 이사 ({CO_TEL}) 에게 연락 주세요.</div>
      </div>
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
          © {new Date().getFullYear()} TAE LIM ELECTRONICS CO., LTD. All Rights Reserved. &nbsp;|&nbsp; 관리비 청구 시스템 v3.1
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
  const [adminPw,setAdminPw]=useState(()=>store.get('tl_admin_pw')||'taelimmotor');
  const [masterPw,setMasterPw]=useState(()=>store.get('tl_master_pw')||'master2024');
  const [page,setPage]=useState('home');
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
    // ── 로컬 비밀번호 우선 ──
    if(password===masterPw){ setLoggedIn(true); setRole('master'); store.set('tl_user_name','마스터'); return {ok:true}; }
    // 등록된 사용자 매칭 — 아버지/작은아버지/직원1/직원2/게스트 (비번은 설정 탭에서 변경 가능)
    const extra=getExtraUsers().find(u=>u.pw===password);
    if(extra){ setLoggedIn(true); setRole(extra.role); store.set('tl_user_name',extra.name); return {ok:true}; }
    if(password===adminPw){  setLoggedIn(true); setRole('admin');  store.set('tl_user_name','대표');   return {ok:true}; }
    if(password===savedPw){  setLoggedIn(true); setRole('staff');  store.set('tl_user_name','직원');   return {ok:true}; }

    // 이메일 없이 로컬 PW만 시도한 경우 → 8초 대기 없이 즉시 실패
    if(!email||email==='local@taelim.com'){
      return {ok:false, error:'비밀번호가 올바르지 않습니다.'};
    }

    // ── Firebase 로그인 (이메일 입력시만) ──
    try {
      const loginPromise=signInWithEmailAndPassword(auth,email,password);
      const timeoutPromise=new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),8000));
      const cred=await Promise.race([loginPromise,timeoutPromise]);
      // localStorage에서만 프로필 확인 (Firestore 호출 없음)
      const users=store.get('tl_fb_users')||{};
      const profile=users[cred.user.uid];
      if(!profile){ await signOut(auth); return {ok:false,error:'프로필이 없습니다. 회원가입을 먼저 해주세요.'}; }
      setRole(profile.role||'staff');
      setUserProfile(profile);
      store.set('tl_user_name',profile.name||email);
      setLoggedIn(true);
      return {ok:true};
    } catch(e){
      const msg={
        'auth/user-not-found':'등록되지 않은 이메일입니다.',
        'auth/wrong-password':'비밀번호가 올바르지 않습니다.',
        'auth/invalid-credential':'이메일 또는 비밀번호가 올바르지 않습니다.',
        'auth/too-many-requests':'잠시 후 다시 시도해주세요.',
        'auth/network-request-failed':'네트워크 오류. 잠시 후 다시 시도해주세요.',
        'timeout':'연결 시간 초과. 다시 시도해주세요.',
      };
      return {ok:false, error:msg[e.code]||'로그인 실패. 다시 시도해주세요.'};
    }
  };
  const handleSetPw=(pw)=>{ setSavedPw(pw); store.set('tl_pw',pw); };
  const handleSetAdminPw=(pw)=>{ setAdminPw(pw); store.set('tl_admin_pw',pw); };
  const handleSetTenants=(t)=>{ setTenants(t); store.set('tl_tenants',t); };
  const pendingCount=(store.get('tl_approvals')||[]).filter(a=>a.status==='pending').length;

  const handleGoogleLogin=async()=>{
    try {
      const provider=new GoogleAuthProvider();
      provider.setCustomParameters({ prompt:'select_account' });
      // 타임아웃 제거 — 12초 race가 정상 인증을 끊는 버그였음.
      // 팝업 차단은 Firebase가 'auth/popup-blocked' 던져줌.
      const cred=await signInWithPopup(auth,provider);

      // localStorage 기반 프로필 (Firestore 호출 없음)
      const users=store.get('tl_fb_users')||{};
      let profile=users[cred.user.uid];
      if(!profile){
        const isFirst=Object.keys(users).length===0;
        const empNo=`EMP-${String(Object.keys(users).length+1).padStart(3,'0')}`;
        profile={ name:cred.user.displayName||cred.user.email, email:cred.user.email,
          dept:'', role:isFirst?'master':'guest', approved:true, empNo,
          createdAt:new Date().toISOString() };
        users[cred.user.uid]=profile;
        store.set('tl_fb_users',users);
        // Firestore에도 저장 시도 (실패해도 무시)
        try { await setDoc(doc(db,'users',cred.user.uid),profile); } catch(_){}
      }
      if(profile.approved===false){ await signOut(auth); return {ok:false,error:'관리자 승인 대기 중입니다.'}; }
      setRole(profile.role||'staff');
      setUserProfile(profile);
      store.set('tl_user_name',profile.name||cred.user.email);
      setLoggedIn(true);
      return {ok:true};
    } catch(e){
      const msg={
        'auth/popup-closed-by-user':'로그인 창이 닫혔습니다.',
        'auth/popup-blocked':'팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.',
        'auth/cancelled-popup-request':'다시 시도해주세요.',
        'auth/unauthorized-domain':'이 도메인은 Firebase에 등록되어 있지 않습니다. (관리자 문의)',
        'auth/operation-not-allowed':'Google 로그인이 비활성화되어 있습니다. (관리자 문의)',
        'auth/network-request-failed':'네트워크 오류. 인터넷 연결을 확인해주세요.',
        'timeout':'연결 시간 초과. 다시 시도해주세요.',
      };
      return {ok:false,error:msg[e.code]||e.message||'Google 로그인 실패'};
    }
  };

  if(!loggedIn) return <LoginPage onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />;
  const calc=calcAll(reading);

  return (
    <div style={{ fontFamily:"'Malgun Gothic','맑은 고딕',sans-serif", minHeight:'100vh', background:C.pageBg }}>
      <Header page={page} setPage={setPage} onLogout={async()=>{ await signOut(auth); setLoggedIn(false); setRole('staff'); setUserProfile(null); store.set('tl_user_name',''); }} role={role} pendingCount={pendingCount} userName={store.get('tl_user_name')||''} />
      <main style={{ padding:'20px 24px', maxWidth:980, margin:'0 auto' }}>
        {page==='home'      && <HomePage     role={role} setPage={setPage} />}
        {page==='gallery'   && <GalleryPage  role={role} />}
        {page==='board'     && <BoardPage    role={role} />}
        {page==='calendar'  && <CalendarPage role={role} />}
        {page==='input'     && <InputPage    reading={reading} onChange={onChange} onSave={onSave} saveMsg={saveMsg} />}
        {page==='invoice'   && <InvoicePage  reading={reading} tenants={tenants} calc={calc} />}
        {page==='quarterly' && <QuarterlyPage history={history} tenants={tenants} />}
        {page==='history'   && <HistoryPage  history={history} onLoad={(h)=>{ onChange(h); setPage('input'); }} onUpdate={(updated)=>{ setHistory(updated); store.set('tl_history',updated); }} />}
        {page==='tenant'    && <TenantPage   tenants={tenants} setTenants={handleSetTenants} role={role} />}
        {page==='finance'   && <FinancePage  role={role} />}
        {page==='notice'    && <NoticePage   />}
        {page==='approval'  && <ApprovalPage role={role} />}
        {page==='voucher'   && <VoucherPage  role={role} />}
        {page==='attendance'&& <AttendancePage role={role} />}
        {page==='report'    && <WorkReportPage />}
        {page==='manual'    && <ManualPage />}
        {page==='settings'  && <SettingsPage savedPassword={savedPw} setSavedPassword={handleSetPw} adminPw={adminPw} setAdminPw={handleSetAdminPw} masterPw={masterPw} setMasterPw={(p)=>{ setMasterPw(p); store.set('tl_master_pw',p); }} tenants={tenants} setTenants={handleSetTenants} reading={reading} role={role} />}
      </main>
      <PageFooter />
    </div>
  );
}
