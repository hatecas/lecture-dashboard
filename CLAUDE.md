# lecture-dashboard — 프로젝트 마스터 문서

> 이 파일은 새 Claude 세션이 이 저장소를 처음 봤을 때 **전체 맥락을 빠르게 잡기 위한 단일 진입점**입니다.
> 갱신: 2026-05-01 / 작업 브랜치: `claude/distracted-saha-9a699e`
>
> **세부 핸드오프 문서는 `docs/` 폴더 참조**:
> - [order-sync-automation.md](docs/order-sync-automation.md) — 주문 동기화(nlab DB → 결제자 시트)
> - [shoong-alimtok-automation.md](docs/shoong-alimtok-automation.md) — 슝 알림톡 발송
> - [planning-ai-features.md](docs/planning-ai-features.md) — 9개 AI 기능 사전 기획
> - [site-cleanup-audit.md](docs/site-cleanup-audit.md) — 사이트 정리 감사 보고서

---

## 0. 한 페이지 요약

**무엇**: n잡연구소(온라인 강의 회사)의 강의 운영 통합 대시보드.

**누가 씀**: 사내 PM·운영팀. 슈퍼어드민 1명(`jinwoo`) + 일반 관리자들.

**핵심 기능**:
1. 강사·기수별 매출/광고/카톡방/결제 지표 한눈에 보기
2. 결제자 데이터 자동 동기화 (Toss → 시트)
3. 카카오톡방 입장자 ↔ 결제자 매칭
4. 슝(Shoong) 알림톡 단일/대량/CSV 발송
5. 채널톡 CS AI 자동/추천 답변
6. 무료강의 영상 AI 분석 (Gemini)
7. CRM/유튜브 채팅/유입경로 매칭 등 부가 툴

**스택**: Next.js 16 (Turbopack), React 19, Tailwind 4, Supabase (자체 DB + nlab 운영 DB), Google Sheets API, Anthropic Claude, Google Gemini 2.0 Flash, 채널톡 OpenAPI, 슝 API.

**호스팅**: Vercel (단일 — 별도 백엔드 서버 없음, Python 백엔드 2026-05 제거됨).

---

## 1. 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (components/Dashboard.js — 9516줄 단일 모놀리식)        │
└─────────────────────────────────────────────────────────────┘
              │ Authorization: Bearer {token}
              ▼
┌─────────────────────────────────────────────────────────────┐
│ Vercel Next.js (App Router)                                  │
│ • app/page.js — 세션/인증 셸                                  │
│ • app/api/** — 백엔드 라우트 21개                             │
│ • lib/apiAuth.js — 토큰 검증                                  │
└─────────────────────────────────────────────────────────────┘
       │              │             │           │            │
       ▼              ▼             ▼           ▼            ▼
   자체 Supabase   nlab Supabase  Google      외부 API   서비스 계정
   (대시보드 DB)   (운영 DB)      Sheets      (슝/채널톡   (Gmail/Sheets)
                                              /Anthropic
                                              /Gemini)
```

### 두 개의 Supabase 프로젝트 (절대 헷갈리지 말 것)

| 구분 | URL | 역할 | 사용 키 |
|---|---|---|---|
| **자체 대시보드 DB** | `aznxzcpcsraqsvkoozfc.supabase.co` | 인증·메모·캐시·권한·CS 정책 | anon + service_role |
| **nlab 운영 DB** | `swsgppjaigbmxetrmygu.supabase.co` | 회원·강의·결제(`TossCustomer`)·신청(`ApplyCourse`) | service_role only |

`lib/supabase.js` = 자체, `lib/nlabSupabase.js` = nlab. **nlab은 서버 라우트에서만 import. 클라이언트 코드(components/, 'use client') 절대 import 금지** — RLS 우회 키라 노출 시 회원 정보 전체 유출.

---

## 2. 디렉토리/파일 맵

```
lecture-dashboard/
├── app/
│   ├── api/                          ★ 백엔드 라우트 21개
│   │   ├── analyze/                  AI 종합 분석 (Anthropic, 첨부파일 기반)
│   │   ├── channel-conversations/    채널톡 대화 조회
│   │   ├── channel-webhook/          채널톡 → 우리 webhook (CHANNEL_WEBHOOK_TOKEN 검증)
│   │   ├── cs-ai/                    CS AI 답변 (Anthropic + RAG)
│   │   ├── cs-history/               CS 상담 이력 CRUD
│   │   ├── cs-policies/              CS 정책 CRUD
│   │   ├── files/                    파일 업로드 (Supabase Storage)
│   │   ├── lecture-analyze-gemini/   ★ 강의 영상 분석 (Gemini, SSE 스트리밍)
│   │   ├── lecture-history/          분석 이력
│   │   ├── login-log/                로그인 로그 (verifyApiAuth 강제)
│   │   ├── payer-sheets/             결제자 시트 탭 목록
│   │   ├── payer-tab-mappings/       탭 매핑 설정
│   │   ├── sales-analysis/           ★ 무료특강 후 시간별 구매 추이 (nlab DB 직접)
│   │   ├── saved-sheets/             저장된 시트 URL 관리
│   │   ├── sheet-config/             시트 컬럼 매핑 설정
│   │   ├── sheet-preview/            시트 미리보기
│   │   ├── sheets/                   강사별 매출 시트 데이터
│   │   ├── sheets-meta/              시트 메타데이터
│   │   ├── tools/
│   │   │   ├── order-sync/           ★ 주문 동기화 (nlab → 결제자 시트)
│   │   │   ├── shoong-bulk/courses/  슝 강의 검색
│   │   │   ├── shoong-bulk/send/     ★ 슝 대량 발송 (DB or 수동 명단)
│   │   │   ├── shoong-send/          슝 단건 발송
│   │   │   └── shoong-send/defaults/ env 값 자동 채움
│   │   ├── user-permissions/         권한 조회/저장 (verifyApiAuth + jinwoo)
│   │   └── youtube-info/             YouTube 메타 fetch
│   ├── globals.css                   디자인 토큰 + 전역 스타일
│   ├── layout.tsx                    HTML 루트
│   └── page.js                       세션·로그인 셸
├── components/
│   ├── Dashboard.js                  ★ 9516줄 모놀리식 — 모든 탭 UI
│   ├── HelpTooltip.js                도움말 툴팁
│   └── Login.js                      로그인 카드
├── lib/
│   ├── apiAuth.js                    토큰 검증 (auth_sessions 테이블)
│   ├── auth.js                       세션 생성/연장/삭제
│   ├── googleAuth.js                 서비스 계정 토큰 생성
│   ├── nlabSupabase.js               nlab DB 클라이언트 (서버 전용)
│   └── supabase.js                   자체 DB 클라이언트
├── supabase/                         자체 DB 마이그레이션 SQL
│   ├── create_lecture_analysis_cache.sql
│   ├── create_lecture_analysis_history.sql
│   ├── create_payer_tab_mappings.sql
│   └── create_user_permissions.sql
├── docs/                             ★ 핸드오프 문서들
│   ├── order-sync-automation.md
│   ├── shoong-alimtok-automation.md
│   ├── planning-ai-features.md
│   └── site-cleanup-audit.md
├── public/                           정적 자원
├── .env.example                      ★ 환경변수 템플릿
├── CLAUDE.md                         이 파일
├── README.md                         (Next.js 기본 README — 거의 안 봄)
└── package.json
```

---

## 3. 사이드바 메뉴 / 기능 요약

각 메뉴별로 어떤 라우트와 어떤 기능을 쓰는지 요약. UI는 모두 `components/Dashboard.js` 한 파일에 있음.

### 메인
| 메뉴 | 핵심 기능 | 데이터 출처 |
|---|---|---|
| **대시보드** | 강사+기수 선택 → KPI 카드 (매출, 영업이익, ROAS, 카톡방, 결제건수 등) + 차트 | `/api/sheets` (Google Sheets) + `/api/sales-analysis` (nlab DB) |
| **상세 정보** | 강사 메모, 첨부파일/링크, AI 종합 분석 | `memos`/`youtube_links` 테이블, `/api/files`, `/api/analyze` (Anthropic) |
| **랭킹** | 모든 강사를 지표별 정렬 | `/api/sheets` 전체 데이터 |
| **대조** | 두 강사·기수 좌우 비교 | 동일 |

### 업무 도구 (`툴` 메뉴 안의 서브툴)
| 서브툴 | 기능 |
|---|---|
| **CRM 정리** | CSV 업로드 → 정규화 |
| **카톡 매칭** | 카톡방 입장자 명단 + 결제자 시트 매칭 → 시트에 자동 입력 |
| **유튜브 채팅** | 라이브 채팅 폴링 수집 |
| **유입경로** | 광고 매칭 |
| **슝 알림톡 발송** | 3섹션: 🧪 테스트 / 📢 실전(DB 검색) / 📁 수동 업로드(CSV) |
| **주문 동기화** | nlab `TossCustomer` → 결제자 시트 자동 append |

### 관리자 / 자료
| 메뉴 | 기능 |
|---|---|
| **시트 통합** | 등록한 Google Sheets들 임베드/API 뷰 전환 |
| **CS AI** | 채널톡 문의 → Claude + RAG(`cs_policies` + `cs_history`) → 답변 |
| **무료강의 분석기** | YouTube URL → Gemini → 마크다운 분석 리포트, 이력 저장 |
| **시트 설정** | 강사 매출 시트의 컬럼 인덱스 매핑 (DB `sheet_column_config`) |
| **결제자 데이터** | 결제자 시트 직접 조회/검색 |
| **권한 설정** (jinwoo 전용) | 일반 관리자별 메뉴 표시 권한 토글 |

---

## 4. 환경변수

전체 목록은 [`.env.example`](.env.example) 참조. 요약:

### 필수
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — 자체 DB
- `NLAB_SUPABASE_URL`, `NLAB_SUPABASE_SERVICE_ROLE_KEY` — nlab 운영 DB
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — Sheets API
- `ANTHROPIC_API_KEY` — Claude
- `GEMINI_API_KEY` — 강의 분석기 (2026-05 신규)
- `SHOONG_API_KEY`, `SHOONG_SENDER_KEY` — 알림톡
- `CHANNEL_ACCESS_KEY`, `CHANNEL_ACCESS_SECRET`, `CHANNEL_WEBHOOK_TOKEN` — 채널톡

### 선택
- `GEMINI_MODEL` — 기본 `gemini-2.0-flash`
- `CHANNEL_AUTO_REPLY` — `true`면 자동 답변, 그 외엔 추천 모드

### 제거됨 (2026-05)
- ~~`PYTHON_BACKEND_URL`~~, ~~`NEXT_PUBLIC_PYTHON_BACKEND_URL`~~ — Python 백엔드 제거

⚠️ Vercel 환경변수 변경 후엔 **수동 Redeploy 필요**.

---

## 5. 핵심 도메인 지식 (절대 잊지 말 것)

### 5-1. nlab DB 스키마 — 진짜 결제 테이블은 `TossCustomer`

처음에 이름만 보고 `DirectPayment`로 가정했다가 **3개 테이블 모두 0행**이라 헛다리. 행수 기준으로 다시 봤더니:

| 테이블 | 행수 (2026-04 기준) | 정체 |
|---|---|---|
| `ApplyCourse` | 298,447 | 무료강의 신청 (결제 정보 없음) |
| `User` | 180,964 | 회원 |
| `UserProgress` | 78,733 | 진행률 |
| **`TossCustomer`** | **9,485** | ★ **진짜 유료 결제 테이블** |
| `Enrollment` | 18,887 | 수강 등록(무료+유료, 결제 정보 없음) |
| `Course` | 601 | 유료 강의 |
| `Teacher` | 16 | 메인 노출용 강사(실제 강사 수보다 훨씬 적음 — 사용 X) |

**`TossCustomer` 핵심 컬럼**:
- `productTitle` (★ 강사명 추출 원천), `productType` (`COURSE`/`EBOOK`)
- `originalPrice`/`discountPrice`/`finalPrice`
- `paymentStatus` (`COMPLETED`/`CANCELED`/...)
- `cancelAmount`/`canceledAt` (환불 신호)
- `userId` → User 조인
- `createdAt`/`updatedAt`

### 5-2. 강사명은 `productTitle` 첫 `[...]` 안에 있다

`Teacher` 테이블 16명만 마케팅용 등록 → 실제 강사 다 못 잡음. **`productTitle` 정규식 파싱이 정답.**

```js
// app/api/tools/order-sync/route.js, app/api/sales-analysis/route.js
function extractInstructorName(title) {
  if (!title) return null
  const m = String(title).match(/^\s*\[([^\]]+)\]/)        // 첫 [...] 추출
  if (!m) return null
  let name = m[1]
  name = name.replace(/N\s*잡\s*연구소\s*[xX×]?/gi, '')   // 1) N잡연구소 + 연결자 제거
  name = name.replace(/[xX×]\s*N\s*잡\s*연구소/gi, '')
  name = name.replace(/\s*[xX×].*$/, '')                  // 2) 첫 x 이후 모두 제거 (콜라보)
  name = name.replace(/\s*\d+\s*기\s*$/, '')              // 3) 끝의 "N기" 제거
  name = name.replace(/^[\s\-:·,]+|[\s\-:·,]+$/g, '').trim()
  return name || null
}
```

지원 패턴 예시: `[N잡연구소X홍시삼분]2기 ...`, `[김탄생] ...`, `[현우 2기] ...`, `[N잡연구소X에어3기] ...`, `[온비전x머니탱크] ...`.

### 5-3. PostgREST 1000행 한계

Supabase JS 클라이언트는 PostgREST 호출 시 기본 응답 한계 1000행. 강사 목록에서 최근 강사 누락되면 이거 의심.

해결: `fetchAllPaginated` 헬퍼로 1000개씩 `range(offset, offset+999)` 반복.

### 5-4. 환불 판정은 OR로

`paymentStatus = 'COMPLETED'`인데도 `cancelAmount > 0` 또는 `canceledAt`이 채워진 부분환불 케이스 있음.

```js
const refundedFlag =
  (row.cancelAmount && row.cancelAmount > 0) ||
  row.canceledAt ||
  /CANCEL|REFUND|FAIL|ABORT/i.test(row.paymentStatus || '')
```

### 5-5. KST 타임존 명시

Vercel은 UTC. 무료특강 시간 윈도우 같은 KST 기준 로직은 **명시적 오프셋** 필수:

```js
const cutoffStart = new Date(`${freeClassDate}T19:30:00+09:00`)
const cutoffEnd   = new Date(cutoffStart.getTime() + 5 * 60 * 60 * 1000)
```

### 5-6. 슝 알림톡 함정 5가지

1. **`sendType` enum**: 알림톡=`at`, 친구톡=`ut/ui/...` — `as` 같은 건 없음. 예약은 별도 `reservedTime` 필드.
2. **모든 입력값 trim 필수**: senderkey 끝 `\n` 한 줄로 "발송 권한 없음" 거절. env에서도 `(process.env.X || '').trim()`.
3. **`#{링크명}` 변수는 URL이 들어가야 함** (버튼 라벨 X). 라벨 텍스트 넣으면 7101 요청형식오류.
4. **테스트 모드 기본 ON**: 대량 발송에서 실수로 수만명에게 가는 사고 방지. 모든 발송이 `testPhone`으로 덮어쓰여 1~5건만.
5. **2단계 컨펌**: 실전 모드(테스트 OFF)는 `confirm()` + `prompt("발송"이라 정확히 입력)` 두 단계 강제.

### 5-7. 슝 IP 정책 (현재 상태)

발송은 모두 Vercel 서버 → 슝 API. 사용자 PC 위치(회사/집/모바일) 무관. 회사·집 둘 다 잘 작동 → **현재 슝이 IP 화이트리스트 안 걸어둔 상태**. 미래에 IP 제한 도입 시 Vercel IP 등록 또는 Static IP egress 옵션 검토 필요.

### 5-8. 결제자 시트 구조

매년 1개 시트, 강사·기수별 탭 다수. `PAYER_SHEETS`:
- `25`: `1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg`
- `26`: `1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA`

탭 이름 패턴: `날짜코드(6자리)_강사명기수`. 예: `260428_김탄생`, `260427_현우2기`.

각 탭 헤더 + 자동 처리:

| 컬럼 | 헤더 | 자동 처리 |
|---|---|---|
| A | No | `=Row()-1` |
| B | 이름 | User.username |
| C | 전화번호 | `010-xxxx-xxxx` 포맷 |
| D | 이메일 | User.email |
| E | 결제금액 | TossCustomer.finalPrice |
| F | 결제 방법 | `'카드'` 고정 |
| G | 결제 구분 | `'결제완료'` / `'환불/취소'` |
| H | 최종 결제 금액 | `=IF(G{n}="결제완료", E{n}, IF(G{n}="전체환불", 0))` |

### 5-9. 매출 시트 컬럼 (`sheet_column_config`)

기본 매핑은 [`app/api/sheets/route.js`](app/api/sheets/route.js)의 `DEFAULT_CONFIG` 참조. 활성 매핑은 자체 DB의 `sheet_column_config` 테이블 1행에 jsonb로 저장됨. UI에서 변경 가능: 사이드바 → "시트 설정".

⚠️ **2026-05-01 기준 매출(revenue) 컬럼**: 기본값 K열(`columnIndex: 10`). 시트가 바뀌어 I열은 카드매출액, K열이 최종매출액. **DB에 저장된 활성 설정이 아직 8(I열)이면 사이드바 시트 설정 UI에서 8 → 10으로 수정 필요**.

### 5-10. 인증 우회(IDOR) 방지

쿼리스트링/바디의 `loginId`·`requestLoginId` **신뢰 금지**. 항상 `verifyApiAuth(request)`로 토큰의 user.username을 사용. 2026-05 보안 수정 커밋 참조 (`635c92a`).

```js
// 옳은 패턴
const auth = await verifyApiAuth(request)
if (!auth.authenticated) return 401
const username = auth.user.username
if (username !== 'jinwoo') return 403
```

---

## 6. 최근 작업 (이 브랜치 `claude/distracted-saha-9a699e`)

```
fa3a057  정리: Python 백엔드 제거(Gemini 직접 호출) + design-preview 삭제 + .env.example
635c92a  보안 수정: user-permissions / login-log 인증 우회 차단
91fcd3c  슝 알림톡: 사이드바 라벨 정리 + UI 3섹션 구조 + CSV 수동 업로드
6134e62  fix(sheets): 매출(revenue) 소스를 I열(카드매출액) → K열(최종매출액)
994a50d  사이드바: 구매 추이 시트 제거 + 로고 클릭으로 대시보드 이동
54b3a91  fix(timeline): 다른 강사로 갔다 돌아왔을 때 차트 갱신 안 되던 문제
1432e7c  refactor: 구매 추이 분석을 시트 우회하고 nlab DB 직접 조회로
487e5d1  fix(login): 로딩 스피너가 회전 대신 흔들리던 문제
be9ad92  UI 리프레시: 사이드바·로그인·상단바 + 디자인 토큰
```

### 주요 변경 사항 요약

**A. UI 리프레시 (be9ad92)**
- `globals.css`에 디자인 토큰 도입(CSS 변수): `--bg`, `--surface`, `--accent-grad`, 라운드/섀도우 스케일
- 배경: 어두운 navy 그라데이션 → 거의 검은 단색 + 인디고/바이올렛 오로라 + 도트 텍스처
- `Login.js`: lucide `LayoutDashboard` 로고 배지 + 아이콘 prefix 입력 + AlertCircle 에러 박스 + 떠다니는 오로라
- `Dashboard.js` 사이드바: 인라인 스타일 30줄×10번 반복 → `SidebarItem` 헬퍼 1줄 호출. 이모지 → lucide(`LineChart, FileText, Trophy, Scale, Wrench, FolderOpen, Bot, GraduationCap, Settings, CreditCard, ShieldCheck`). 메뉴 그룹화(메인/업무 도구/관리자) + 섹션 라벨.
- 활성 상태: 두꺼운 borderLeft → 부드러운 그라데이션 배경 + 작은 좌측 액센트 바
- 상단바: 아바타 이니셜 핍 + 윤곽선 로그아웃 (호버 시 빨간 톤다운)

**B. 구매 추이 시트→nlab DB 직접 (1432e7c, 54b3a91, 994a50d)**
- 기존: 매출표 시트 강사 탭 CSV 파싱 → `purchase_timeline` 캐시 테이블 → 대시보드 읽기
- 지금: `app/api/sales-analysis` 가 nlab `TossCustomer` 직접 조회. 시트와 캐시 테이블 모두 우회
- KST 19:30 ~ 다음날 00:30 윈도우, `extractInstructorName` 정확 매칭, 환불 OR 처리, 5분×36구간
- 사이드바 "구매 추이 시트" 외부 링크 제거 (불필요)
- `purchaseTimelineCacheRef` Map으로 sessionId별 캐싱 (강사 전환 시 차트 갱신 race 방지)
- 사이드바 로고 클릭 → 대시보드 탭으로

**C. 매출 컬럼 K열로 (6134e62)**
- I열(카드매출액) → K열(최종매출액)
- `app/api/sheets/route.js` `DEFAULT_CONFIG` + `components/Dashboard.js` 클라이언트 기본값 동시 변경
- DB의 활성 설정도 동기화 필요 (시트 설정 UI에서)

**D. 슝 UI 3섹션 (91fcd3c)**
- 사이드바 "(테스트)" 라벨 제거
- **🧪 테스트 발송**: 본인 번호로 즉시 1건. sendType/senderkey/API키 입력창 모두 제거 (env 자동). curl 복사·브라우저 직접발송 버튼 제거. 단일 [🚀 발송] 버튼.
- **📢 실전 발송**: DB 검색 → 신청자 일괄. 변동 없음 (펼침 래핑만)
- **📁 수동 업로드**: 신규. CSV/엑셀 업로드 → 이름·전화번호 컬럼 자동 감지(헤더 부분 일치) → 미리보기 → 발송. EUC-KR(codepage 949) 한글 CSV 지원
- 백엔드 `shoong-bulk/send`: `recipients: [{ name, phone }]` 모드 추가 (courseIds와 배타적)
- 수동 업로드 섹션은 실전 발송과 템플릿/변수/예약/테스트모드 상태 공유

**E. 보안 수정 (635c92a)**
- `user-permissions`: GET/POST 모두 `verifyApiAuth` 강제. 토큰의 `user.username`만 신뢰. 쿼리스트링·바디의 `loginId`·`requestLoginId` 무시. `save-permissions`는 `username === 'jinwoo'`일 때만.
- `login-log`: `verifyApiAuth` 강제. 클라이언트의 name 필드 무시, 토큰의 user.name 사용. IP/UA는 서버 헤더에서만.
- `Login.js` / `Dashboard.js`: 두 라우트 호출에 `Authorization` 헤더 추가
- `channel-webhook`: 이미 `CHANNEL_WEBHOOK_TOKEN` 비교 코드 존재 (line 168-174) — 추가 수정 불요
- service_role 키: `nlabSupabase`/`SUPABASE_SERVICE_ROLE_KEY` 모두 서버 라우트에서만 import. 클라이언트 노출 없음 (검증 완료)

**F. Python 백엔드 제거 (fa3a057)**
- `backend/` 폴더 통째 삭제 (11개 파일: Dockerfile, Procfile, railway.toml, nixpacks.toml, runtime.txt, requirements.txt, packages.txt, HF_README.md, app.py, main.py)
- `app/api/lecture-analyze-gemini`를 Vercel serverless에서 `@google/genai` SDK로 직접 호출. SSE 스트리밍 형식 그대로 유지(프론트 변경 최소).
- HuggingFace Space 절전 이슈 영구 해결, 첫 시도 대기 0초.
- `Dashboard.js`: `NEXT_PUBLIC_PYTHON_BACKEND_URL` 분기 제거. 항상 우리 라우트 경유.
- `app/design-preview/` 디렉토리 제거 (어디서도 안 링크된 dead route)
- `.env.example` 신규 + `.gitignore`에 `!.env.example` 예외

**제거된 기능 (트레이드오프)**:
- YouTube 자막 추출 (`youtube-transcript-api`) — Gemini가 영상 URL 직접 분석으로 대체 (약간 비싸지만 기능 동일)
- yt-dlp 오디오 다운로드 폴백 — Vercel 환경 제약(바이너리 X, 300초 한도). 비공개/연령제한/지역제한 영상은 분석 불가 (전체 1~5%)
- Map-Reduce 긴 자막 분할 — Gemini의 영상 URL 모드는 자체 컨텍스트로 처리

---

## 7. 앞으로 할 일

### 7-1. AI 자동화 9개 기능 (별도 트랙 — `docs/planning-ai-features.md`)

운영팀·기획팀이 요청한 자동화. 강사·PM 미팅 녹음본/노션 정리/자료를 입력으로 받아 출력 생성.

**카테고리**:
1. 무료강의 당일 PPT 장표 + 멘트 (★★★★★)
2. 무료강의 단톡방 공지 자동화 (★★)
3. 미팅 녹음본 정리 봇 (★★)
4. 강의 PPT 기획안 초안 (★★★)
5. 알림톡/채널톡 멘트 자동화 (★★)
6. 바이럴 질문 멘트 작성 (★★)
7. 붐업 멘트 (다양한 스타일) (★)
8. 전자책 기획안 자동화 (★★★)
9. 무료 상페 초안 기획안 (★★★)

**1번 PPT 자동 생성을 제외한 8개는 공통 엔진 1개로 커버 가능**: 강사 컨텍스트(녹음본·메모·자료) + 레퍼런스 풀 + 프롬프트 → LLM → 형식화된 출력. 출력 형식만 다름.

**Phase 0 — 빠진 인프라 (~4일)**:
- `references` 테이블 + 어드민 업로드 UI (강사·카테고리별 모범 사례 라이브러리)
- `ai_prompts` 테이블 + 어드민 편집 UI (프롬프트 핫스왑)
- `<AiDraftEditor>` 공통 컴포넌트 (좌: 입력·컨텍스트, 중: AI 출력 편집, 우: 액션)
- 노션 API 통합 (`/api/integrations/notion/page`) — 첨부 링크 자동 텍스트화
- Gemini STT 어댑터 (`/api/integrations/transcribe`) — 음성 첨부 자동 텍스트화

**Phase 1 (~3~4일)**: 멘트류 4개 (3 → 7 → 6 → 5)
**Phase 2 (~4~5일)**: 기획 초안 3개 (4 → 9 → 8)
**Phase 3 (별도)**: PPT 자동 생성 (1번)

**비용 예측**: 강사 10명 × 월 2회 미팅 + 알림톡/붐업 일 5건 × 30일 + 기획 5건 → ~$10/월

### 7-2. 클린업 잔여 (`docs/site-cleanup-audit.md`)

✅ 완료:
- 보안 4건 처리 (user-permissions, login-log, channel-webhook 검증, service_role 검사)
- Python 백엔드 제거 (옵션 A)
- design-preview 제거
- `.env.example` 신규
- 사이드바 "(테스트)" 라벨 정리

🟢 남은 항목:
- **Sentry 도입** (1시간) — 프로덕션 에러 캡처. AI 9개 기능 출시 전 권장
- **`Dashboard.js` 점진 분리** (분기마다 1~2개 추출) — 9516줄 단일 파일. 신규 기능은 새 파일에 만들고 기존은 천천히 추출. AI 기획 Phase 0의 `<AiDraftEditor>`가 첫 분리 사례.
- **`sheet_column_config` DB 동기화** — 매출 컬럼 변경(I→K)을 시트 설정 UI에서 한 번 저장 필요 (코드 기본값과 일치시키기)
- **TypeScript 점진 마이그레이션** — 신규 파일만 `.tsx`. 강제 변환 X.
- **번들 크기 최적화** — `recharts`/`xlsx` 동적 import. 측정 후 결정.

### 7-3. 운영 모니터링 메모

- **슝 IP 정책 변경 감시**: 어느 날 갑자기 401/403/`IP_NOT_ALLOWED` 류 에러로 발송 실패 시작 → 슝 어드민 "허용 IP" 설정 확인 + Vercel IP 대역 등록 또는 Static IP egress 옵션 도입.
- **Gemini 분석 타임아웃**: 3시간 이상 영상은 Vercel Hobby 300초 한도 초과 가능. Pro 플랜 800초 또는 비동기 잡 패턴 검토.
- **nlab DB 행수 증가**: `ApplyCourse` 30만+ → 검색 인덱스 부하 모니터링 필요할 수 있음.

---

## 8. 작업 워크플로 (Claude 세션 기준)

### 8-1. 워크트리 위치

이 프로젝트는 git worktree로 관리됨. 본 체크아웃과 워크트리 경로가 다름:
- 본 체크아웃: `C:\Users\jinwo\Downloads\lecture-dashboard\`
- 워크트리: `C:\Users\jinwo\Downloads\lecture-dashboard\.claude\worktrees\<branch>\`

⚠️ **`git add` 같은 명령은 반드시 워크트리 디렉토리에서 실행.** 본 체크아웃에서 실행하면 변경사항이 안 잡힘 (이전 세션에서 실수했음).

### 8-2. 변경 적용 흐름

워크트리에서 작업 → 커밋 → 푸시 → 본 체크아웃에서 머지/풀 → 로컬 dev 서버에 자동 hot reload.

```bash
# 워크트리(현재 셸)
git add ...
git commit -m "..."
git push origin claude/<branch>

# 본 체크아웃 (사용자가 별도 셸에서)
cd C:\Users\jinwo\Downloads\lecture-dashboard
git fetch origin
git merge origin/claude/<branch>
# npm run dev는 hot reload되므로 그대로 동작
```

### 8-3. 빌드 검증

워크트리에서 `npx next build` 후 "✓ Compiled successfully" 확인. 이후 `Error: supabaseUrl is required.` 같은 런타임 에러는 워크트리에 `.env.local`이 없어서 그런 것이므로 무시 가능 (코드 정합성과 무관).

### 8-4. 사용자 선호 (기억해둘 것)

- **자동 모드 선호**: "ㄱ", "실행", "진행" 같은 짧은 응답 → 곧장 코드 수정·커밋·푸시 시작. 추가 확인 X.
- **설명은 항상 한국어**: 기술 용어도 가능한 한국어로 풀어 설명.
- **간결하게**: "1순위 보안에 해당하는거 말해도 잘 못알아들으니까 어떻게 대응할지만 말해" — 길게 설명하지 말고 행동·결과 중심.
- **DB SQL이 필요한 변경은 따로 알리기**: 코드만 수정하면 끝나는지, DB도 손봐야 하는지 명시.
- **이모지/리액트 컴포넌트 코드 안에서**: 메뉴/UI 라벨에 이모지 OK. 인라인 스타일 OK (기존 패턴).
- **Korean date/timezone**: KST 19:30 같은 시간 명시 시 항상 `+09:00` 오프셋 사용.

### 8-5. 커밋 메시지 스타일

- 제목: 한국어, 간결하게, 영역 prefix 가능 (예: `fix(timeline):`, `refactor:`, `보안 수정:`)
- 본문: 무엇을 + 왜 + 어떻게 검증했는지 설명. 한국어.
- 트레일러: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` 자동 포함 (도구가 처리).

---

## 9. 자주 보는 명령어

```bash
# 개발 서버
npm run dev

# 빌드 검증 (TypeScript + 컴파일)
npx next build

# 린트
npm run lint

# 의존성 추가
npm install <package>

# 워크트리 → 본 체크아웃으로 가져오기 (사용자가 별도 셸에서)
git fetch origin && git merge origin/claude/<branch>
```

---

## 10. 외부 서비스 어드민 / 문서 링크

- **Supabase 자체 DB**: https://supabase.com/dashboard/project/aznxzcpcsraqsvkoozfc
- **Supabase nlab DB**: https://supabase.com/dashboard/project/swsgppjaigbmxetrmygu
- **Vercel**: https://vercel.com/<팀이름>/lecture-dashboard
- **GitHub**: https://github.com/hatecas/lecture-dashboard
- **슝 어드민**: https://app.shoong.kr
- **채널톡 어드민**: https://desk.channel.io
- **Google Cloud Console (서비스 계정)**: https://console.cloud.google.com/iam-admin/serviceaccounts
- **Google AI Studio (Gemini API 키)**: https://aistudio.google.com/apikey
- **Anthropic Console**: https://console.anthropic.com
- **결제자 시트 (2025)**: https://docs.google.com/spreadsheets/d/1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg
- **결제자 시트 (2026)**: https://docs.google.com/spreadsheets/d/1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA
- **매출표 시트 (구버전, 강사 탭)**: https://docs.google.com/spreadsheets/d/1NciqOt6PaUggmroaov60UycBbkdIY6eVXSXfwLyvCRo
- **시간별 구매 추이 시트 (deprecated, nlab DB로 대체됨)**: 동일 시트의 다른 탭

---

## 11. 새 Claude 세션에 인계할 때 체크리스트

- [ ] 이 파일(CLAUDE.md) 읽기
- [ ] 작업 브랜치 확인: `git branch --show-current`
- [ ] 워크트리 위치 확인: 현재 작업 디렉토리가 `.claude/worktrees/<branch>/` 인지
- [ ] 미커밋 변경사항 확인: `git status`
- [ ] 최근 커밋 5~10개 훑기: `git log --oneline -10`
- [ ] 관련 핸드오프 문서 읽기 (`docs/` 안에서 작업 영역에 해당하는 것)
- [ ] 빌드 통과 확인: `npx next build` (선택)

이 흐름을 따르면 새 세션이 5분 이내에 컨텍스트를 잡고 작업을 이어받을 수 있어야 함.
