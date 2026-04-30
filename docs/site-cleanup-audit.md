# 사이트 정리 감사 보고서

> 작성: 2026-05-01
> 범위: lecture-dashboard 전체 (components/Dashboard.js, app/api/**, lib/**, backend/**, supabase/**)
> 목적: 최근 3대 기능(카톡 매칭, 주문 동기화, 슝 알림톡) 출시 후 다음 작업으로 진입하기 전에 **무엇을 정리할지 결정**
> 상태: **의사결정용 보고서. 코드 변경 없음.**

---

## 0. 한 줄 요약

지난 3개 PR이 모두 **`components/Dashboard.js`(9134줄)와 `app/api/`에 기능을 적층**하면서 작동은 잘 되지만 임계점에 다가가고 있음. **HIGH 보안 이슈 3건 + 모놀리식 컴포넌트 + 백엔드 의존성 모호 + 디자인 시스템 잔재**를 우선 처리하면, 다음 9개 AI 기능을 추가할 때 부채가 누적되지 않음.

검증한 결과 보안 3건은 **실제로 인증 체크가 빠져있고**, design-preview는 정말 어디서도 참조 안 됨, Python 백엔드는 [`components/Dashboard.js:7220`](../components/Dashboard.js)에서 `NEXT_PUBLIC_PYTHON_BACKEND_URL`로 여전히 호출 중.

---

## 1. 우선순위 매트릭스

| 우선 | 항목 | 현재 상태 | 작업량 | 효과 |
|---|---|---|---|---|
| 🔴 1순위 | 인증 누락 3개 라우트 | login-log / user-permissions / channel-webhook 모두 `verifyApiAuth` 없음. user-permissions는 쿼리스트링의 `loginId`를 신뢰 | 30분 | 권한 우회 차단 |
| 🔴 1순위 | `lib/nlabSupabase.js` service_role 클라이언트 노출 검사 | 핸드오프 문서에 "절대 클라이언트 import 금지"라고 적혀있음 — 자동 검사 필요 | 15분 | 데이터 유출 차단 |
| 🟡 2순위 | Python 백엔드 의존성 정리 | HuggingFace Space 절전 이슈 + 사용처 단 1곳(강의 분석) | 1~2시간 | 안정성 ↑, AI 기능 통일 (Gemini 단일화) |
| 🟡 2순위 | `app/design-preview/` 제거 | 어디서도 링크 안 됨 — 완전 dead route | 5분 | 혼란 제거 |
| 🟢 3순위 | Dashboard.js 모듈 분리 (점진적) | 9134줄 단일 파일 — 다음 9개 기능 적층 전에 시작 | 2~3일 | 향후 작업 속도/안정성 |
| 🟢 3순위 | UI 일관성 정리 | 사이드바 라벨, "(테스트)" 표기, 인라인 스타일 | 1일 | 사용 경험 ↑ |
| 🟢 3순위 | 관측성(Sentry/구조화 로그) | 프로덕션 에러 보이지 않음 | 1시간 | 운영 가시성 |

---

## 2. 🔴 1순위 — 보안 (이번 주 안에)

### 2-1. user-permissions 인증 우회 (가장 심각)

[`app/api/user-permissions/route.js`](../app/api/user-permissions/route.js)
```
26:  const loginId = searchParams.get('loginId')
29:  if (action === 'my-permissions' && loginId) {
30:    // jinwoo는 모든 권한
31:    if (loginId === 'jinwoo') { ...모든 권한 반환... }
```

**문제**: `verifyApiAuth` 호출 없음. 누구나 `?loginId=jinwoo`로 GET 하면 슈퍼어드민 권한 반환 받음. 124~125줄 `requestLoginId !== 'jinwoo'` 체크도 동일하게 쿼리스트링 신뢰.

**수정 방향 (보고용 — 실행은 승인 후)**:
- `verifyApiAuth(request)`로 토큰에서 username 추출
- 쿼리의 `loginId`는 무시하고 인증 객체의 username만 사용
- POST/DELETE처럼 권한 변경 가능한 메서드는 `auth.user.username === 'jinwoo'` 체크

### 2-2. login-log 인증 없음

[`app/api/login-log/route.js`](../app/api/login-log/route.js) — `verifyApiAuth` 없음.
- POST: 누구나 임의의 사용자명/IP/UA로 로그 위변조 가능
- 로그인 직전이라 인증 토큰이 없는 상태에서 호출되긴 함 → **그래서 이 라우트는 살리되**, (1) rate-limit, (2) 서버에서 직접 IP/UA 채우고 클라이언트 입력 무시, (3) loginId는 실제 로그인 성공 결과로만 받기 같은 방어 추가 필요.

### 2-3. channel-webhook 서명 검증 없음

[`app/api/channel-webhook/route.js`](../app/api/channel-webhook/route.js) — 라우트 상단에 `verifyApiAuth`도 없고 채널톡 webhook secret 비교 코드도 없음 (검색 결과 없음).
- 누구나 위조된 webhook을 보내 cs_history에 임의 데이터 주입 가능
- **수정 방향**: 채널톡 webhook은 `x-channel-webhook-token` 헤더 또는 HMAC 서명을 보냄 — `process.env.CHANNEL_WEBHOOK_TOKEN` 비교 (이 변수는 이미 [order-sync 핸드오프 문서 5장](order-sync-automation.md)에 등록되어 있음).

### 2-4. service_role 키 클라이언트 노출 검사

검사 항목:
- `'use client'` 또는 `components/` 안에서 `lib/nlabSupabase` import 여부
- 배포 번들에 `NLAB_SUPABASE_SERVICE_ROLE_KEY`나 `SUPABASE_SERVICE_ROLE_KEY` 문자열이 들어가는지 (`next build` 후 `.next/static/` grep)

**현재까지 확인**: [`components/Dashboard.js`](../components/Dashboard.js)에 `lib/nlabSupabase` 참조 없음 (안전). 빌드 산출물 검사는 별도로.

---

## 3. 🟡 2순위 — 정리 (이번 달 안에)

### 3-1. Python 백엔드 의존성 결정

현황:
- [`backend/`](../backend/) 폴더: `app.py`(6줄), `main.py`(532줄), `Procfile`, `railway.toml`, `Dockerfile`, `nixpacks.toml`, `HF_README.md` — **HuggingFace Space 또는 Railway에 배포 가능한 형태**
- 사용처: [`app/api/lecture-analyze-gemini/route.js`](../app/api/lecture-analyze-gemini/route.js)에서 `PYTHON_BACKEND_URL`로 프록시 + [`components/Dashboard.js:7220`](../components/Dashboard.js)에서 `NEXT_PUBLIC_PYTHON_BACKEND_URL`로 직접 fetch
- 알려진 이슈: HuggingFace Space 절전 모드 → "Application not found" 에러. `ensureBackendAwake()`로 우회 중이지만 **5번 재시도** 로직이 사용자 대기를 만듦

**3가지 갈림길**

| 옵션 | 비용 | 효과 | 비고 |
|---|---|---|---|
| A. Python 백엔드 제거, Gemini API 직접 호출 (Vercel serverless) | 1~2시간 | 절전 이슈 영구 해결, 인프라 1단계 단순화 | Vercel maxDuration 300초 한도가 강의 분석에 충분한지 확인 필요 |
| B. Railway 유료 플랜으로 이전 (절전 없음) | $5~10/월 | 코드 변경 거의 없음 | 절전만 해결, 다른 부채는 남음 |
| C. 현상 유지 | 0 | 사용자 대기 시간 길어짐 | 권장 안 함 |

**권장**: **A**. AI 기획 보고서의 Phase 0과 결합해 Gemini를 단일 통합점으로. 절전 + 별도 서버 + 별도 README + Procfile/railway/Dockerfile 모두 제거.

### 3-2. design-preview 제거

[`app/design-preview/page.js`](../app/design-preview/page.js) — 검색 결과 어디서도 라우트 링크 없음. 완전한 dead route. → **삭제 권장**.

### 3-3. lecture-analyze-gemini 캐시 정리

[`supabase/create_lecture_analysis_cache.sql`](../supabase/create_lecture_analysis_cache.sql), [`supabase/create_lecture_analysis_history.sql`](../supabase/create_lecture_analysis_history.sql) — 백엔드 결정에 따라 같이 정리. AI 기획 단의 새 `references`/`ai_outputs` 테이블에 통합 후보.

### 3-4. CSV 업로드 모드 표기

`order-sync`는 nlab 자동 모드와 CSV 수동 모드 둘 다 유지 중 (의도적, 핸드오프 문서 1장). 카카오 매칭도 마찬가지 추정.
- **유지 결정 자체는 OK**. 다만 UI에서 자동 모드를 default로 명확히 표시하고, CSV 모드는 "비상용" 또는 "수동 보정용"으로 라벨링 필요.

---

## 4. 🟢 3순위 — 구조 (다음 분기에 점진적으로)

### 4-1. Dashboard.js 분리 전략

9134줄 + 9개 AI 기능 추가 예정 → **그대로 가면 1만 5천줄 도달**. 권장 모듈화:

```
components/
├── Dashboard.jsx              (라우팅/사이드바/공통 상태만, ~500줄)
├── tabs/
│   ├── OverviewTab.jsx        (대시보드 홈)
│   ├── DetailTab.jsx          (강사 메모/첨부/AI 분석 — 9개 AI 기능 진입점)
│   ├── RankingTab.jsx
│   └── CompareTab.jsx
├── tools/
│   ├── OrderSyncTool.jsx      (이미 구현된 영역, ~700줄 분량 이전)
│   ├── KakaoMatchTool.jsx
│   ├── ShoongTool.jsx         (단일 + 대량 발송)
│   ├── CsAiTool.jsx
│   └── ...
└── ai-drafts/                 (Phase 0 신규)
    ├── AiDraftEditor.jsx      (9개 기능 공용 UI)
    └── DraftPreview.jsx
```

**점진적 이동 원칙**: AI 기획 Phase 1에 신규 기능을 만들 때 **새 기능부터 새 파일**로. 기존 코드는 안 건드림. 분기마다 1~2개씩 점진 추출.

### 4-2. UI 일관성

| 항목 | 상태 | 액션 |
|---|---|---|
| 사이드바 "💌 슝 알림톡 발송 (테스트)" 라벨 | 더 이상 테스트 아님 (대량 발송 검증됨) | "(테스트)" 제거 |
| 인라인 스타일 압도 | Tailwind 4 설치되어 있는데 거의 미사용 | 새로 만드는 컴포넌트부터 Tailwind. 기존은 점진적 |
| `.js`와 `.tsx` 혼재 | tsconfig 있음 | 신규는 `.tsx`. 기존 마이그레이션 강제 X |
| 도움말 툴팁 | `HelpTooltip` 컴포넌트 있는데 일부 메뉴만 사용 | 신규 도구마다 1줄 설명 필수 룰화 |

### 4-3. 관측성 (Observability)

- 현재: `console.log` / `console.error` 산재. 프로덕션에서 어디로도 안 감
- 권장: **`@sentry/nextjs` 1개만 추가** (서버/클라이언트 모두 자동). API 라우트 에러 + React 예외 캡처. 1시간 작업, 무료 플랜 충분
- 추가로 슝 발송, 주문 동기화, 카카오 매칭 같은 **위험 작업**은 자체 DB의 `audit_log` 테이블에 기록 (누가 / 언제 / 무엇 / 결과). 슝 대량 발송 사고 방지에 직결

### 4-4. 환경 변수 문서화

`.env.local`에 변수가 10개 이상 있음 (`SHOONG_*`, `NLAB_*`, `ANTHROPIC_*`, `GOOGLE_*`, `TOSS_*`, `CHANNEL_*`, `PYTHON_BACKEND_URL`). 한 곳에서 관리되는 문서 없음.

→ **`.env.example` 신규 작성 권장**. 변수명만 (값은 비움) + 1줄 주석. 신규 환경 셋업 / 동료 셋업 시 절대적.

---

## 5. 보고서로 안 다루는 것 (의도적)

작업 가치 대비 리스크가 커서 이번 정리에서 빼는 것:

- **Dashboard.js 한 번에 통째 분리**: 위험 큼. 점진 이동만 권장
- **TypeScript 100% 마이그레이션**: 신규 파일만 `.tsx`로. 강제 마이그레이션은 ROI 낮음
- **번들 크기 최적화 (recharts/xlsx 동적 import)**: 측정 후 결정. 사용자 단말이 느리지 않으면 보류
- **테스트 추가**: 현재 0개. 시작은 좋지만 9개 AI 기능 적층 후가 적기 — 지금은 핸드오프 문서가 효과적인 안전망

---

## 6. 추천 실행 순서

### Week 1 (긴급)
- [ ] 6-1. user-permissions 인증 패치 (2-1)
- [ ] 6-2. login-log 방어 강화 (2-2)
- [ ] 6-3. channel-webhook 토큰 검증 (2-3)
- [ ] 6-4. service_role 빌드 산출물 검사 (2-4)

### Week 2 (정리)
- [ ] 6-5. Python 백엔드 처리 결정 (3-1) — AI 기획 보고서와 의사결정 동기화
- [ ] 6-6. design-preview 제거 (3-2)
- [ ] 6-7. 슝 사이드바 "(테스트)" 라벨 정리 (4-2)
- [ ] 6-8. `.env.example` 작성 (4-4)

### Week 3+ (AI 기획 Phase 0과 병행)
- [ ] 6-9. Sentry 도입 (4-3)
- [ ] 6-10. AiDraftEditor 신규 컴포넌트 → Dashboard.js 분리 첫 발걸음 (4-1)
- [ ] 6-11. UI 일관성 정리 (4-2)는 신규 컴포넌트에 자연스럽게 적용

---

## 7. 한 페이지 요약 (의사결정자용)

- **🔴 보안 3건 + service_role 검사**: 이번 주 안에 처리 권장. 권한 우회 가능성 실재함 (검증됨)
- **🟡 Python 백엔드**: AI 기획 보고서의 Gemini 통일 결정과 같이 처리. 옵션 A (제거) 권장
- **🟡 design-preview**: 5분 작업. 그냥 제거
- **🟢 Dashboard.js 9134줄**: 한 번에 손대지 말고, **AI 기획 신규 기능부터 새 파일**에 만들어 점진 이동
- **🟢 관측성 부재**: Sentry 1시간이면 도입 가능. 다음 9개 AI 기능 출시 전에 깔아두면 안전망
- **새로운 코드는 무조건 모듈 단위 + Tailwind + .tsx + 인증 가드 + Sentry 전제**로 시작

이 보고서에 동의·우선순위 조정 주시면 그 순서대로 작업 들어가겠습니다.
