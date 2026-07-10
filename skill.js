// 카카오 스킬 엔드포인트 — 포털과 같은 DB를 읽어 응답 (멀티테넌트)
// bot.id → gym_id 로 지점을 식별하고, 그 지점의 실 회원/설정으로 답한다.
// 챗봇으로 들어온 상담·요청은 포털 접수함(db)에 기록된다.
const D = require("./db");

const skill = (outputs, qr) => { const t = { outputs }; if (qr && qr.length) t.quickReplies = qr; return { version: "2.0", template: t }; };
const text = (s) => ({ simpleText: { text: s } });
const qr = (l, m) => ({ label: l, action: "message", messageText: m || l });
const btnMsg = (l) => ({ action: "message", label: l, messageText: l });
const won = (n) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
const mask = (p) => String(p || "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-****-$3");
const ddayOf = (e) => (e ? Math.ceil((Date.parse(e + "T23:59:59Z") - Date.now()) / 86400000) : null);

const gymOf = (body) => D.gymByBot(body?.bot?.id);
const utterOf = (body) => body?.userRequest?.utterance || "";
const phoneOf = (body) => { const m = utterOf(body).match(/01\d{8,9}/); return m ? m[0] : null; };
const botUserKey = (body) => body?.userRequest?.user?.id || null;
const settingsOf = (body) => D.getSettings(gymOf(body));
const PORTAL_URL = process.env.PORTAL_URL || "https://gym-portal-hgbe.onrender.com";

// 출석 스트릭/잔디밭 유틸
const dayIdx = (s) => Math.floor(Date.parse(s + "T00:00:00Z") / 86400000);
const todayStr = () => new Date().toISOString().slice(0, 10);
function streakOf(dates) {
  if (!dates.length) return 0;
  const set = new Set(dates.map(dayIdx));
  let t = dayIdx(todayStr());
  if (!set.has(t)) t -= 1; // 어제까지 연속도 인정
  let n = 0;
  while (set.has(t)) { n++; t--; }
  return n;
}
function bestStreak(dates) {
  const idx = [...new Set(dates.map(dayIdx))].sort((a, b) => a - b);
  let best = 0, cur = 0, prev = null;
  for (const d of idx) { cur = (prev !== null && d === prev + 1) ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
  return best;
}
function calendarGrid(dates) {
  const set = new Set(dates.map(dayIdx));
  const today = dayIdx(todayStr());
  let out = "";
  for (let i = 27; i >= 0; i--) { out += set.has(today - i) ? "🟩" : "⬜"; if (i % 7 === 0 && i !== 0) out += "\n"; }
  return out;
}

// 회원 식별: ① botUserKey로 이미 연결된 회원 → 자동 ② 전화번호 최초 입력(=동의) → 연결 후 반환 ③ 미확인 → 동의·입력 안내
function resolveMember(body) {
  const gid = gymOf(body);
  const key = botUserKey(body);
  const linked = D.memberByBotUser(gid, key);
  if (linked) return { member: linked, gid, key };
  const phone = phoneOf(body);
  if (phone) {
    const m = D.findMemberByPhone(gid, phone);
    if (m) { D.linkBotUser(gid, key, m.id); return { member: m, gid, key, firstLink: true }; }
    return { notFound: true, gid };
  }
  return { needAuth: true, gid };
}
function consentCard(res) {
  return res.json(skill([{ basicCard: {
    title: "🔐 본인 확인이 필요해요",
    description: "회원 정보를 안전하게 확인하기 위해 최초 1회만 등록 전화번호를 입력해 주세요.\n(한 번 연결하면 다음부터는 자동으로 인식돼요)\n\n[개인정보 수집·이용 안내]\n· 수집 항목: 전화번호(회원 식별용)\n· 이용 목적: 회원권·PT·예약 등 본인 서비스 제공\n· 보유 기간: 회원 자격 종료 시까지\n입력하시면 위 내용에 동의하는 것으로 간주됩니다.\n\n예) 회원권 01012341234",
    buttons: [btnMsg("가격 안내")],
  } }], [qr("가격 안내", "가격")]));
}
function notFoundCard(res) {
  return res.json(skill([text("등록된 회원 정보를 찾지 못했어요. 전화번호가 맞는지 확인해 주세요.\n(신규라면 '무료 상담 신청'을 이용해 주세요)")], [qr("무료 상담 신청", "무료 상담 신청"), qr("가격 안내", "가격")]));
}
const MENU = [qr("회원권 조회", "내 회원권 조회"), qr("PT 현황", "PT 현황"), qr("가격 안내", "가격"), qr("무료 상담 신청", "무료 상담 신청")];

function register(app) {
  // 웰컴
  app.post("/skill/welcome", (req, res) => {
    const s = settingsOf(req.body);
    res.json(skill([{ basicCard: {
      title: `안녕하세요! ${s.gym_name || "헬스장"}입니다 💪`,
      description: "무엇을 도와드릴까요?\n아래 메뉴를 눌러 주세요 👇",
      buttons: [btnMsg("가격 안내"), btnMsg("무료 상담 신청")],
    } }], MENU));
  });

  // 회원권 조회 (실 회원 · botUserKey 자동 식별)
  app.post("/skill/membership", (req, res) => {
    const r = resolveMember(req.body);
    if (r.needAuth) return consentCard(res);
    if (r.notFound) return notFoundCard(res);
    const m = r.member;
    const d = ddayOf(m.expire_date);
    const pt = (m.pt_total || 0) > 0 ? `${m.pt_remain}/${m.pt_total}회 (${m.pt_trainer || "미지정"})` : "없음";
    const outs = [];
    if (r.firstLink) outs.push(text(`✅ ${m.name}님, 본인 확인이 완료됐어요! 다음부터는 전화번호 없이 자동으로 인식됩니다.`));
    outs.push({ itemCard: {
      head: { title: `${m.name}님 이용현황` },
      itemList: [
        { title: "회원권", description: m.membership_type || "-" },
        { title: "만료일", description: `${m.expire_date || "-"}${d != null ? ` (D-${d})` : ""}` },
        { title: "PT", description: pt },
        { title: "락커", description: m.locker ? "이용 중" : "미이용" },
      ],
      buttons: [btnMsg("PT 현황"), btnMsg("가격 안내")],
    } });
    res.json(skill(outs, MENU));
  });

  // PT 현황 (실 회원 · botUserKey 자동 식별)
  app.post("/skill/pt", (req, res) => {
    const r = resolveMember(req.body);
    if (r.needAuth) return consentCard(res);
    if (r.notFound) return notFoundCard(res);
    const m = r.member;
    if (!(m.pt_total > 0)) return res.json(skill([text(`${m.name}님은 현재 등록된 PT 이용권이 없어요.\n첫 상담·체험은 무료입니다!`)], [qr("무료 상담 신청", "무료 상담 신청")]));
    const bar = (() => { const total = m.pt_total, used = Math.max(0, total - (m.pt_remain || 0)); const n = 10, f = Math.round((used / total) * n); return "▓".repeat(f) + "░".repeat(n - f) + ` ${used}/${total}회`; })();
    const outs = [{ itemCard: {
      head: { title: `💪 ${m.name}님 PT 현황` },
      itemList: [
        { title: "담당 트레이너", description: m.pt_trainer || "미지정" },
        { title: "이용권", description: `총 ${m.pt_total}회 · 잔여 ${m.pt_remain}회` },
        { title: "사용 진행", description: bar },
        { title: "유효기간", description: m.pt_expire || "-" },
      ],
      buttons: [btnMsg("가격 안내"), btnMsg("무료 상담 신청")],
    } }];
    if ((m.pt_remain || 0) <= 2) outs.push(text(`⚠️ 잔여 ${m.pt_remain}회! 곧 소진돼요. 재등록을 추천드려요.`));
    res.json(skill(outs, MENU));
  });

  // 가격/FAQ — 매장 설정에서
  app.post("/skill/faq", (req, res) => {
    const s = settingsOf(req.body);
    res.json(skill([text(`💰 ${s.gym_name || "헬스장"} 가격 안내\n\n${s.price || "가격 정보가 아직 등록되지 않았어요."}`)], MENU));
  });

  // 강사 소개 — 매장 설정에서
  app.post("/skill/trainer", (req, res) => {
    const s = settingsOf(req.body);
    res.json(skill([text(`🏋️ 강사 소개\n\n${s.trainers || "강사 정보가 아직 등록되지 않았어요."}`)], MENU));
  });

  // 공지사항 — 매장 설정에서
  app.post("/skill/notice", (req, res) => {
    const s = settingsOf(req.body);
    res.json(skill([text(`📢 공지사항\n\n${s.notices || "현재 공지사항이 없어요."}`)], MENU));
  });

  // 이벤트 — 매장 설정에서
  app.post("/skill/event", (req, res) => {
    const s = settingsOf(req.body);
    res.json(skill([text(`🎉 이달의 이벤트\n\n${s.events || "진행 중인 이벤트가 없어요."}`)], MENU));
  });

  // 무료 상담/체험 신청 → 포털 접수함(db.leads)에 기록
  app.post("/skill/lead", (req, res) => {
    const gid = gymOf(req.body);
    const utter = utterOf(req.body);
    const phone = phoneOf(req.body);
    if (!phone) return res.json(skill([{ basicCard: {
      title: "🎟️ 무료 상담·체험 신청",
      description: "성함과 연락처, 관심분야를 함께 남겨주세요.\n예) 상담신청 홍길동 01012341234 다이어트",
      buttons: [btnMsg("가격 안내")],
    } }], [qr("가격 안내", "가격")]));
    const interests = ["다이어트", "체형교정", "근력", "재활", "바디프로필", "필라테스", "PT"];
    const interest = interests.find((k) => utter.includes(k)) || "";
    let name = (utter.replace(/01\d{8,9}/g, " ").replace(/상담\s*신청|상담신청|무료\s*상담|체험|신청|문의/g, " ").match(/[가-힣]{2,4}/) || [])[0] || "고객";
    const lead = D.createLead(gid, { name, phone, interest });
    res.json(skill([{ basicCard: {
      title: "✅ 상담 신청이 접수됐어요!",
      description: `${name}님 (${mask(phone)})${interest ? "\n· 관심분야: " + interest : ""}\n· 접수번호: L${lead.id}\n\n담당자가 순차적으로 연락드릴게요 🙌`,
      buttons: [btnMsg("가격 안내")],
    } }], MENU));
  });

  // 각종 요청(정지·환불 등) → 포털 접수함(db.requests)에 기록
  app.post("/skill/request", (req, res) => {
    const utter = utterOf(req.body);
    const type = /환불/.test(utter) ? "환불" : /양도/.test(utter) ? "양도" : /정지|홀딩/.test(utter) ? "일시정지" : /(정보변경|연락처)/.test(utter) ? "정보변경" : null;
    if (!type) return res.json(skill([text("어떤 신청을 도와드릴까요?")], [qr("환불 신청", "환불 신청"), qr("일시정지", "일시정지 신청"), qr("정보 변경", "정보 변경")]));
    const rm = resolveMember(req.body);
    if (rm.needAuth) return consentCard(res);
    if (rm.notFound) return notFoundCard(res);
    const m = rm.member; const gid = rm.gid;
    const r = D.createRequest(gid, { type, name: m.name, phone: m.phone, member_id: m.id, detail: utter.replace(/01\d{8,9}/g, "").trim().slice(0, 40) });
    res.json(skill([{ basicCard: {
      title: `✅ ${type} 신청 접수`,
      description: `${m.name}님 · ${type} 신청\n· 접수번호: Q${r.id}\n담당자가 확인 후 연락드릴게요.`,
      buttons: [btnMsg("회원권 조회")],
    } }], MENU));
  });

  // 출석 체크 (실 회원 · 오늘 1회) → 포털 attendance 기록
  app.post("/skill/checkin", (req, res) => {
    const r = resolveMember(req.body);
    if (r.needAuth) return consentCard(res);
    if (r.notFound) return notFoundCard(res);
    const m = r.member;
    const c = D.checkinMember(r.gid, m.id);
    const st = streakOf(c.dates);
    const outs = [];
    if (r.firstLink) outs.push(text(`✅ ${m.name}님, 본인 확인이 완료됐어요!`));
    outs.push({ basicCard: {
      title: c.already ? `${m.name}님, 오늘은 이미 출석했어요 👍` : `✅ ${m.name}님 출석 완료!`,
      description: `🔥 연속 출석 ${st}일\n📅 누적 출석 ${c.dates.length}회\n\n꾸준함이 최고의 근육이에요. 오늘도 화이팅! 💪`,
      buttons: [btnMsg("출석 현황"), btnMsg("PT 현황")],
    } });
    res.json(skill(outs, MENU));
  });

  // 출석 현황 (잔디밭)
  app.post("/skill/attendance", (req, res) => {
    const r = resolveMember(req.body);
    if (r.needAuth) return consentCard(res);
    if (r.notFound) return notFoundCard(res);
    const m = r.member;
    const dates = D.attendanceDates(r.gid, m.id);
    if (!dates.length) return res.json(skill([text(`${m.name}님, 아직 출석 기록이 없어요.\n오늘 '출석 체크'로 첫 잔디를 심어보세요! 🌱`)], [qr("출석 체크", "출석 체크"), ...MENU]));
    const st = streakOf(dates), best = bestStreak(dates);
    res.json(skill([text(`📅 ${m.name}님 최근 4주 출석\n\n${calendarGrid(dates)}\n\n🔥 현재 연속 ${st}일 · 🏆 최고 연속 ${best}일 · 누적 ${dates.length}회`)], [qr("출석 체크", "출석 체크"), ...MENU]));
  });

  // 재등록 안내/신청
  app.post("/skill/renew", (req, res) => {
    const utter = utterOf(req.body);
    const r = resolveMember(req.body);
    if (r.needAuth) return consentCard(res);
    if (r.notFound) return notFoundCard(res);
    const m = r.member, s = settingsOf(req.body);
    const d = ddayOf(m.expire_date);
    if (/신청|접수|확정|연장할|등록할/.test(utter)) {
      const rq = D.createRequest(r.gid, { type: "재등록", name: m.name, phone: m.phone, member_id: m.id, detail: `${m.membership_type || ""} 만료 ${m.expire_date || ""}` });
      return res.json(skill([{ basicCard: { title: "✅ 재등록 신청 접수", description: `${m.name}님 재등록 신청이 접수됐어요.\n· 접수번호: Q${rq.id}\n담당자가 확인 후 안내드릴게요.`, buttons: [btnMsg("가격 안내")] } }], MENU));
    }
    res.json(skill([{ basicCard: {
      title: `🔄 ${m.name}님 재등록 안내`,
      description: `현재 회원권: ${m.membership_type || "-"}\n만료일: ${m.expire_date || "-"}${d != null ? ` (D-${d})` : ""}\n\n💰 ${s.price || "가격 정보 준비 중"}\n\n지금 재등록하면 공백 없이 이어집니다!`,
      buttons: [btnMsg("재등록 신청"), btnMsg("가격 안내")],
    } }], MENU));
  });

  // PT 예약 조회/신청 (실 회원)
  app.post("/skill/reserve", (req, res) => {
    const utter = utterOf(req.body);
    const r = resolveMember(req.body);
    if (r.needAuth) return consentCard(res);
    if (r.notFound) return notFoundCard(res);
    const m = r.member;
    if (!(m.pt_total > 0)) return res.json(skill([text(`${m.name}님은 등록된 PT 이용권이 없어요.\n첫 상담·체험은 무료입니다!`)], [qr("무료 상담 신청", "무료 상담 신청")]));
    if (/신청|예약해|예약하|잡아|해줘/.test(utter)) {
      const rq = D.createRequest(r.gid, { type: "PT예약", name: m.name, phone: m.phone, member_id: m.id, detail: utter.replace(/01\d{8,9}/g, "").slice(0, 40) });
      return res.json(skill([{ basicCard: { title: "✅ PT 예약 요청 접수", description: `${m.name}님 · 담당 ${m.pt_trainer || "트레이너"}\n· 접수번호: Q${rq.id}\n트레이너가 시간 조율 후 확정해드려요.`, buttons: [btnMsg("PT 현황")] } }], MENU));
    }
    const ses = D.memberSessions(r.gid, m.id);
    const up = ses.upcoming.slice(0, 3).map((x) => `• ${x.date} ${x.time} (${x.trainer})`).join("\n") || "예정된 예약이 없어요";
    const pa = ses.past.slice(0, 3).map((x) => `• ${x.date} ${x.trainer}${x.feedback ? ` — ${x.feedback}` : ""}`).join("\n") || "완료된 세션이 없어요";
    res.json(skill([{ basicCard: {
      title: `📅 ${m.name}님 PT 예약`,
      description: `[예정]\n${up}\n\n[최근 완료]\n${pa}\n\n잔여 ${m.pt_remain}/${m.pt_total}회 · 담당 ${m.pt_trainer || "미지정"}`,
      buttons: [btnMsg("PT 예약 신청"), btnMsg("PT 현황")],
    } }], MENU));
  });

  // 매장 정보(설정 기반, 회원식별 불필요)
  const infoSkill = (path, emoji, title, key, empty) => app.post(path, (req, res) => {
    const s = settingsOf(req.body);
    res.json(skill([text(`${emoji} ${title}\n\n${s[key] || empty}`)], MENU));
  });
  infoSkill("/skill/facility", "🏢", "시설 안내", "facility", "시설 정보가 아직 등록되지 않았어요.");
  infoSkill("/skill/gx", "📅", "수업 시간표", "gx_schedule", "시간표가 아직 등록되지 않았어요.");
  infoSkill("/skill/rental", "🧺", "대여 안내", "rental", "대여 정보가 아직 등록되지 않았어요.");
  infoSkill("/skill/lostfound", "🔍", "분실물 안내", "lostfound", "분실물 안내가 아직 등록되지 않았어요.");
  infoSkill("/skill/parking", "🚗", "주차 안내", "parking", "주차 정보가 아직 등록되지 않았어요.");

  // 관리자 — 개인정보 노출 금지, 웹 포털로 안내 (PII 게이트)
  app.post("/skill/admin", (req, res) => {
    res.json(skill([{ basicCard: {
      title: "🔒 관리자 기능은 웹 포털에서",
      description: "회원 정보·매출·통계 등 관리 기능은 보안을 위해 사장님 전용 웹 포털에서만 제공됩니다.\n챗봇 대화에서는 개인정보가 노출되지 않습니다.",
      buttons: [{ action: "webLink", label: "사장님 포털 열기", webLinkUrl: PORTAL_URL + "/login" }],
    } }], MENU));
  });
}

module.exports = { register };
