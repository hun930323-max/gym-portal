# 배포 가이드 (결제 없이 테스트 → 실서비스)

이 앱은 **사장님 포털 + 카카오 챗봇 스킬**을 한 서버에서 제공합니다.
아래 순서로 **결제 없이 무료로 end-to-end 테스트**한 뒤, 필요할 때 유료 상시 가동으로 올리면 됩니다.

---

## A. 로컬 테스트 (0원, 즉시)

```bash
cd gym-portal
npm install
npm start
```
- 포털: http://localhost:4000 (demo@demo.com / demo1234)
- 챗봇 스킬도 같은 서버에서: `POST http://localhost:4000/skill/membership` 등
- 회원을 CSV로 올리거나 수정 → 챗봇 응답에 즉시 반영되는지 확인

> 챗봇 스킬 직접 테스트(예):
> ```bash
> curl -X POST http://localhost:4000/skill/membership \
>   -H "Content-Type: application/json" \
>   -d '{"bot":{"id":"6a2ebca4e4f43f5dd57865cd"},"userRequest":{"utterance":"회원권 01012345678"}}'
> ```

---

## B. 무료 배포 (0원, 카카오 봇테스트까지 확인)

카카오 오픈빌더 봇테스트에서 **실 회원 데이터로 응답**하는 걸 확인하려면 공개 HTTPS 주소가 필요합니다.
무료 티어(콜드스타트 있음, 테스트엔 무방)로 올립니다.

### 1) GitHub에 코드 올리기
- 새 저장소(예: `gym-portal`) 생성 → 이 폴더의 파일 업로드
- (`data/`, `node_modules/`는 `.gitignore`로 제외됨)

### 2) Render 무료 배포
- render.com → New → Web Service → 위 저장소 선택
- 자동으로 `render.yaml`을 읽어 무료 플랜으로 배포 (Build: `npm install`, Start: `node server.js`)
- 발급 주소 예: `https://gym-portal.onrender.com`
- 포털 접속: `https://gym-portal.onrender.com/` (demo 로그인)

> 무료 플랜 주의: 15분 미사용 시 잠들어 첫 요청이 ~50초(카카오 5초 타임아웃 초과 가능).
> **테스트 요령**: 봇테스트 직전에 포털 주소를 한 번 열어 서버를 깨운 뒤 발화하면 정상 응답.
> 또한 무료는 영구 디스크가 없어 재배포 시 업로드한 데이터가 초기화됩니다(테스트엔 무방).

### 3) 오픈빌더 스킬을 이 서버로 재지정 (테스트용)
- 오픈빌더 → 스킬 목록 → 각 스킬의 URL을
  `https://gym-skill-server.onrender.com/skill/…` → `https://gym-portal.onrender.com/skill/…` 로 변경
- (또는 테스트할 스킬 몇 개만: membership, pt, faq, lead 등)
- 봇테스트: 포털에서 올린 회원 전화번호로 "회원권 0101…" → 그 회원 정보가 뜨면 연동 성공 ✅

---

## C. 실서비스 전환 (결제 필요 · 나중에)

무료 티어의 콜드스타트·데이터 초기화를 없애려면 **상시 가동 + 영구 저장**으로:

1. **호스팅**: Railway Hobby($5/월, 콜드스타트 없음·가성비 1위) 또는 Render Starter.
2. **데이터 영구화**:
   - 간단: 영구 볼륨 마운트 후 환경변수 `DATA_DIR=/영구경로` 지정 (JSON 유지)
   - 정식: `db.js`를 PostgreSQL(Neon 무료 or Railway Postgres)로 교체
3. **지점 추가**: 포털 `bots`에 `kakao_bot_id ↔ gym_id` 등록 → 지점별 데이터 분리
4. **실 발송**: 카카오 채널 연결 + 알림톡 템플릿 승인 → 발송 스위치 ON

---

## 환경변수 요약

| 변수 | 용도 | 기본값 |
|---|---|---|
| `PORT` | 서버 포트 | 4000 |
| `SESSION_SECRET` | 세션 서명 키(배포 시 설정 권장) | dev 기본값 |
| `DATA_DIR` | 데이터 저장 경로(영구 볼륨 지정용) | `./data` |
