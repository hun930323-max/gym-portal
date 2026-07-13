// 데이터 계층 (JSON 파일 영속화)
// 네이티브 의존성 없이 어디서든 구동. 운영 전환 시 이 파일만 PostgreSQL로 교체하면 됨.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// 데이터 저장 경로: 환경변수 DATA_DIR 로 영구 볼륨을 지정하면 재배포에도 데이터 유지
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

let db = null;

function todayPlus(days = 0) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function blank() {
  return {
    _seq: 1,
    gyms: [], owners: [], members: [], attendance: [], pt_sessions: [],
    leads: [], requests: [], payments: [], send_logs: [], settings: {}, bots: [], bot_users: [],
  };
}
function nextId() { return db._seq++; }
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); backupIfDue(); }

// 자동 백업: 하루 1회 날짜별 스냅샷, 최근 14개만 보관
let lastBackupDay = null;
function backupIfDue() {
  try {
    const day = todayPlus(0);
    if (lastBackupDay === day) return;
    const dir = path.join(DATA_DIR, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `db-${day}.json`);
    if (!fs.existsSync(f) && fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, f);
    lastBackupDay = day;
    const files = fs.readdirSync(dir).filter((n) => /^db-.*\.json$/.test(n)).sort();
    while (files.length > 14) { try { fs.unlinkSync(path.join(dir, files.shift())); } catch (e) {} }
  } catch (e) { console.error("[backup]", e.message); }
}
function lastBackupInfo() {
  try {
    const dir = path.join(DATA_DIR, "backups");
    if (!fs.existsSync(dir)) return { count: 0, latest: null };
    const files = fs.readdirSync(dir).filter((n) => /^db-.*\.json$/.test(n)).sort();
    return { count: files.length, latest: files.length ? files[files.length - 1].replace(/^db-|\.json$/g, "") : null };
  } catch (e) { return { count: 0, latest: null }; }
}

// 지점 데이터 전체 내보내기 (백업/이전용)
function gymExport(gymId) {
  const by = (t) => (db[t] || []).filter((r) => r.gym_id === gymId);
  return {
    exported_at: new Date().toISOString(), gym: getGym(gymId), settings: db.settings[gymId] || {},
    members: by("members"), pt_sessions: by("pt_sessions"), attendance: by("attendance"),
    payments: by("payments"), leads: by("leads"), requests: by("requests"), bot_users: by("bot_users"),
  };
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } else {
    db = blank();
    seed();
    save();
  }
}
function reseed() { db = blank(); seed(); save(); } // 데모 데이터 초기화용

// ── 데모 시드 (첫 실행 시 1회) ──
function seed() {
  const gymId = nextId();
  db.gyms.push({ id: gymId, name: "○○피트니스", phone: "02-000-0000", address: "서울 강남구 ○○로 123", created_at: todayPlus(0) });
  db.owners.push({
    id: nextId(), gym_id: gymId, email: "demo@demo.com",
    password_hash: bcrypt.hashSync("demo1234", 8), name: "데모 사장님", created_at: todayPlus(0),
  });
  db.settings[gymId] = {
    gym_name: "○○피트니스",
    price: "1개월 헬스 99,000원 / 3개월 259,000원 / PT 10회 550,000원",
    trainers: "김코치(웨이트·체형교정), 이코치(다이어트·재활), 박코치(필라테스·바디프로필)",
    notices: "매일 14:00~14:30 청소 / 7/17 시설점검 22시 조기마감",
    events: "신규 3개월 등록 시 PT 2회 무료 (D-13, 선착순 8/30)",
    facility: "1층 프리웨이트존 / 2층 유산소·GX룸 / 3층 필라테스·샤워실\n· 인바디, 스쿼트랙 6대, 러닝머신 20대\n· 남녀 샤워실·사우나·개인락커 완비",
    gx_schedule: "[평일] 07:00 모닝요가 · 19:00 스피닝 · 20:00 필라테스\n[주말] 10:00 GX순환 · 11:00 코어\n※ 수업 20분 전 앱에서 예약",
    rental: "운동복 2,000원 / 수건 무료 / 개인락커 월 10,000원\n· 프론트에서 신청·반납",
    lostfound: "분실물은 프론트에서 최대 2주 보관합니다.\n· 습득/분실 문의: 프론트 또는 본 채팅",
    parking: "지하 1~2층 회원 무료 2시간 (차량번호 등록 시)\n· 초과 시 10분당 500원 · 만차 시 인근 공영주차장 이용",
    send_enabled: false,
  };
  const M = (name, phone, type, expDays, joinDays, ptTotal, ptRemain, ptTrainer, locker) => {
    const id = nextId();
    db.members.push({
      id, gym_id: gymId, phone, name, membership_type: type,
      expire_date: todayPlus(expDays), join_date: todayPlus(-joinDays),
      pt_total: ptTotal, pt_remain: ptRemain, pt_trainer: ptTrainer || "",
      pt_expire: ptTotal ? todayPlus(120) : "", locker: !!locker,
      locker_expire: locker ? todayPlus(20) : "", memo: "",
    });
    return id;
  };
  const h = M("홍길동", "01012345678", "헬스 3개월", 15, 95, 10, 3, "김코치", true);
  M("김영희", "01099998888", "헬스+필라 6개월", 110, 150, 0, 0, "", false);
  const b = M("박민수", "01077776666", "헬스 1개월", 6, 2, 0, 0, "", false);   // D-7 신규
  const c = M("최지우", "01066665555", "헬스 3개월", 2, 60, 20, 2, "이코치", true); // D-3, PT 소진임박
  M("정해나", "01055554444", "헬스 1개월", -1, 4, 0, 0, "", false);            // 만료·신규
  M("강휴면", "01044443333", "헬스 6개월", 40, 200, 0, 0, "", false);          // 휴면
  // 출석 (연인원용)
  [h, b, c].forEach((mid) => { for (let d = 0; d < 4; d++) db.attendance.push({ id: nextId(), gym_id: gymId, member_id: mid, date: todayPlus(-d) }); });
  // 결제(매출)
  db.payments.push({ id: nextId(), gym_id: gymId, member_id: h, item: "PT 10회", amount: 550000, paid_at: todayPlus(-5) });
  db.payments.push({ id: nextId(), gym_id: gymId, member_id: c, item: "PT 20회", amount: 990000, paid_at: todayPlus(-3) });
  // PT 세션 기록
  db.pt_sessions.push({ id: nextId(), gym_id: gymId, member_id: h, trainer: "김코치", date: todayPlus(-3), time: "19:00", status: "완료", feedback: "스쿼트 자세 교정 · 다음 데드리프트 60kg" });
  db.pt_sessions.push({ id: nextId(), gym_id: gymId, member_id: h, trainer: "김코치", date: todayPlus(1), time: "19:00", status: "예약", feedback: "" });
  // 상담/요청
  db.leads.push({ id: nextId(), gym_id: gymId, name: "이서준", phone: "01033332222", interest: "다이어트", status: "신규", created_at: todayPlus(0) });
  db.requests.push({ id: nextId(), gym_id: gymId, type: "일시정지", member_id: h, name: "홍길동", phone: "01012345678", detail: "14일", status: "접수", created_at: todayPlus(0) });
  // 데모 봇 ↔ 지점 매핑 (기존 오픈빌더 봇 id)
  db.bots.push({ id: nextId(), gym_id: gymId, kakao_bot_id: "6a2ebca4e4f43f5dd57865cd", name: "피트니스 챗봇 테스트" });
}

// ── 인증 ──
function getOwnerByEmail(email) { return db.owners.find((o) => o.email === email.toLowerCase()); }
function createOwnerWithGym({ email, password, name, gymName }) {
  email = email.toLowerCase();
  if (getOwnerByEmail(email)) return { error: "이미 가입된 이메일입니다." };
  const gymId = nextId();
  db.gyms.push({ id: gymId, name: gymName, phone: "", address: "", created_at: todayPlus(0) });
  const owner = { id: nextId(), gym_id: gymId, email, password_hash: bcrypt.hashSync(password, 8), name, created_at: todayPlus(0) };
  db.owners.push(owner);
  db.settings[gymId] = { gym_name: gymName, price: "", trainers: "", notices: "", events: "", facility: "", gx_schedule: "", rental: "", lostfound: "", parking: "", send_enabled: false };
  save();
  return { owner };
}
function verifyOwner(email, password) {
  const o = getOwnerByEmail(email || "");
  if (!o) return null;
  return bcrypt.compareSync(password, o.password_hash) ? o : null;
}
function getOwner(id) { return db.owners.find((o) => o.id === id); }
function getGym(id) { return db.gyms.find((g) => g.id === id); }

// ── 테넌트 조회 ──
const byGym = (table, gymId) => db[table].filter((r) => r.gym_id === gymId);
function members(gymId) { return byGym("members", gymId); }
function member(gymId, id) { return db.members.find((m) => m.gym_id === gymId && m.id === id); }
function ptMembers(gymId) { return members(gymId).filter((m) => (m.pt_total || 0) > 0 || (m.pt_remain || 0) > 0); }
function leads(gymId) { return byGym("leads", gymId).sort((a, b) => b.id - a.id); }
function requests(gymId) { return byGym("requests", gymId).sort((a, b) => b.id - a.id); }
function sendLogs(gymId) { return byGym("send_logs", gymId).sort((a, b) => b.id - a.id); }
function getSettings(gymId) { return db.settings[gymId] || {}; }
function setSettings(gymId, patch) { db.settings[gymId] = { ...(db.settings[gymId] || {}), ...patch }; save(); }

// ── 회원 upsert (CSV/수동) ──
function upsertMember(gymId, row) {
  const phone = String(row.phone || "").replace(/\D/g, "");
  if (!phone) return { skipped: true };
  let m = db.members.find((x) => x.gym_id === gymId && x.phone === phone);
  const fields = {
    name: row.name || "", membership_type: row.membership_type || "",
    expire_date: row.expire_date || "", join_date: row.join_date || "",
    pt_total: Number(row.pt_total) || 0, pt_remain: Number(row.pt_remain) || 0,
    pt_trainer: row.pt_trainer || "", pt_expire: row.pt_expire || "",
    locker: /^(y|yes|true|1|o|이용)/i.test(String(row.locker || "")),
    locker_expire: row.locker_expire || "", memo: row.memo || "",
  };
  if (m) { Object.assign(m, fields); save(); return { updated: true }; }
  db.members.push({ id: nextId(), gym_id: gymId, phone, ...fields });
  save();
  return { created: true };
}
function updateMember(gymId, id, fields) {
  const m = member(gymId, id);
  if (!m) return false;
  Object.assign(m, fields);
  save();
  return true;
}
function deleteMember(gymId, id) {
  db.members = db.members.filter((m) => !(m.gym_id === gymId && m.id === id));
  save();
}
function addPtSession(gymId, memberId, { trainer, date, time, status, feedback, homework }) {
  const s = { id: nextId(), gym_id: gymId, member_id: memberId, trainer, date, time, status, feedback: feedback || "", homework: homework || "" };
  db.pt_sessions.push(s);
  // 완료 시 잔여 차감
  if (status === "완료") { const m = member(gymId, memberId); if (m && m.pt_remain > 0) m.pt_remain -= 1; }
  save();
  return s;
}
function ptSessions(gymId, memberId) { return byGym("pt_sessions", gymId).filter((s) => s.member_id === memberId).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); }

function setLeadStatus(gymId, id, status) { const l = db.leads.find((x) => x.gym_id === gymId && x.id === id); if (l) { l.status = status; save(); } }
function setRequestStatus(gymId, id, status) { const r = db.requests.find((x) => x.gym_id === gymId && x.id === id); if (r) { r.status = status; save(); } }
function addSendLog(gymId, entry) { const log = { id: nextId(), gym_id: gymId, sent_at: new Date().toISOString().slice(0, 16).replace("T", " "), ...entry }; db.send_logs.push(log); save(); return log; }

// 알림톡 발송 어댑터 (Solapi 예시). 자격증명 미설정 시 dry-run.
function sendAlimtalk({ phone, message, variables }) {
  const key = process.env.SOLAPI_API_KEY, secret = process.env.SOLAPI_API_SECRET;
  const pfId = process.env.SOLAPI_PFID, templateId = process.env.SOLAPI_TEMPLATE_ID, from = process.env.SEND_FROM;
  if (!key || !secret || !pfId || !templateId || !from) return Promise.resolve({ dryRun: true });
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  const body = { message: { to: String(phone).replace(/\D/g, ""), from: String(from).replace(/\D/g, ""), type: "ATA", text: message, kakaoOptions: { pfId, templateId, variables: variables || {}, disableSms: false } } };
  return fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}` },
    body: JSON.stringify(body),
  }).then(async (r) => { const t = await r.json().catch(() => ({})); return r.ok ? { sent: true, id: t.messageId || t.groupId || "ok" } : { error: (t && (t.errorMessage || t.message)) || ("HTTP " + r.status) }; })
    .catch((e) => ({ error: e.message }));
}

// 회원에게 알림 발송 + 이력 기록 (send_enabled + 대행사 설정 시 실발송, 아니면 dry-run)
function notifyMember(gymId, { member_id, phone, name, kind, message, variables }) {
  const s = getSettings(gymId);
  const provider = !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_PFID && process.env.SOLAPI_TEMPLATE_ID);
  const willSend = !!s.send_enabled && provider;
  const log = addSendLog(gymId, { kind: kind || "PT피드백", target: phone, member_id: member_id || null, message, status: willSend ? "sent" : "dry-run" });
  if (willSend) {
    sendAlimtalk({ phone, message, variables }).then((r) => {
      if (r && r.error) { log.status = "error"; log.error = r.error; save(); }
      else if (r && r.id) { log.provider_id = r.id; save(); }
    }).catch(() => {});
  }
  return { status: log.status, log };
}

// ── 집계(대시보드/리포트) ──
const dayIdx = (s) => Math.floor(Date.parse(s + "T00:00:00Z") / 86400000);
function ddayOf(expire) { return expire ? Math.ceil((Date.parse(expire + "T23:59:59Z") - Date.now()) / 86400000) : null; }
function metrics(gymId, days = 7) {
  const ms = members(gymId);
  const cut = dayIdx(todayPlus(0)) - days;
  const att = byGym("attendance", gymId);
  const todayStr = todayPlus(0);
  const todayAtt = new Set(att.filter((a) => a.date === todayStr).map((a) => a.member_id)).size;
  const visits = att.filter((a) => dayIdx(a.date) > cut).length;
  const newMembers = ms.filter((m) => m.join_date && dayIdx(m.join_date) > cut);
  const expiring = ms.filter((m) => { const d = ddayOf(m.expire_date); return d != null && d >= 0 && d <= 7; });
  // 휴면: 최근 방문 14일 초과
  const lastVisit = {};
  att.forEach((a) => { if (!lastVisit[a.member_id] || a.date > lastVisit[a.member_id]) lastVisit[a.member_id] = a.date; });
  const dormant = ms.filter((m) => { const lv = lastVisit[m.id]; return !lv || dayIdx(todayStr) - dayIdx(lv) >= 14; });
  const ptLow = ptMembers(gymId).filter((m) => (m.pt_remain || 0) <= 2);
  const rev = byGym("payments", gymId).filter((p) => dayIdx(p.paid_at) > cut);
  const revSum = rev.reduce((s, p) => s + p.amount, 0);
  const ptRes = byGym("pt_sessions", gymId).filter((s) => dayIdx(s.date) > cut && s.status !== "취소").length;
  return {
    todayAtt, visits, newMembers, expiring, dormant, ptLow,
    revSum, revCnt: rev.length, ptRes,
    leadsNew: leads(gymId).filter((l) => l.status === "신규").length,
    reqNew: requests(gymId).filter((r) => r.status === "접수").length,
    totalMembers: ms.length,
  };
}

// ── 챗봇(스킬) 연동용 ──
// 매핑된 봇만 해당 지점으로 라우팅 (미매핑 봇은 null → 타 지점 데이터 유출 방지)
function gymByBot(botId) { const b = db.bots.find((x) => x.kakao_bot_id === botId); return b ? b.gym_id : null; }
function getBotByGym(gymId) { return db.bots.find((x) => x.gym_id === gymId) || null; }
function setBotForGym(gymId, kakaoBotId) {
  kakaoBotId = String(kakaoBotId || "").trim();
  if (!kakaoBotId) return { error: "봇 ID를 입력해 주세요." };
  const other = db.bots.find((x) => x.kakao_bot_id === kakaoBotId && x.gym_id !== gymId);
  if (other) return { error: "이미 다른 매장에 연결된 봇 ID입니다." };
  let b = db.bots.find((x) => x.gym_id === gymId);
  if (b) { b.kakao_bot_id = kakaoBotId; } else { b = { id: nextId(), gym_id: gymId, kakao_bot_id: kakaoBotId, name: "" }; db.bots.push(b); }
  save();
  return { bot: b };
}
function findMemberByPhone(gymId, phone) { phone = String(phone || "").replace(/\D/g, ""); return db.members.find((m) => m.gym_id === gymId && m.phone === phone); }
function createLead(gymId, { name, phone, interest }) { const l = { id: nextId(), gym_id: gymId, name: name || "고객", phone: phone || "", interest: interest || "", status: "신규", created_at: todayPlus(0) }; db.leads.push(l); save(); return l; }
function createRequest(gymId, { type, name, phone, detail, member_id }) { const r = { id: nextId(), gym_id: gymId, type, name: name || "고객", phone: phone || "", detail: detail || "", member_id: member_id || null, status: "접수", created_at: todayPlus(0) }; db.requests.push(r); save(); return r; }
// 회원 식별: botUserKey ↔ 회원 매핑 (최초 1회 연결 후 자동 식별)
function memberByBotUser(gymId, key) { if (!key) return null; const b = db.bot_users.find((x) => x.gym_id === gymId && x.bot_user_key === key); if (!b) return null; return db.members.find((m) => m.id === b.member_id) || null; }
function linkBotUser(gymId, key, memberId) { if (!key) return null; let b = db.bot_users.find((x) => x.gym_id === gymId && x.bot_user_key === key); if (b) { b.member_id = memberId; } else { b = { id: nextId(), gym_id: gymId, bot_user_key: key, member_id: memberId, consent_at: new Date().toISOString().slice(0, 16).replace("T", " "), linked_at: todayPlus(0) }; db.bot_users.push(b); } save(); return b; }
// 출석: 오늘 1회 체크인(중복 방지), 회원 출석일 목록
function checkinMember(gymId, memberId) {
  const today = todayPlus(0);
  const exists = db.attendance.find((a) => a.gym_id === gymId && a.member_id === memberId && a.date === today);
  if (!exists) { db.attendance.push({ id: nextId(), gym_id: gymId, member_id: memberId, date: today }); save(); }
  return { already: !!exists, dates: attendanceDates(gymId, memberId) };
}
function attendanceDates(gymId, memberId) {
  return db.attendance.filter((a) => a.gym_id === gymId && a.member_id === memberId).map((a) => a.date).sort();
}
// PT 예약(예정)·완료 세션
function memberSessions(gymId, memberId) {
  const s = db.pt_sessions.filter((x) => x.gym_id === gymId && x.member_id === memberId);
  const today = todayPlus(0);
  return {
    upcoming: s.filter((x) => x.status === "예약" && x.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    past: s.filter((x) => x.status === "완료").sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
  };
}

module.exports = {
  load, save, reseed, todayPlus, ddayOf, lastBackupInfo, gymExport,
  gymByBot, getBotByGym, setBotForGym, findMemberByPhone, createLead, createRequest, memberByBotUser, linkBotUser,
  checkinMember, attendanceDates, memberSessions,
  getOwnerByEmail, createOwnerWithGym, verifyOwner, getOwner, getGym,
  members, member, ptMembers, leads, requests, sendLogs, getSettings, setSettings,
  upsertMember, updateMember, deleteMember, addPtSession, ptSessions,
  setLeadStatus, setRequestStatus, addSendLog, notifyMember, metrics,
};
