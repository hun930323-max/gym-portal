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
    leads: [], requests: [], payments: [], send_logs: [], settings: {}, bots: [], bot_users: [], products: [],
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
    password_hash: bcrypt.hashSync("demo1234", 12), name: "데모 사장님", is_admin: false, created_at: todayPlus(0),
  });
  // 운영자(우리) 전용 계정 — 매장설정·챗봇연결·발송관리 관리 권한
  db.owners.push({
    id: nextId(), gym_id: gymId, email: "admin@gym-portal.com",
    password_hash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || "admin1234", 12), name: "운영자", is_admin: true, created_at: todayPlus(0),
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
  const owner = { id: nextId(), gym_id: gymId, email, password_hash: bcrypt.hashSync(password, 12), name, is_admin: false, created_at: todayPlus(0) };
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

// ── 스태프(트레이너) 계정 ── 사장님이 발급, 담당 PT 회원만 조회·세션 입력 가능
function staffList(gymId) { return db.owners.filter((o) => o.gym_id === gymId && o.role === "staff"); }
function createStaff(gymId, { email, password, name, trainer_name }) {
  email = String(email || "").toLowerCase().trim();
  if (!email || !password || !name) return { error: "이름·이메일·비밀번호를 모두 입력해 주세요." };
  if (String(password).length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (getOwnerByEmail(email)) return { error: "이미 사용 중인 이메일입니다." };
  const s = { id: nextId(), gym_id: gymId, email, password_hash: bcrypt.hashSync(String(password), 12), name, role: "staff", is_admin: false, trainer_name: (trainer_name || name).trim(), created_at: todayPlus(0) };
  db.owners.push(s); save();
  return { ok: true, staff: s };
}
function deleteStaff(gymId, staffId) {
  const s = db.owners.find((o) => o.id === staffId && o.gym_id === gymId && o.role === "staff");
  if (!s) return { error: "스태프를 찾을 수 없습니다." };
  db.owners = db.owners.filter((o) => o.id !== staffId);
  save(); return { ok: true };
}
// 스태프가 볼 수 있는 회원: 담당 트레이너명이 일치하는 PT 회원만
function staffMembers(gymId, trainerName) {
  const t = String(trainerName || "").trim();
  return members(gymId).filter((m) => (m.pt_total || 0) > 0 && String(m.pt_trainer || "").trim() === t);
}
function canStaffAccessMember(gymId, trainerName, memberId) {
  const m = member(gymId, memberId);
  return !!(m && String(m.pt_trainer || "").trim() === String(trainerName || "").trim());
}

// 비밀번호 변경 (현재 비번 확인 후 교체)
function changePassword(ownerId, currentPw, newPw) {
  const o = getOwner(ownerId);
  if (!o) return { error: "계정을 찾을 수 없습니다." };
  if (!bcrypt.compareSync(currentPw || "", o.password_hash)) return { error: "현재 비밀번호가 올바르지 않습니다." };
  if (!newPw || String(newPw).length < 8) return { error: "새 비밀번호는 8자 이상이어야 합니다." };
  o.password_hash = bcrypt.hashSync(String(newPw), 12);
  o.password_changed_at = new Date().toISOString().slice(0, 16).replace("T", " ");
  save();
  return { ok: true };
}
function getGym(id) { return db.gyms.find((g) => g.id === id); }
function allGyms() { return db.gyms.slice(); } // 운영자 지점 선택용

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
  // 마케팅 수신동의는 값이 있을 때만 반영(빈 값이면 기존 유지)
  if (row.marketing_consent !== undefined && String(row.marketing_consent).trim() !== "") {
    fields.marketing_consent = /^(y|yes|true|1|o|동의)/i.test(String(row.marketing_consent));
    if (fields.marketing_consent) fields.marketing_consent_at = new Date().toISOString().slice(0, 16).replace("T", " ");
  }
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
  // 연관 데이터 정리 — 고아 레코드가 통계·노쇼 집계에 "(삭제됨)"으로 남는 것 방지
  db.pt_sessions = db.pt_sessions.filter((x) => !(x.gym_id === gymId && x.member_id === id));
  db.attendance = db.attendance.filter((x) => !(x.gym_id === gymId && x.member_id === id));
  db.payments = (db.payments || []).filter((x) => !(x.gym_id === gymId && x.member_id === id));
  db.bot_users = (db.bot_users || []).filter((x) => !(x.gym_id === gymId && x.member_id === id));
  save();
}
// 기존 데이터의 고아 레코드 청소 (회원이 이미 삭제된 세션·출석·결제)
function purgeOrphans(gymId) {
  const ids = new Set(members(gymId).map((m) => m.id));
  const before = db.pt_sessions.length + db.attendance.length + (db.payments || []).length;
  db.pt_sessions = db.pt_sessions.filter((x) => x.gym_id !== gymId || ids.has(x.member_id));
  db.attendance = db.attendance.filter((x) => x.gym_id !== gymId || ids.has(x.member_id));
  db.payments = (db.payments || []).filter((x) => x.gym_id !== gymId || ids.has(x.member_id));
  const removed = before - (db.pt_sessions.length + db.attendance.length + (db.payments || []).length);
  if (removed) save();
  return removed;
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
// PT 세션 수정 (완료 상태 전환 시 잔여 보정) · 삭제
function updatePtSession(gymId, sessionId, fields) {
  const s = db.pt_sessions.find((x) => x.gym_id === gymId && x.id === sessionId);
  if (!s) return { error: "세션을 찾을 수 없습니다." };
  const wasDone = s.status === "완료";
  const willDone = fields.status === "완료";
  Object.assign(s, { trainer: fields.trainer, date: fields.date, time: fields.time, status: fields.status, feedback: fields.feedback || "", homework: fields.homework || "" });
  const m = member(gymId, s.member_id);
  if (m) { // 완료↔미완료 전환 시 잔여 보정
    if (!wasDone && willDone && m.pt_remain > 0) m.pt_remain -= 1;
    if (wasDone && !willDone) m.pt_remain = (m.pt_remain || 0) + 1;
  }
  save();
  return { ok: true, session: s };
}
function deletePtSession(gymId, sessionId) {
  const s = db.pt_sessions.find((x) => x.gym_id === gymId && x.id === sessionId);
  if (!s) return { error: "세션을 찾을 수 없습니다." };
  if (s.status === "완료") { const m = member(gymId, s.member_id); if (m) m.pt_remain = (m.pt_remain || 0) + 1; } // 잔여 복구
  db.pt_sessions = db.pt_sessions.filter((x) => !(x.gym_id === gymId && x.id === sessionId));
  save();
  return { ok: true };
}

// ── 결제/매출 ──
function payments(gymId, memberId) { const list = byGym("payments", gymId); return (memberId ? list.filter((p) => p.member_id === memberId) : list).sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at))); }
function addPayment(gymId, memberId, { item, amount, paid_at, method }) {
  const amt = Number(String(amount).replace(/[^\d.-]/g, "")) || 0;
  if (amt <= 0) return { error: "금액을 올바르게 입력해 주세요." };
  const p = { id: nextId(), gym_id: gymId, member_id: memberId || null, item: item || "", amount: amt, paid_at: paid_at || todayPlus(0), method: method || "" };
  db.payments.push(p); save();
  return { ok: true, payment: p };
}
function deletePayment(gymId, paymentId) { const before = db.payments.length; db.payments = db.payments.filter((p) => !(p.gym_id === gymId && p.id === paymentId)); save(); return { ok: db.payments.length < before }; }

// ── 출석 수기 관리 ──
function addAttendance(gymId, memberId, date) {
  const d = date || todayPlus(0);
  if (db.attendance.some((a) => a.gym_id === gymId && a.member_id === memberId && a.date === d)) return { error: "이미 해당 날짜에 출석 기록이 있습니다." };
  db.attendance.push({ id: nextId(), gym_id: gymId, member_id: memberId, date: d }); save();
  return { ok: true };
}
function removeAttendance(gymId, memberId, date) { const before = db.attendance.length; db.attendance = db.attendance.filter((a) => !(a.gym_id === gymId && a.member_id === memberId && a.date === date)); save(); return { ok: db.attendance.length < before }; }

function setLeadStatus(gymId, id, status) { const l = db.leads.find((x) => x.gym_id === gymId && x.id === id); if (l) { l.status = status; save(); } }
function setRequestStatus(gymId, id, status) { const r = db.requests.find((x) => x.gym_id === gymId && x.id === id); if (r) { r.status = status; save(); } }

// ── 리드 → 회원 전환 (상담신청이 실제 등록으로 이어질 때) ──
function convertLead(gymId, leadId, opts) {
  const l = db.leads.find((x) => x.gym_id === gymId && x.id === leadId);
  if (!l) return { error: "상담 신청을 찾을 수 없습니다." };
  const phone = String(l.phone || "").replace(/\D/g, "");
  if (!phone) return { error: "연락처가 없어 회원으로 전환할 수 없습니다." };
  const exists = db.members.find((m) => m.gym_id === gymId && m.phone === phone);
  const o = opts || {};
  const prod = o.product_id ? getProduct(gymId, Number(o.product_id)) : null;
  const months = prod ? Number(prod.months) || 0 : Number(o.months) || 0;
  const row = {
    phone, name: l.name || "고객",
    membership_type: prod ? prod.name : (o.membership_type || ""),
    expire_date: months ? todayPlus(months * 30) : (o.expire_date || ""),
    join_date: todayPlus(0),
    pt_total: prod ? (Number(prod.pt_count) || 0) : (Number(o.pt_total) || 0),
    pt_remain: prod ? (Number(prod.pt_count) || 0) : (Number(o.pt_total) || 0),
    memo: l.interest ? `상담 관심: ${l.interest}` : "",
  };
  const r = upsertMember(gymId, row);
  const m = db.members.find((x) => x.gym_id === gymId && x.phone === phone);
  // 상품이 지정되면 결제도 함께 기록 (매출 반영)
  if (prod && m && Number(prod.price) > 0) addPayment(gymId, m.id, { item: prod.name, amount: prod.price, paid_at: todayPlus(0), method: o.method || "" });
  l.status = "등록완료"; l.converted_member_id = m ? m.id : null; save();
  return { ok: true, member: m, existed: !!exists, created: !!r.created };
}

// ── PT 예약 요청 → 세션 확정 ──
function confirmReservation(gymId, requestId, { date, time, trainer }) {
  const r = db.requests.find((x) => x.gym_id === gymId && x.id === requestId);
  if (!r) return { error: "요청을 찾을 수 없습니다." };
  if (!r.member_id) return { error: "회원 정보가 없는 요청입니다." };
  const m = member(gymId, r.member_id);
  if (!m) return { error: "회원을 찾을 수 없습니다." };
  const s = addPtSession(gymId, m.id, { trainer: trainer || m.pt_trainer || "", date: date || todayPlus(1), time: time || "19:00", status: "예약", feedback: "", homework: "" });
  r.status = "확정"; r.session_id = s.id; save();
  return { ok: true, session: s, member: m };
}

// ── 회원권 상품 마스터 ──
function products(gymId) { return (db.products || []).filter((p) => p.gym_id === gymId); }
function getProduct(gymId, id) { return (db.products || []).find((p) => p.gym_id === gymId && p.id === id) || null; }
function addProduct(gymId, { name, months, price, pt_count }) {
  if (!db.products) db.products = [];
  if (!String(name || "").trim()) return { error: "상품명을 입력해 주세요." };
  const p = { id: nextId(), gym_id: gymId, name: String(name).trim(), months: Number(months) || 0, price: Number(String(price).replace(/[^\d]/g, "")) || 0, pt_count: Number(pt_count) || 0 };
  db.products.push(p); save();
  return { ok: true, product: p };
}
function deleteProduct(gymId, id) { if (!db.products) db.products = []; const b = db.products.length; db.products = db.products.filter((p) => !(p.gym_id === gymId && p.id === id)); save(); return { ok: db.products.length < b }; }
// 회원에게 상품 적용 (만료일 연장 + PT 충전 + 결제 기록)
function applyProduct(gymId, memberId, productId, { method } = {}) {
  const m = member(gymId, memberId); const p = getProduct(gymId, Number(productId));
  if (!m || !p) return { error: "회원 또는 상품을 찾을 수 없습니다." };
  const base = m.expire_date && dayIdx(m.expire_date) > dayIdx(todayPlus(0)) ? m.expire_date : todayPlus(0); // 남은 기간이 있으면 이어서 연장
  if (p.months) m.expire_date = new Date(Date.parse(base + "T00:00:00Z") + p.months * 30 * 86400000).toISOString().slice(0, 10);
  if (p.name) m.membership_type = p.name;
  if (p.pt_count) { m.pt_total = (Number(m.pt_total) || 0) + p.pt_count; m.pt_remain = (Number(m.pt_remain) || 0) + p.pt_count; }
  save();
  if (Number(p.price) > 0) addPayment(gymId, m.id, { item: p.name, amount: p.price, paid_at: todayPlus(0), method: method || "" });
  return { ok: true, member: m, product: p };
}
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
// dedup 키가 있고 이미 같은 키로 보낸 이력이 있으면 건너뜀(중복 방지)
function notifyMember(gymId, { member_id, phone, name, kind, message, variables, dedup }) {
  if (dedup && db.send_logs.some((l) => l.gym_id === gymId && l.dedup_key === dedup)) return { status: "skip", skipped: true };
  const s = getSettings(gymId);
  const provider = !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_PFID && process.env.SOLAPI_TEMPLATE_ID);
  const willSend = !!s.send_enabled && provider;
  const log = addSendLog(gymId, { kind: kind || "PT피드백", target: phone, member_id: member_id || null, message, status: willSend ? "sent" : "dry-run", dedup_key: dedup || null });
  if (willSend) {
    sendAlimtalk({ phone, message, variables }).then((r) => {
      if (r && r.error) { log.status = "error"; log.error = r.error; save(); }
      else if (r && r.id) { log.provider_id = r.id; save(); }
    }).catch(() => {});
  }
  return { status: log.status, log };
}

// ── 마케팅 수신거부(opt-out) · 야간발송 제한 ──
const PORTAL_URL = process.env.PORTAL_URL || "https://gym-portal-hgbe.onrender.com";
const UNSUB_SECRET = process.env.UNSUB_SECRET || process.env.SESSION_SECRET || "gym-portal-unsub-secret";
function unsubToken(gymId, memberId) { const sig = crypto.createHmac("sha256", UNSUB_SECRET).update(gymId + ":" + memberId).digest("hex").slice(0, 16); return `${gymId}.${memberId}.${sig}`; }
function verifyUnsubToken(token) { const p = String(token || "").split("."); if (p.length !== 3) return null; const expect = crypto.createHmac("sha256", UNSUB_SECRET).update(p[0] + ":" + p[1]).digest("hex").slice(0, 16); if (p[2] !== expect) return null; return { gymId: Number(p[0]), memberId: Number(p[1]) }; }
function setUnsubscribed(gymId, memberId) { const m = member(gymId, memberId); if (!m) return null; m.unsubscribed = true; m.unsubscribed_at = new Date().toISOString().slice(0, 16).replace("T", " "); save(); return m; }
function isDaytimeKST() { const h = (new Date().getUTCHours() + 9) % 24; return h >= 8 && h < 21; } // 광고성은 21~08시 발송 금지

// 자동 발송 스캔: 재등록 D-7/D-3/D-day(정보성) · 휴면 2주+(광고성) · PT 잔여 ≤2(정보성)
function runAutoSends(gymId) {
  const s = getSettings(gymId);
  const gymName = s.gym_name || (getGym(gymId) || {}).name || "";
  const today = todayPlus(0);
  const ms = members(gymId);
  const out = { renew: 0, dormant: 0, ptlow: 0, skipped: 0 };
  const trySend = (m, kind, message, dedup) => { const r = notifyMember(gymId, { member_id: m.id, phone: m.phone, name: m.name, kind, message, dedup }); if (r.skipped) { out.skipped++; return false; } return true; };
  // 1) 재등록 리마인드 (D-7/D-3/D-day)
  if (s.auto_renew !== false) {
    for (const m of ms) {
      if (!m.phone || !m.expire_date) continue;
      const d = dayIdx(m.expire_date) - dayIdx(today); // 정확한 잔여 일수 (D-day)
      if (d === 7 || d === 3 || d === 0) {
        const msg = `[${gymName}] 회원권 만료 안내\n${m.name}님, 회원권이 ${m.expire_date}에 만료돼요${d > 0 ? ` (D-${d})` : " (오늘 만료)"}.\n공백 없이 이어가시려면 재등록해 주세요! 💪`;
        if (trySend(m, "재등록리마인드", msg, `renew:${m.id}:${m.expire_date}:D${d}`)) out.renew++;
      }
    }
  }
  // 2) 휴면 케어 (광고성) — 마케팅 수신동의 O + 수신거부 X + 야간(21~08시 KST) 금지 준수
  if (s.auto_dormant !== false && isDaytimeKST()) {
    const att = byGym("attendance", gymId);
    const last = {};
    att.forEach((a) => { if (!last[a.member_id] || a.date > last[a.member_id]) last[a.member_id] = a.date; });
    const week = Math.floor(dayIdx(today) / 7);
    for (const m of ms) {
      if (!m.phone) continue;
      if (!m.marketing_consent || m.unsubscribed) { out.skipped++; continue; } // 광고성 동의·수신거부 준수
      const lv = last[m.id];
      const gap = lv ? dayIdx(today) - dayIdx(lv) : 999;
      if (gap >= 14) {
        const optout = `\n\n무료수신거부 ${PORTAL_URL}/u/${unsubToken(gymId, m.id)}`;
        const msg = `[${gymName}] (광고) ${m.name}님, 요즘 뜸하시네요! 🏋️\n2주 넘게 안 오셨어요. 오늘 가볍게 몸 풀러 오시는 건 어때요? 기다릴게요!` + optout;
        if (trySend(m, "휴면케어", msg, `dormant:${m.id}:${week}`)) out.dormant++;
      }
    }
  }
  // 3) PT 소진 임박 (잔여 ≤ 2)
  if (s.auto_ptlow !== false) {
    for (const m of ms) {
      if (!m.phone) continue;
      if ((m.pt_total || 0) > 0 && (m.pt_remain || 0) <= 2) {
        const msg = `[${gymName}] ${m.name}님, PT 잔여 ${m.pt_remain}회 남았어요!\n곧 소진돼요. 재등록하면 끊김 없이 이어집니다. 💪`;
        if (trySend(m, "PT소진임박", msg, `ptlow:${m.id}:${m.pt_remain}`)) out.ptlow++;
      }
    }
  }
  // 4) PT 예약 전날 리마인드 (노쇼 방지)
  out.remind = 0;
  if (s.auto_remind !== false) {
    const tomorrow = todayPlus(1);
    const ses = byGym("pt_sessions", gymId).filter((x) => x.date === tomorrow && x.status === "예약");
    for (const x of ses) {
      const m = member(gymId, x.member_id);
      if (!m || !m.phone) continue;
      const msg = `[${gymName}] PT 수업 하루 전 안내\n${m.name}님, 내일 ${x.date} ${x.time || ""} ${x.trainer ? x.trainer + " 트레이너" : ""} 수업이 예정돼 있어요.\n변경이 필요하시면 미리 알려주세요! 💪`;
      if (trySend(m, "예약리마인드", msg, `remind:${x.id}`)) out.remind++;
    }
  }
  // 5) 만료 회원 자동 정리 (만료일 경과 → 상태 표시)
  out.expired = expireOverdue(gymId);
  setSettings(gymId, { autosend_last: new Date().toISOString().slice(0, 16).replace("T", " ") });
  out.total = out.renew + out.dormant + out.ptlow + out.remind;
  return out;
}

// ── 회원권 만료 자동 처리 ──
// 만료일이 지난 회원을 '만료' 상태로 표시 (데이터는 보존 · 재등록 시 자동 해제)
function expireOverdue(gymId) {
  const t = dayIdx(todayPlus(0));
  let cnt = 0;
  for (const m of members(gymId)) {
    if (!m.expire_date) continue;
    const over = dayIdx(m.expire_date) < t;
    if (over && !m.expired) { m.expired = true; m.expired_at = todayPlus(0); cnt++; }
    else if (!over && m.expired) { m.expired = false; m.expired_at = null; cnt++; } // 재등록 시 자동 해제
  }
  if (cnt) save();
  return cnt;
}
// 만료 임박·경과 회원 (대시보드 고정 표시용)
function expiryBoard(gymId) {
  const t = dayIdx(todayPlus(0));
  const rows = members(gymId).filter((m) => m.expire_date).map((m) => ({ ...m, dday: dayIdx(m.expire_date) - t }));
  return {
    d3: rows.filter((r) => r.dday >= 0 && r.dday <= 3).sort((a, b) => a.dday - b.dday),
    d7: rows.filter((r) => r.dday > 3 && r.dday <= 7).sort((a, b) => a.dday - b.dday),
    over: rows.filter((r) => r.dday < 0).sort((a, b) => b.dday - a.dday),
  };
}

// ── 노쇼 관리 ──
// 회원별 노쇼 횟수 + 최근 노쇼일. 완료 대비 노쇼 비율이 높은 회원을 위험군으로 분류
function noshowStats(gymId, days = 90) {
  const cut = dayIdx(todayPlus(0)) - days;
  const ses = byGym("pt_sessions", gymId).filter((x) => dayIdx(x.date) > cut);
  const map = {};
  for (const x of ses) {
    const k = x.member_id;
    if (!map[k]) map[k] = { member_id: k, noshow: 0, done: 0, cancel: 0, last: "" };
    if (x.status === "노쇼") { map[k].noshow++; if (x.date > map[k].last) map[k].last = x.date; }
    else if (x.status === "완료") map[k].done++;
    else if (x.status === "취소") map[k].cancel++;
  }
  const list = Object.values(map).map((r) => {
    const m = member(gymId, r.member_id);
    if (!m) return null; // 삭제된 회원의 잔여 기록은 집계에서 제외
    const total = r.noshow + r.done;
    return { ...r, name: m.name, trainer: m.pt_trainer || "", rate: total ? Math.round((r.noshow / total) * 100) : 0 };
  }).filter(Boolean);
  const risky = list.filter((r) => r.noshow >= 2).sort((a, b) => b.noshow - a.noshow);
  return { list: list.sort((a, b) => b.noshow - a.noshow), risky, totalNoshow: list.reduce((s, r) => s + r.noshow, 0) };
}
// 내일 예정된 PT 예약 (리마인드 대상 미리보기)
function upcomingSessions(gymId, dayOffset = 1) {
  const d = todayPlus(dayOffset);
  return byGym("pt_sessions", gymId).filter((x) => x.date === d && x.status === "예약")
    .map((x) => { const m = member(gymId, x.member_id); return m ? { ...x, name: m.name, phone: m.phone } : null; })
    .filter(Boolean)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

// ── 리드 전환율 퍼널 ──
function leadFunnel(gymId, days = 30) {
  const cut = dayIdx(todayPlus(0)) - days;
  const all = leads(gymId).filter((l) => !l.created_at || dayIdx(String(l.created_at).slice(0, 10)) > cut);
  const isDone = (l) => l.status === "등록" || l.status === "등록완료" || l.converted_member_id;
  const contacted = all.filter((l) => l.status !== "신규");
  const done = all.filter(isDone);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  // 관심분야별 집계
  const byInterest = {};
  all.forEach((l) => {
    const k = (l.interest || "미지정").trim() || "미지정";
    if (!byInterest[k]) byInterest[k] = { interest: k, total: 0, done: 0 };
    byInterest[k].total++; if (isDone(l)) byInterest[k].done++;
  });
  const interests = Object.values(byInterest).map((r) => ({ ...r, rate: pct(r.done, r.total) })).sort((a, b) => b.total - a.total);
  // 전환된 리드의 매출 기여
  const revenue = done.reduce((s, l) => {
    if (!l.converted_member_id) return s;
    return s + payments(gymId, l.converted_member_id).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  }, 0);
  return {
    days, total: all.length, contacted: contacted.length, done: done.length,
    pending: all.filter((l) => l.status === "신규").length,
    hold: all.filter((l) => l.status === "보류").length,
    contactRate: pct(contacted.length, all.length),
    closeRate: pct(done.length, all.length),
    closeFromContact: pct(done.length, contacted.length),
    interests, revenue,
    avgTicket: done.length ? Math.round(revenue / done.length) : 0,
  };
}

// ── 집계(대시보드/리포트) ──
const dayIdx = (s) => Math.floor(Date.parse(s + "T00:00:00Z") / 86400000);
// 정확한 잔여 일수: 만료일 - 오늘 (날짜 인덱스 차이). 오늘 만료 = 0, 내일 = 1
function ddayOf(expire) { return expire ? dayIdx(expire) - dayIdx(todayPlus(0)) : null; }
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
    expired: ms.filter((m) => m.expired).length,
    noshow: noshowStats(gymId, days).totalNoshow,
    tomorrowPt: byGym("pt_sessions", gymId).filter((x) => x.date === todayPlus(1) && x.status === "예약").length,
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
  getOwnerByEmail, createOwnerWithGym, verifyOwner, getOwner, getGym, allGyms, changePassword,
  staffList, createStaff, deleteStaff, staffMembers, canStaffAccessMember,
  members, member, ptMembers, leads, requests, sendLogs, getSettings, setSettings,
  upsertMember, updateMember, deleteMember, addPtSession, ptSessions, updatePtSession, deletePtSession,
  payments, addPayment, deletePayment, addAttendance, removeAttendance,
  setLeadStatus, setRequestStatus, addSendLog, notifyMember, runAutoSends, metrics,
  convertLead, confirmReservation, purgeOrphans, expireOverdue, expiryBoard, noshowStats, upcomingSessions, leadFunnel, products, getProduct, addProduct, deleteProduct, applyProduct,
  unsubToken, verifyUnsubToken, setUnsubscribed,
};
