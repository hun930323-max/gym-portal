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
  req.isAdmin = !!owner.is_admin;
  next();
}
// 운영자(우리) 전용 라우트 가드 — 사장님 접근 차단
function adminOnly(req, res, next) {
  if (!req.isAdmin) { flash(req, "운영자 전용 메뉴입니다. 접근 권한이 없습니다.", true); return res.redirect("/dashboard"); }
  next();
}
// 운영자는 지점을 선택해 관리 (?gym=<id>), 세션에 유지. 사장님은 항상 본인 지점.
function adminGid(req) {
  if (!req.isAdmin) return req.gymId;
  if (req.query.gym) { const g = Number(req.query.gym); if (D.getGym(g)) req.session.targetGymId = g; }
  return req.session.targetGymId && D.getGym(req.session.targetGymId) ? req.session.targetGymId : req.gymId;
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
// 회원 CSV 내보내기 (업로드 양식과 호환 → 재업로드 가능) · :id 라우트보다 먼저 등록
function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function membersToCsv(list) {
  const head = ["전화번호", "이름", "회원권종류", "만료일", "가입일", "PT총회", "PT잔여", "PT담당강사", "락커여부", "락커만료일", "메모"];
  const rows = list.map((m) => [m.phone, m.name, m.membership_type, m.expire_date, m.join_date, m.pt_total, m.pt_remain, m.pt_trainer, m.locker ? "Y" : "N", m.locker_expire, m.memo].map(csvCell).join(","));
  return "﻿" + [head.join(","), ...rows].join("\n");
}
app.get("/members/export.csv", auth, (req, res) => {
  res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename=members_${D.todayPlus(0)}.csv`).send(membersToCsv(D.members(req.gymId)));
});
app.get("/data/export.json", auth, (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8").set("Content-Disposition", `attachment; filename=backup_${D.todayPlus(0)}.json`).send(JSON.stringify(D.gymExport(req.gymId), null, 2));
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
  page(req, res, "members", "회원 관리", V.membersBody(list, D, q, D.lastBackupInfo()), { flash: f, flashErr: e });
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
  const memberId = Number(req.params.memberId);
  const date = b.date || D.todayPlus(0);
  D.addPtSession(req.gymId, memberId, { trainer: b.trainer, date, time: b.time, status: b.status, feedback: b.feedback, homework: b.homework });
  let note = "세션이 기록되었습니다.";
  if (b.status === "완료") {
    const m = D.member(req.gymId, memberId); // addPtSession 후 잔여 반영됨
    if (m && m.phone) {
      const s = D.getSettings(req.gymId);
      const gymName = s.gym_name || (req.gym && req.gym.name) || "";
      const msg = `[${gymName}] PT 세션 안내\n${m.name}님, 오늘(${date}) PT 수고하셨어요!\n\n· 담당: ${b.trainer || "트레이너"}\n· 피드백: ${b.feedback || "-"}\n· 숙제: ${b.homework || "-"}\n\n남은 PT ${m.pt_remain}회. 다음 시간에 봬요!`;
      const variables = { "#{이름}": m.name, "#{날짜}": date, "#{담당}": b.trainer || "", "#{피드백}": b.feedback || "-", "#{숙제}": b.homework || "-", "#{잔여}": String(m.pt_remain) };
      const r = D.notifyMember(req.gymId, { member_id: m.id, phone: m.phone, name: m.name, kind: "PT피드백", message: msg, variables });
      note += r.status === "sent" ? " 회원에게 알림톡을 발송했습니다." : " 알림톡 초안이 발송 관리에 기록됐어요(dry-run). 실발송은 발송 관리에서 켜세요.";
    } else {
      note += " (회원 전화번호가 없어 알림톡은 생략됨)";
    }
  }
  flash(req, note);
  res.redirect("/members/" + memberId);
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

// ── 매장 설정 (운영자 전용) ──
app.get("/settings", auth, adminOnly, (req, res) => { const { f, e } = clearFlash(req); const gid = adminGid(req); page(req, res, "settings", "매장 설정", V.settingsBody(D.getSettings(gid), { gyms: D.allGyms(), gid }), { flash: f, flashErr: e }); });
app.post("/settings", auth, adminOnly, (req, res) => {
  const gid = adminGid(req); const b = req.body;
  D.setSettings(gid, { gym_name: b.gym_name, price: b.price, trainers: b.trainers, notices: b.notices, events: b.events, facility: b.facility, gx_schedule: b.gx_schedule, rental: b.rental, lostfound: b.lostfound, parking: b.parking });
  if (b.gym_name) { const g = D.getGym(gid); if (g) { g.name = b.gym_name; D.save(); } }
  flash(req, "매장 설정이 저장되었습니다. (챗봇에 반영)");
  res.redirect("/settings");
});

// ── 챗봇 연결 (운영자 전용 · 멀티테넌트 온보딩) ──
const baseUrl = (req) => process.env.PORTAL_URL || ("https://" + req.get("host"));
app.get("/connect", auth, adminOnly, (req, res) => {
  const { f, e } = clearFlash(req); const gid = adminGid(req);
  page(req, res, "connect", "챗봇 연결", V.connectBody(D.getGym(gid), D.getBotByGym(gid), baseUrl(req), { gyms: D.allGyms(), gid }), { flash: f, flashErr: e });
});
app.post("/connect", auth, adminOnly, (req, res) => {
  const gid = adminGid(req);
  const r = D.setBotForGym(gid, req.body.kakao_bot_id);
  if (r.error) flash(req, r.error, true); else flash(req, "챗봇이 연결되었습니다. 이제 이 지점 데이터로 응답합니다.");
  res.redirect("/connect");
});

// ── 발송 관리 (운영자 전용) ──
app.get("/sends", auth, adminOnly, (req, res) => { const gid = adminGid(req); page(req, res, "sends", "발송 관리", V.sendsBody(D.getSettings(gid), D.sendLogs(gid), { gyms: D.allGyms(), gid })); });
app.post("/sends/toggle", auth, adminOnly, (req, res) => {
  const gid = adminGid(req);
  const s = D.getSettings(gid);
  D.setSettings(gid, { send_enabled: !s.send_enabled });
  res.redirect("/sends");
});

// ── 에러 로깅 + 안전 폴백 (모든 라우트 뒤) ──
app.use((err, req, res, next) => {
  console.error("[ERROR]", new Date().toISOString(), req.method, req.originalUrl, "-", (err && err.message) || err);
  if (res.headersSent) return next(err);
  if (req.path.startsWith("/skill/")) {
    return res.json({ version: "2.0", template: { outputs: [{ simpleText: { text: "일시적으로 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요." } }] } });
  }
  res.status(500).send("<div style='font-family:sans-serif;text-align:center;padding:60px'><h1>일시적인 오류가 발생했습니다</h1><p>잠시 후 다시 시도해 주세요.</p><a href='/dashboard'>← 대시보드</a></div>");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`gym-portal on http://localhost:${PORT}  (demo: demo@demo.com / demo1234)`));
