// HTML 렌더 (템플릿 엔진 없이 문자열 조립)
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const won = (n) => (Number(n) || 0).toLocaleString("ko-KR") + "원";
const maskPhone = (p) => String(p || "").replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-****-$3");

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;background:#F4F6F8;color:#1B2430;font-size:14px}
a{color:inherit;text-decoration:none}
.layout{display:flex;min-height:100vh}
.side{width:224px;background:#1B2430;color:#cfd6df;flex:0 0 224px;padding:22px 0}
.side .brand{font-size:17px;font-weight:800;color:#FFB020;padding:0 22px 6px}
.side .gym{font-size:12px;color:#8b95a3;padding:0 22px 18px;border-bottom:1px solid #2b3644;margin-bottom:12px}
.side a{display:block;padding:11px 22px;color:#cfd6df;font-weight:600;font-size:13.5px}
.side a.active,.side a:hover{background:#26313f;color:#fff;border-left:3px solid #FFB020}
.side .logout{margin-top:18px;font-size:12px;color:#8b95a3}
.main{flex:1;padding:26px 32px;max-width:1160px}
h1{font-size:22px;margin-bottom:4px}
.sub{color:#6B7280;font-size:13px;margin-bottom:20px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.card{background:#fff;border:1px solid #E3E6EA;border-radius:14px;padding:16px 18px}
.card .k{font-size:12px;color:#6B7280;margin-bottom:6px}
.card .v{font-size:24px;font-weight:800}
.card .v small{font-size:13px;color:#6B7280;font-weight:600}
.card.warn .v{color:#E5484D}
.panel{background:#fff;border:1px solid #E3E6EA;border-radius:14px;padding:20px 22px;margin-bottom:20px}
.panel h2{font-size:15px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #EEF1F4}
th{color:#6B7280;font-weight:700;font-size:12px}
tr:hover td{background:#FAFBFC}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700}
.b-gold{background:#FDF1DD;color:#B26B00}.b-red{background:#FDECEC;color:#E5484D}.b-green{background:#E6F6EE;color:#1E9E5A}.b-gray{background:#EEF1F4;color:#6B7280}
.btn{display:inline-block;background:#FFB020;color:#1B2430;font-weight:700;border:none;border-radius:10px;padding:9px 16px;cursor:pointer;font-size:13px}
.btn.sm{padding:6px 11px;font-size:12px;border-radius:8px}
.btn.gray{background:#EEF1F4;color:#1B2430}
.btn.dark{background:#1B2430;color:#fff}
input,select,textarea{font-family:inherit;font-size:13px;border:1px solid #D8DDE3;border-radius:9px;padding:9px 11px;width:100%}
label{display:block;font-size:12px;color:#6B7280;margin:12px 0 5px;font-weight:600}
.row{display:flex;gap:12px;flex-wrap:wrap}
.row>div{flex:1;min-width:160px}
.auth{max-width:400px;margin:9vh auto;background:#fff;border:1px solid #E3E6EA;border-radius:16px;padding:30px}
.auth .brand{font-size:20px;font-weight:800;color:#FFB020;margin-bottom:4px}
.muted{color:#6B7280;font-size:12.5px}
.flash{background:#FDF1DD;border:1px solid #F2A93B;color:#7a4a00;padding:10px 14px;border-radius:10px;margin-bottom:16px;font-size:13px}
.flash.err{background:#FDECEC;border-color:#E5484D;color:#a12a2a}
.tabs{display:flex;gap:8px;margin-bottom:16px}
.tabs a{padding:7px 14px;border-radius:20px;background:#EEF1F4;font-weight:700;font-size:13px}
.tabs a.on{background:#1B2430;color:#fff}
.up{border:2px dashed #D8DDE3;border-radius:12px;padding:18px;text-align:center;background:#FAFBFC}
`;

function layout({ title, owner, gym, active, body, flash, flashErr }) {
  const nav = [
    ["/dashboard", "대시보드", "dashboard"],
    ["/members", "회원 관리", "members"],
    ["/pt", "PT 회원", "pt"],
    ["/reports", "리포트", "reports"],
    ["/inbox", "상담·요청 접수", "inbox"],
    ["/settings", "매장 설정", "settings"],
    ["/connect", "챗봇 연결", "connect"],
    ["/sends", "발송 관리", "sends"],
  ].map(([href, label, key]) => `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · 사장님 포털</title><style>${CSS}</style></head>
<body><div class="layout">
<nav class="side">
  <div class="brand">💪 GYM 포털</div>
  <div class="gym">${esc(gym ? gym.name : "")} · ${esc(owner ? owner.name : "")}</div>
  ${nav}
  <a class="logout" href="/logout">↩ 로그아웃</a>
</nav>
<main class="main">
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ""}
  ${flashErr ? `<div class="flash err">${esc(flashErr)}</div>` : ""}
  ${body}
</main></div></body></html>`;
}

function loginPage(msg, err) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인 · 사장님 포털</title><style>${CSS}</style></head>
<body><div class="auth">
<div class="brand">💪 GYM 포털</div>
<div class="muted" style="margin-bottom:18px">헬스장 사장님 관리 포털</div>
${msg ? `<div class="flash">${esc(msg)}</div>` : ""}${err ? `<div class="flash err">${esc(err)}</div>` : ""}
<form method="POST" action="/login">
<label>이메일</label><input name="email" type="email" value="demo@demo.com" required>
<label>비밀번호</label><input name="password" type="password" value="demo1234" required>
<button class="btn" style="width:100%;margin-top:18px">로그인</button>
</form>
<div class="muted" style="margin-top:16px;text-align:center">계정이 없으신가요? <a href="/register" style="color:#B26B00;font-weight:700">지점 등록</a></div>
<div class="muted" style="margin-top:10px;text-align:center">데모 계정: demo@demo.com / demo1234</div>
</div></body></html>`;
}
function registerPage(err) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>지점 등록</title><style>${CSS}</style></head>
<body><div class="auth">
<div class="brand">💪 GYM 포털</div><div class="muted" style="margin-bottom:18px">새 지점 등록</div>
${err ? `<div class="flash err">${esc(err)}</div>` : ""}
<form method="POST" action="/register">
<label>헬스장(지점) 이름</label><input name="gymName" required>
<label>사장님 성함</label><input name="name" required>
<label>이메일</label><input name="email" type="email" required>
<label>비밀번호</label><input name="password" type="password" minlength="6" required>
<button class="btn" style="width:100%;margin-top:18px">등록하고 시작하기</button>
</form>
<div class="muted" style="margin-top:16px;text-align:center"><a href="/login" style="color:#B26B00;font-weight:700">← 로그인으로</a></div>
</div></body></html>`;
}

function statCard(k, v, sub, warn) {
  return `<div class="card ${warn ? "warn" : ""}"><div class="k">${esc(k)}</div><div class="v">${v}${sub ? ` <small>${esc(sub)}</small>` : ""}</div></div>`;
}
function dashboardBody(m) {
  const names = (arr) => arr.slice(0, 4).map((x) => esc(x.name)).join(", ") + (arr.length > 4 ? " 외" : "");
  return `<h1>대시보드</h1><div class="sub">전체 회원 ${m.totalMembers}명 · 실시간 현황</div>
<div class="cards">
${statCard("오늘 출석", m.todayAtt, "명")}
${statCard("이번 주 신규", m.newMembers.length, "명")}
${statCard("상담 신청(신규)", m.leadsNew, "건")}
${statCard("요청 접수", m.reqNew, "건")}
</div>
<div class="cards">
${statCard("주간 매출", won(m.revSum), `${m.revCnt}건`)}
${statCard("만료 임박(7일)", m.expiring.length, "명", m.expiring.length > 0)}
${statCard("휴면(2주+)", m.dormant.length, "명", m.dormant.length > 0)}
${statCard("PT 소진 임박", m.ptLow.length, "명", m.ptLow.length > 0)}
</div>
<div class="panel"><h2>⚠️ 관리 필요 회원</h2>
<div class="row">
<div><b>만료 임박</b><div class="muted">${m.expiring.length ? names(m.expiring) : "없음"}</div></div>
<div><b>휴면</b><div class="muted">${m.dormant.length ? names(m.dormant) : "없음"}</div></div>
<div><b>PT 소진 임박</b><div class="muted">${m.ptLow.length ? m.ptLow.slice(0,4).map(x=>esc(x.name)+`(${x.pt_remain}회)`).join(", ") : "없음"}</div></div>
</div>
<div style="margin-top:16px"><a class="btn sm" href="/reports">주간 리포트 보기</a> <a class="btn sm gray" href="/members">회원 관리</a></div>
</div>`;
}

function memberRow(m, D) {
  const dday = D.ddayOf(m.expire_date);
  const exp = dday == null ? "-" : (dday < 0 ? `<span class="badge b-red">만료</span>` : dday <= 7 ? `<span class="badge b-gold">D-${dday}</span>` : `D-${dday}`);
  const pt = (m.pt_total || 0) > 0 ? `${m.pt_remain}/${m.pt_total}회` : "-";
  return `<tr>
<td><b>${esc(m.name)}</b></td><td>${esc(maskPhone(m.phone))}</td><td>${esc(m.membership_type)}</td>
<td>${esc(m.expire_date || "-")} ${exp}</td><td>${pt}</td><td>${m.locker ? "이용" : "-"}</td>
<td><a class="btn sm gray" href="/members/${m.id}">상세</a></td></tr>`;
}
function membersBody(list, D, q) {
  const rows = list.map((m) => memberRow(m, D)).join("") || `<tr><td colspan="7" class="muted">회원이 없습니다. CSV를 업로드하거나 직접 추가하세요.</td></tr>`;
  return `<h1>회원 관리</h1><div class="sub">총 ${list.length}명 · CSV 업로드로 한 번에 등록</div>
<div class="panel"><h2>📤 회원 CSV 업로드</h2>
<form method="POST" action="/members/upload" enctype="multipart/form-data">
<div class="up">CSV 파일 선택 (헤더: 전화번호,이름,회원권종류,만료일,가입일,PT총회,PT잔여,PT담당강사,락커여부,락커만료일,메모)
<div style="margin-top:12px"><input type="file" name="csv" accept=".csv" required style="max-width:360px;display:inline-block"></div></div>
<button class="btn" style="margin-top:14px">업로드 (전화번호 기준 추가/갱신)</button>
<a class="btn gray" href="/members/sample.csv" style="margin-top:14px">샘플 CSV 내려받기</a>
</form></div>
<div class="panel"><h2>회원 목록</h2>
<form method="GET" action="/members" style="margin-bottom:12px;display:flex;gap:8px;max-width:420px">
<input name="q" placeholder="이름·전화 검색" value="${esc(q || "")}"><button class="btn sm">검색</button>
<a class="btn sm gray" href="/members/new">+ 직접 추가</a></form>
<table><thead><tr><th>이름</th><th>전화</th><th>회원권</th><th>만료</th><th>PT</th><th>락커</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}
function memberDetailBody(m, sessions, D) {
  const sRows = sessions.map((s) => `<tr><td>${esc(s.date)} ${esc(s.time || "")}</td><td>${esc(s.trainer || "")}</td><td><span class="badge ${s.status === "완료" ? "b-green" : s.status === "노쇼" ? "b-red" : "b-gray"}">${esc(s.status)}</span></td><td>${esc(s.feedback || "-")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">기록 없음</td></tr>`;
  const f = (name, val, type) => `<div><label>${name}</label><input name="${name === "이름" ? "name" : ""}" ></div>`;
  return `<h1>${esc(m.name)} <span class="muted" style="font-size:14px">${esc(maskPhone(m.phone))}</span></h1>
<div class="sub"><a href="/members">← 회원 목록</a></div>
<div class="panel"><h2>회원 정보 수정</h2>
<form method="POST" action="/members/${m.id}">
<div class="row">
<div><label>이름</label><input name="name" value="${esc(m.name)}"></div>
<div><label>회원권 종류</label><input name="membership_type" value="${esc(m.membership_type)}"></div>
<div><label>만료일 (YYYY-MM-DD)</label><input name="expire_date" value="${esc(m.expire_date)}"></div>
</div>
<div class="row">
<div><label>PT 총회</label><input name="pt_total" value="${esc(m.pt_total || 0)}"></div>
<div><label>PT 잔여</label><input name="pt_remain" value="${esc(m.pt_remain || 0)}"></div>
<div><label>PT 담당강사</label><input name="pt_trainer" value="${esc(m.pt_trainer || "")}"></div>
</div>
<div class="row">
<div><label>락커 (Y/N)</label><input name="locker" value="${m.locker ? "Y" : "N"}"></div>
<div><label>가입일</label><input name="join_date" value="${esc(m.join_date || "")}"></div>
<div><label>메모</label><input name="memo" value="${esc(m.memo || "")}"></div>
</div>
<button class="btn" style="margin-top:16px">저장</button>
</form>
<form method="POST" action="/members/${m.id}/delete" style="display:inline" onsubmit="return confirm('삭제할까요?')"><button class="btn gray sm" style="margin-top:10px">회원 삭제</button></form>
</div>
<div class="panel"><h2>PT 세션 기록</h2>
<table><thead><tr><th>일시</th><th>강사</th><th>상태</th><th>피드백</th></tr></thead><tbody>${sRows}</tbody></table>
<form method="POST" action="/pt/${m.id}/session" style="margin-top:14px">
<div class="row">
<div><label>날짜</label><input name="date" value="${esc(D.todayPlus(0))}"></div>
<div><label>시간</label><input name="time" value="19:00"></div>
<div><label>강사</label><input name="trainer" value="${esc(m.pt_trainer || "")}"></div>
<div><label>상태</label><select name="status"><option>완료</option><option>예약</option><option>노쇼</option><option>취소</option></select></div>
</div>
<label>피드백 (종목·중량·다음목표)</label><input name="feedback" placeholder="예: 스쿼트 자세교정 · 다음 데드리프트 60kg">
<button class="btn sm" style="margin-top:12px">세션 추가 (완료 시 잔여 -1)</button>
</form></div>`;
}
function ptBody(list, D) {
  const rows = list.map((m) => {
    const low = (m.pt_remain || 0) <= 2;
    return `<tr><td><b>${esc(m.name)}</b></td><td>${esc(maskPhone(m.phone))}</td><td>${esc(m.pt_trainer || "미지정")}</td>
    <td>${m.pt_remain || 0}/${m.pt_total || 0}회 ${low ? `<span class="badge b-red">소진임박</span>` : ""}</td>
    <td>${esc(m.pt_expire || "-")}</td><td><a class="btn sm gray" href="/members/${m.id}">관리</a></td></tr>`;
  }).join("") || `<tr><td colspan="6" class="muted">PT 이용권 회원이 없습니다.</td></tr>`;
  return `<h1>PT 회원 관리</h1><div class="sub">PT 이용권 보유 ${list.length}명 · 잔여·강사·세션 관리</div>
<div class="panel"><h2>PT 회원 목록</h2>
<table><thead><tr><th>이름</th><th>전화</th><th>담당강사</th><th>이용권</th><th>유효기간</th><th></th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}
function reportsBody(m, period) {
  const label = period === "month" ? "월간" : "주간";
  return `<h1>${label} 리포트</h1><div class="sub">최근 ${period === "month" ? 30 : 7}일 요약</div>
<div class="tabs"><a href="/reports?period=week" class="${period !== "month" ? "on" : ""}">주간</a><a href="/reports?period=month" class="${period === "month" ? "on" : ""}">월간</a></div>
<div class="cards">
${statCard("신규 등록", m.newMembers.length, "명")}
${statCard("결제 매출", won(m.revSum), `${m.revCnt}건`)}
${statCard("방문 연인원", m.visits, "명")}
${statCard("PT 예약", m.ptRes, "건")}
</div>
<div class="panel"><h2>요약</h2>
<table><tbody>
<tr><th>신규 등록</th><td>${m.newMembers.length}명 ${m.newMembers.length ? "(" + m.newMembers.slice(0,3).map(x=>esc(x.name)).join(", ") + (m.newMembers.length>3?" 외":"") + ")" : ""}</td></tr>
<tr><th>결제 매출</th><td>${won(m.revSum)} (${m.revCnt}건)</td></tr>
<tr><th>방문 연인원</th><td>${m.visits}명</td></tr>
<tr><th>PT 예약</th><td>${m.ptRes}건</td></tr>
<tr><th>상담/요청 접수</th><td>상담 ${m.leadsNew}건 · 요청 ${m.reqNew}건</td></tr>
<tr><th>관리 필요</th><td>만료임박 ${m.expiring.length}명 · 휴면 ${m.dormant.length}명 · PT소진임박 ${m.ptLow.length}명</td></tr>
</tbody></table>
<div class="muted" style="margin-top:12px">* 실서비스에서는 이 리포트가 매주 월요일 사장님 카톡으로 자동 발송됩니다.</div>
</div>`;
}
function inboxBody(leads, requests) {
  const st = (s) => s === "신규" || s === "접수" ? "b-gold" : s === "완료" ? "b-green" : "b-gray";
  const lRows = leads.map((l) => `<tr><td>${esc(l.created_at)}</td><td><b>${esc(l.name)}</b></td><td>${esc(maskPhone(l.phone))}</td><td>${esc(l.interest || "-")}</td>
  <td><span class="badge ${st(l.status)}">${esc(l.status)}</span></td>
  <td><form method="POST" action="/inbox/lead/${l.id}" style="display:flex;gap:6px"><select name="status"><option ${l.status==="신규"?"selected":""}>신규</option><option ${l.status==="연락완료"?"selected":""}>연락완료</option><option ${l.status==="등록"?"selected":""}>등록</option><option ${l.status==="보류"?"selected":""}>보류</option></select><button class="btn sm">변경</button></form></td></tr>`).join("") || `<tr><td colspan="6" class="muted">접수된 상담이 없습니다.</td></tr>`;
  const rRows = requests.map((r) => `<tr><td>${esc(r.created_at)}</td><td><span class="badge b-gray">${esc(r.type)}</span></td><td><b>${esc(r.name)}</b> ${esc(maskPhone(r.phone))}</td><td>${esc(r.detail || "-")}</td>
  <td><span class="badge ${st(r.status)}">${esc(r.status)}</span></td>
  <td><form method="POST" action="/inbox/request/${r.id}" style="display:flex;gap:6px"><select name="status"><option ${r.status==="접수"?"selected":""}>접수</option><option ${r.status==="처리중"?"selected":""}>처리중</option><option ${r.status==="완료"?"selected":""}>완료</option></select><button class="btn sm">변경</button></form></td></tr>`).join("") || `<tr><td colspan="6" class="muted">접수된 요청이 없습니다.</td></tr>`;
  return `<h1>상담·요청 접수함</h1><div class="sub">챗봇으로 들어온 신청을 처리하세요</div>
<div class="panel"><h2>🎟️ 상담·체험 신청 (리드)</h2>
<table><thead><tr><th>접수</th><th>이름</th><th>전화</th><th>관심</th><th>상태</th><th>처리</th></tr></thead><tbody>${lRows}</tbody></table></div>
<div class="panel"><h2>🗂️ 각종 요청 (정지·환불·대여·분실물·주차 등)</h2>
<table><thead><tr><th>접수</th><th>유형</th><th>회원</th><th>내용</th><th>상태</th><th>처리</th></tr></thead><tbody>${rRows}</tbody></table></div>`;
}
function settingsBody(s) {
  return `<h1>매장 설정</h1><div class="sub">여기서 바꾼 내용이 챗봇 응답에 그대로 반영됩니다</div>
<form method="POST" action="/settings"><div class="panel"><h2>기본 정보</h2>
<label>매장명</label><input name="gym_name" value="${esc(s.gym_name || "")}">
<label>가격 안내</label><textarea name="price" rows="2">${esc(s.price || "")}</textarea>
<label>강사 소개</label><textarea name="trainers" rows="2">${esc(s.trainers || "")}</textarea>
<label>공지사항</label><textarea name="notices" rows="2">${esc(s.notices || "")}</textarea>
<label>이벤트</label><textarea name="events" rows="2">${esc(s.events || "")}</textarea>
</div>
<div class="panel"><h2>매장 안내 (챗봇 자동응답)</h2>
<label>시설 안내</label><textarea name="facility" rows="3">${esc(s.facility || "")}</textarea>
<label>수업 시간표</label><textarea name="gx_schedule" rows="3">${esc(s.gx_schedule || "")}</textarea>
<label>대여 안내</label><textarea name="rental" rows="2">${esc(s.rental || "")}</textarea>
<label>분실물 안내</label><textarea name="lostfound" rows="2">${esc(s.lostfound || "")}</textarea>
<label>주차 안내</label><textarea name="parking" rows="2">${esc(s.parking || "")}</textarea>
<button class="btn" style="margin-top:16px">저장</button></div></form>`;
}
function sendsBody(s, logs) {
  const on = !!s.send_enabled;
  const rows = logs.slice(0, 30).map((l) => `<tr><td>${esc(l.sent_at)}</td><td><span class="badge b-gray">${esc(l.kind)}</span></td><td>${esc(maskPhone(l.target))}</td><td>${esc(l.message)}</td><td>${l.status === "sent" ? `<span class="badge b-green">발송</span>` : `<span class="badge b-gold">dry-run</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">발송 이력이 없습니다.</td></tr>`;
  return `<h1>발송 관리</h1><div class="sub">자동 발송 대상·스위치·이력</div>
<div class="panel"><h2>발송 스위치</h2>
<p class="muted" style="margin-bottom:12px">현재 상태: ${on ? `<span class="badge b-green">실발송 ON</span>` : `<span class="badge b-gold">dry-run (로그만)</span>`} — 실발송은 카카오 채널 연결 + 알림톡 템플릿 승인 후 켜세요.</p>
<form method="POST" action="/sends/toggle"><button class="btn ${on ? "gray" : "dark"}">${on ? "dry-run으로 끄기" : "실발송 켜기"}</button></form>
</div>
<div class="panel"><h2>자동 발송 항목</h2>
<table><tbody>
<tr><th>재등록 리마인드</th><td>만료 D-7 / D-3 / D-day 알림톡</td></tr>
<tr><th>휴면 회원</th><td>2주+ 미방문 친구톡 (동의 회원)</td></tr>
<tr><th>PT 소진 임박</th><td>잔여 ≤ 2회 재등록 안내</td></tr>
<tr><th>사장님 리포트</th><td>매주 월요일 주간 리포트</td></tr>
</tbody></table></div>
<div class="panel"><h2>발송 이력</h2>
<table><thead><tr><th>시각</th><th>종류</th><th>대상</th><th>내용</th><th>상태</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function connectBody(gym, bot, base) {
  const cur = bot ? bot.kakao_bot_id : "";
  const eps = [
    ["웰컴(웰컴블록)", "welcome", "(웰컴 블록)"],
    ["회원권조회", "membership", "내 회원권 조회"],
    ["PT안내/현황", "pt", "PT 현황"],
    ["출석체크", "checkin", "출석 체크"],
    ["출석현황", "attendance", "출석 현황"],
    ["재등록", "renew", "재등록"],
    ["PT예약", "reserve", "PT 예약"],
    ["가격/FAQ", "faq", "가격"],
    ["강사소개", "trainer", "강사 소개"],
    ["공지사항", "notice", "공지사항"],
    ["이벤트", "event", "이벤트"],
    ["시설안내", "facility", "시설"],
    ["수업시간표", "gx", "수업시간표"],
    ["대여", "rental", "대여"],
    ["분실물", "lostfound", "분실물"],
    ["주차", "parking", "주차"],
    ["상담신청", "lead", "무료 상담 신청"],
    ["신청접수(환불/정지/변경)", "request", "일시정지 신청"],
    ["관리자(포털 안내)", "admin", "관리자"],
  ];
  const rows = eps.map(([n, p, u]) => `<tr><td>${esc(n)}</td><td><code>${esc(base)}/skill/${p}</code></td><td class="muted">${esc(u)}</td></tr>`).join("");
  const status = cur
    ? `<p style="margin-top:10px"><span class="badge b-green">연결됨</span> <code>${esc(cur)}</code></p>`
    : `<p style="margin-top:10px"><span class="badge b-gold">미연결</span> — 연결 전에는 이 지점 데이터로 응답하지 않습니다.</p>`;
  return `<h1>챗봇 연결</h1><div class="sub">내 카카오 오픈빌더 봇을 연결하면, 챗봇이 <b>이 지점 회원·설정으로만</b> 응답합니다 (지점별 데이터 격리)</div>
<div class="panel"><h2>1. 봇 ID 연결</h2>
<p class="muted">카카오 i 오픈빌더 → 내 봇으로 들어가면 주소창이 <code>chatbot.kakao.com/bot/<b>여기가_봇ID</b>/…</code> 형태입니다. 그 값을 붙여넣으세요.</p>
<form method="POST" action="/connect">
<label>카카오 봇 ID</label><input name="kakao_bot_id" value="${esc(cur)}" placeholder="예) 6a2ebca4e4f43f5dd57865cd" required>
<button class="btn" style="margin-top:12px">${cur ? "연결 변경" : "연결하기"}</button></form>
${status}</div>
<div class="panel"><h2>2. 오픈빌더 스킬 URL 등록</h2>
<p class="muted">오픈빌더에서 각 스킬(또는 새 스킬)의 URL을 아래 주소로 지정하고, 해당 블록의 대표발화에 예시를 넣으세요.</p>
<table><thead><tr><th>기능</th><th>스킬 URL</th><th>발화 예시</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted" style="margin-top:10px">※ 회원 조회·출석·PT·재등록은 최초 1회 전화번호로 본인 확인 후 자동 인식됩니다. 관리 기능(회원·매출)은 이 포털에서만 제공되어 챗봇엔 개인정보가 노출되지 않습니다.</p>
</div>`;
}
function memberNewBody(D) {
  return `<h1>회원 직접 추가</h1><div class="sub"><a href="/members">← 회원 목록</a></div>
<div class="panel"><form method="POST" action="/members/new">
<div class="row"><div><label>전화번호 *</label><input name="phone" required></div><div><label>이름</label><input name="name"></div><div><label>회원권 종류</label><input name="membership_type"></div></div>
<div class="row"><div><label>만료일</label><input name="expire_date" value="${esc(D.todayPlus(90))}"></div><div><label>가입일</label><input name="join_date" value="${esc(D.todayPlus(0))}"></div><div><label>PT 총/잔여</label><input name="pt_total" placeholder="0"></div></div>
<button class="btn" style="margin-top:14px">추가</button></form></div>`;
}

module.exports = { esc, layout, loginPage, registerPage, dashboardBody, membersBody, memberDetailBody, memberNewBody, ptBody, reportsBody, inboxBody, settingsBody, connectBody, sendsBody };
