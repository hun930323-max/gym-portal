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
}

module.exports = { register };
