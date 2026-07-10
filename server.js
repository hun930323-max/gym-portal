// 헬스장 챗봇 SaaS — 사장님 웹 포털 (MVP)
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const D = require("./db");
const V = require("./views");

D.load();
const app = express();
app.use(express.json()); // 카카오 스킬(JSON) 바디
app.use(express.urlencoded({ extended: false }));
// 챗봇 스킬 엔드포인트(/skill/*) — 포털과 같은 DB 사용 (인증 불필요)
require("./skill").register(app);
app.use(session({ secret: process.env.SESSION_SECRET || "gym-portal-dev-secret", resave: false, saveUninitialized: false }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── 인증 미들웨어 ──
function auth(req, res, next) {
  if (!req.session.ownerId) return res.redirect("/login");
  const owner = D.getOwner(req.session.ownerId);
  if (!owner) { req.session.destroy(() => {}); return res.redirect("/login"); }
  req.owner = owner;
  req.gym = D.getGym(owner.gym_id);
  req.gymId = owner.gym_id;
  next();
}
const page = (req, res, active, title, body, extra = {}) =>
  res.send(V.layout({ title, owner: req.owner, gym: req.gym, active, body, flash: req.session.flash, flashErr: req.session.flashErr, ...extra }));
function flash(req, msg, err) { if (err) req.session.flashErr = msg; else req.session.flash = msg; }
function clearFlash(req) { const f = req.session.flash, e = req.session.flashErr; req.session.flash = null; req.session.flashErr = null; return { f, e }; }

// ── CSV 파서 ──
function parseCSV(text) {
  text = text.replace(/^﻿/, "");
  const rows = [];
  let field = "", row = [], q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  const map = { "전화번호": "phone", "이름": "name", "회원권종류": "membership_type", "회원권": "membership_type", "만료일": "expire_date", "가입일": "join_date", "PT총회": "pt_total", "PT잔여": "pt_remain", "PT담당강사": "pt_trainer", "락커여부": "locker", "락커만료일": "locker_expire", "메모": "memo" };
  return rows.slice(1).filter((r) => r.some((v) => v && v.trim())).map((r) => {
    const o = {};
    header.forEach((h, i) => { const key = map[h] || h; o[key] = (r[i] || "").trim(); });
    return o;
  });
}

// ── 인증 라우트 ──
app.get("/", (req, res) => res.redirect(req.session.ownerId ? "/dashboard" : "/login"));
app.get("/login", (req, res) => { const { f, e } = clearFlash(req); res.send(V.loginPage(f, e)); });
app.post("/login", (req, res) => {
  const o = D.verifyOwner(req.body.email, req.body.password);
  if (!o) { flash(req, "이메일 또는 비밀번호가 올바르지 않습니다.", true); return res.redirect("/login"); }
  req.session.ownerId = o.id;
  res.redirect("/dashboard");
});
app.get("/register", (req, res) => { const { e } = clearFlash(req); res.send(V.registerPage(e)); });
app.post("/register", (req, res) => {
  const { email, password, name, gymName } = req.body;
  if (!email || !password || !name || !gymName) { flash(req, "모든 항목을 입력해 주세요.", true); return res.redirect("/register"); }
  const r = D.createOwnerWithGym({ email, password, name, gymName });
  if (r.error) { flash(req, r.error, true); return res.redirect("/register"); }
  req.session.ownerId = r.owner.id;
  res.redirect("/dashboard");
});
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/login")));

// ── 대시보드 ──
app.get("/dashboard", auth, (req, res) => page(req, res, "dashboard", "대시보드", V.dashboardBody(D.metrics(req.gymId, 7))));

// ── 회원 관리 ──
app.get("/members/sample.csv", auth, (req, res) => {
  res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", "attachment; filename=members_sample.csv")
    .send("﻿전화번호,이름,회원권종류,만료일,가입일,PT총회,PT잔여,PT담당강사,락커여부,락커만료일,메모\n01012341234,김샘플,헬스 3개월,2026-12-31,2026-07-01,10,7,김코치,Y,2026-12-31,\n01098765432,이샘플,헬스 1개월,2026-08-31,2026-07-10,0,0,,N,,신규상담\n");
});
app.get("/members/new", auth, (req, res) => page(req, res, "members", "회원 추가", V.memberNewBody(D)));
app.post("/members/new", auth, (req, res) => {
  const b = req.body;
  D.upsertMember(req.gymId, { phone: b.phone, name: b.name, membership_type: b.membership_type, expire_date: b.expire_date, join_date: b.join_date, pt_total: b.pt_total, pt_remain: b.pt_total });
  flash(req, "회원이 추가되었습니다.");
  res.redirect("/members");
});
app.get("/members", auth, (req, res) => {
  const q = (req.query.q || "").trim();
  let list = D.members(req.gymId);
  if (q) list = list.filter((m) => (m.name || "").includes(q) || (m.phone || "").includes(q.replace(/\D/g, "")));
  list = list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const { f, e } = clearFlash(req);
  page(req, res, "members", "회원 관리", V.membersBody(list, D, q), { flash: f, flashErr: e });
});
app.post("/members/upload", auth, upload.single("csv"), (req, res) => {
  if (!req.file) { flash(req, "파일이 없습니다.", true); return res.redirect("/members"); }
  let rows;
  try { rows = parseCSV(req.file.buffer.toString("utf8")); } catch (e) { flash(req, "CSV 파싱 오류: " + e.message, true); return res.redirect("/members"); }
  let created = 0, updated = 0, skipped = 0;
  for (const r of rows) { const rr = D.upsertMember(req.gymId, r); if (rr.created) created++; else if (rr.updated) updated++; else skipped++; }
  flash(req, `업로드 완료 · 신규 ${created} · 갱신 ${updated}${skipped ? ` · 건너뜀 ${skipped}` : ""}`);
  res.redirect("/members");
});
app.get("/members/:id", auth, (req, res) => {
  const m = D.member(req.gymId, Number(req.params.id));
  if (!m) return res.redirect("/members");
  page(req, res, "members", m.name, V.memberDetailBody(m, D.ptSessions(req.gymId, m.id), D));
});
app.post("/members/:id", auth, (req, res) => {
  const b = req.body;
  D.updateMember(req.gymId, Number(req.params.id), {
    name: b.name, membership_type: b.membership_type, expire_date: b.expire_date, join_date: b.join_date,
    pt_total: Number(b.pt_total) || 0, pt_remain: Number(b.pt_remain) || 0, pt_trainer: b.pt_trainer,
    locker: /^y/i.test(b.locker || ""), memo: b.memo,
  });
  flash(req, "저장되었습니다.");
  res.redirect("/members/" + req.params.id);
});
app.post("/members/:id/delete", auth, (req, res) => { D.deleteMember(req.gymId, Number(req.params.id)); flash(req, "삭제되었습니다."); res.redirect("/members"); });

// ── PT 회원 ──
app.get("/pt", auth, (req, res) => {
  const list = D.ptMembers(req.gymId).sort((a, b) => (a.pt_remain || 0) - (b.pt_remain || 0));
  page(req, res, "pt", "PT 회원", V.ptBody(list, D));
});
app.post("/pt/:memberId/session", auth, (req, res) => {
  const b = req.body;
  D.addPtSession(req.gymId, Number(req.params.memberId), { trainer: b.trainer, date: b.date, time: b.time, status: b.status, feedback: b.feedback });
  flash(req, "세션이 기록되었습니다.");
  res.redirect("/members/" + req.params.memberId);
});

// ── 리포트 ──
app.get("/reports", auth, (req, res) => {
  const period = req.query.period === "month" ? "month" : "week";
  page(req, res, "reports", "리포트", V.reportsBody(D.metrics(req.gymId, period === "month" ? 30 : 7), period));
});

// ── 접수함 ──
app.get("/inbox", auth, (req, res) => {
  const { f, e } = clearFlash(req);
  page(req, res, "inbox", "접수함", V.inboxBody(D.leads(req.gymId), D.requests(req.gymId)), { flash: f, flashErr: e });
});
app.post("/inbox/lead/:id", auth, (req, res) => { D.setLeadStatus(req.gymId, Number(req.params.id), req.body.status); flash(req, "상태를 변경했습니다."); res.redirect("/inbox"); });
app.post("/inbox/request/:id", auth, (req, res) => { D.setRequestStatus(req.gymId, Number(req.params.id), req.body.status); flash(req, "상태를 변경했습니다."); res.redirect("/inbox"); });

// ── 매장 설정 ──
app.get("/settings", auth, (req, res) => { const { f, e } = clearFlash(req); page(req, res, "settings", "매장 설정", V.settingsBody(D.getSettings(req.gymId)), { flash: f, flashErr: e }); });
app.post("/settings", auth, (req, res) => {
  const b = req.body;
  D.setSettings(req.gymId, { gym_name: b.gym_name, price: b.price, trainers: b.trainers, notices: b.notices, events: b.events, facility: b.facility, gx_schedule: b.gx_schedule, rental: b.rental, lostfound: b.lostfound, parking: b.parking });
  if (b.gym_name && req.gym) { req.gym.name = b.gym_name; D.save(); }
  flash(req, "매장 설정이 저장되었습니다. (챗봇에 반영)");
  res.redirect("/settings");
});

// ── 발송 관리 ──
app.get("/sends", auth, (req, res) => page(req, res, "sends", "발송 관리", V.sendsBody(D.getSettings(req.gymId), D.sendLogs(req.gymId))));
app.post("/sends/toggle", auth, (req, res) => {
  const s = D.getSettings(req.gymId);
  D.setSettings(req.gymId, { send_enabled: !s.send_enabled });
  res.redirect("/sends");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`gym-portal on http://localhost:${PORT}  (demo: demo@demo.com / demo1234)`));
