# 슝(Shoong) 알림톡 발송 자동화 — 핸드오프

> 작성일: 2026-04-30
> 마지막 수정: 2026-04-30
> 상태: **단일/대량 발송 동작 OK, 예약 발송 미해결** (슝이 우리가 보내는 필드명을 인식 못함)

---

## 0. 한 줄 요약

n잡연구소가 운영하는 슝(`api.shoong.kr`) 알림톡 API를 호출해서, **무료강의(FreeCourse) 신청자에게 "강의 시작" 알림톡을 일괄 발송**하는 기능. 단일 발송은 검증 완료, 대량 발송은 테스트 모드까지 완료, **예약 발송만 슝 측 필드명 문제로 미해결**.

---

## 1. 현재 상태 (2026-04-30 18:30 기준)

### ✅ 완료된 것
- **단일 발송 도구** (`/api/tools/shoong-send`): 폼 입력 → 슝으로 직접 발송 (테스트 용도)
- **defaults 엔드포인트** (`/api/tools/shoong-send/defaults`): `.env`의 SHOONG_API_KEY/SHOONG_SENDER_KEY를 폼에 자동 채움
- **대량 발송**: `FreeCourse.title` 키워드 검색 → 체크박스로 강의 선택 → 신청자 자동 추출 → 일괄 발송
- **🧪 테스트 모드**: 모든 발송을 내 번호로만 1~5건 (수만명 대참사 방지)
- **2단계 컨펌**: 실전 모드(테스트 OFF)는 수신자 수 확인 + "발송" 정확히 타이핑 요구
- **변수별 placeholder/안내**: 링크명은 URL 양식 (라벨 X), 강사명/강사님 템플릿별 분기, 시청자수는 start(3)만
- **즉시/예약 토글 UI**: 자동 +5분 기본값, 빠른 프리셋(+10분/+30분/+1시간/내일 9시/내일 18시), 1분 미만 임박 시 경고

### ❌ 미해결 (가장 중요)
- **예약 발송이 즉시 발송으로 처리됨**. 슝 어드민에서 "발송유형" 컬럼에 **"즉시발송"**으로 기록됨.
  - **확인된 사실**: `reservedTime` 필드를 보내도 슝이 인식 못함 (Zod가 silently strip)
  - **삽질 기록**:
    - `sendType: 'as'` (예약 알림톡 관례) 시도 → 슝 enum에 'as' 없음 → BAD_REQUEST. 슝이 허용하는 sendType: `sms, lms, mms, at, ai, rcs, ntalk, ut, ui, uw, ul, uc, um, up, ua`
    - 현재 `sendType: 'at'` 유지 + 후보 필드명 4개 동시 전송 (`reservedTime`, `reservedAt`, `reserveTime`, `scheduledAt`)
  - **다음 액션**: 위 4개 중 하나 매칭되어 어드민에 "예약발송" 기록되는지 확인. 4개 다 안 되면 슝 API 문서에서 정확한 필드명 찾기.

---

## 2. 핵심 알게 된 사실 (절대 잊지 말 것)

### 2-1. 링크명 변수는 **URL이 들어가야 함** (라벨 텍스트 X)
- 처음에 "버튼 라벨 (예: 입장하기)"로 잘못 안내했다가 7101 요청 형식 오류 떨어짐
- 실제로는 **버튼 클릭 시 이동할 URL**이 들어가야 함 (예: `https://youtu.be/...`)
- placeholder/안내 문구에 `URL 양식 (https://...)` 명시함

### 2-2. 모든 입력값은 trim 필수
- `senderkey` 끝에 `\n` 하나 섞이면 슝이 "발송 권한 없음"으로 거절
- 어드민에 복붙할 때 줄바꿈 함께 들어가는 케이스가 빈번
- 서버 라우트에서 `body[k].trim()` 강제 + env 값도 `(process.env.X || '').trim()`

### 2-3. 슝 sendType enum (확인됨)
- 알림톡: `at`, `ai` (이미지)
- 친구톡: `ut`, `ui`, `uw`, `ul`, `uc`, `um`, `up`, `ua`
- 그 외: `sms`, `lms`, `mms`, `rcs`, `ntalk`
- **예약은 sendType이 아닌 별도 필드로 처리**한다는 추론 (확정 필요)

### 2-4. nlab DB 스키마 (이번 작업에서 검증됨)
- `FreeCourse(id, title)`: 무료강의 메타 (씨오 검색하면 100건 정도 떨어짐)
- `ApplyCourse(id, freeCourseId, userId)`: 무료강의 신청 — **298,447행** 보유
- `User(id, username, nickname, phone, email)`: 회원
- 신청자 추출 = `ApplyCourse.in('freeCourseId', courseIds) JOIN User`

### 2-5. 카카오 알림톡 + 채널톡 차이 (사용자 멘트)
- 채널톡: 4분일 때 10분으로 예약하면 10분에 나감
- **알림톡: 4분 30초일 때 6분에 예약 걸어도 6분에 나감** (1분 후 예약도 보통 잡힘)
- 따라서 프론트에서 "리드타임 < 10분 경고" 같은 건 과한 안전장치. 0분 이하(과거)/1분 미만 임박만 경고하면 충분

### 2-6. nlab DB는 lecture-dashboard 자체 Supabase와 별개 프로젝트
- 자체 DB: `aznxzcpcsraqsvkoozfc.supabase.co` — 대시보드용 (auth_sessions, payer_tab_mappings 등)
- nlab DB: `swsgppjaigbmxetrmygu.supabase.co` — 강의 운영 (User, Course, FreeCourse, ApplyCourse, TossCustomer 등)
- 슝 대량 발송은 **nlab DB**를 읽음. `getNlabSupabase()` 사용 (`lib/nlabSupabase.js`)

---

## 3. 아키텍처

```
[브라우저] components/Dashboard.js — currentTool === 'shoong'
  │
  ├─[단일 발송 섹션]
  │  ├ defaults 자동로드 (페이지 진입 시 1회)
  │  │  └→ GET /api/tools/shoong-send/defaults
  │  │       └→ 서버 .env에서 SHOONG_API_KEY/SHOONG_SENDER_KEY 읽어 폼에 채움
  │  │
  │  ├ 폼 입력 (템플릿 선택 → 변수 폼 동적 렌더)
  │  │  · 템플릿별 변수: TEMPLATE_VARS = { 'start(1)': [...강사명...], 'start(2)': [...강사님...], 'start(3)': [...시청자수...] }
  │  │  · 모든 템플릿이 #{링크명} 사용 (버튼 라벨 → 클릭 URL)
  │  │
  │  ├ [Vercel 서버 발송] → POST /api/tools/shoong-send
  │  │  └→ trim, 필수값 검증, 페이로드 구성, Authorization Bearer로 슝 호출, 응답 그대로 반환
  │  │
  │  ├ [브라우저 직접 발송] → fetch('https://api.shoong.kr/send') 직접
  │  │  · 사내 IP가 슝에 등록돼있을 때만 의미있음 (Vercel IP는 미등록일 가능성)
  │  │
  │  └ [curl 복사] → Windows cmd 호환 단일라인 (개행 없이 -d "...")
  │
  └─[대량 발송 섹션 — 실전]
     │
     ├ 1. 검색 → GET /api/tools/shoong-bulk/courses?keyword=씨오
     │      └→ FreeCourse.ilike('title', %씨오%) limit 100
     │      └→ 각 코스마다 ApplyCourse count(exact, head:true)
     │      └→ 신청자 많은 순 정렬해서 [{id, title, applicantCount}] 반환
     │
     ├ 2. 체크박스 선택 (전체선택/전체해제 버튼 별도) + 변수 입력 + 즉시/예약 토글
     │
     ├ 3a. 미리보기 → POST /api/tools/shoong-bulk/send (dryRun: true)
     │       └→ 신청자 fetch → 정규화/dedup → 발송 안 하고 카운트만 반환
     │
     └ 3b. 실제 발송 → POST /api/tools/shoong-bulk/send (dryRun 없음)
             └→ ApplyCourse.in('freeCourseId', courseIds) JOIN User (페이지네이션)
             └→ 전화번호 정규화 (010 시작 11자리만), Set으로 dedup
             └→ 테스트모드: testPhone으로 모두 덮어쓰고 첫 testLimit건만
             └→ 동시성 5로 슝 API 호출 (sendType: 'at', 변수에 고객명=User.username/nickname 자동 주입)
             └→ {sent, failed, errors[샘플20], skipped, testMode} 반환
```

---

## 4. 파일 인덱스

### 신규 추가 (이번 작업)
- [`app/api/tools/shoong-send/route.js`](../app/api/tools/shoong-send/route.js) — 단일 발송 프록시 (이전 작업에서 만듦, 이번에 trim/예약필드 후보 추가)
- [`app/api/tools/shoong-send/defaults/route.js`](../app/api/tools/shoong-send/defaults/route.js) — env 값 폼 자동채움
- [`app/api/tools/shoong-bulk/courses/route.js`](../app/api/tools/shoong-bulk/courses/route.js) — FreeCourse 검색 + 신청자 카운트
- [`app/api/tools/shoong-bulk/send/route.js`](../app/api/tools/shoong-bulk/send/route.js) — 대량 발송 (테스트모드 지원)
- [`components/Dashboard.js`](../components/Dashboard.js) — UI (line ~4940 부터 슝 섹션, ~5430부터 대량 발송 서브섹션)

### 환경 변수 (Vercel + .env.local)
```
SHOONG_API_KEY=ak_xxxxxxxxxxxx
SHOONG_SENDER_KEY=047b27bbbae51190fadfe9932fe5ce424e86ec83
NLAB_SUPABASE_URL=https://swsgppjaigbmxetrmygu.supabase.co
NLAB_SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```
- 모두 **trim 필수** (라우트 코드에서 강제하지만 입력 시점에 줄바꿈 안 들어가게 주의)
- Vercel에 추가 후 **재배포 필요** (env 변경 후 자동 트리거 안 되는 경우 수동 redeploy)

---

## 5. 이번 작업의 주요 커밋 (claude/analyze-code-5CEiu 브랜치)

```
e39e291  슝 예약: 필드명 후보 4개 동시 전송
b96d6ca  슝 예약 발송: sendType 'as' 시도 롤백, 'at' 유지
8a9cf1f  슝 예약 발송: sendType 'at'→'as' 전환 + KST yyyyMMddHHmmss (실패한 시도)
6b98b67  슝 대량 발송 예약: 자동 +10분 기본값 + 빠른 프리셋 + 리드타임 검증
814f411  슝 대량 발송: 전체 선택/해제 버튼 별도 분리
199f58a  슝 알림톡 대량 발송: FreeCourse 검색 + 신청자 자동 추출 + 테스트 모드
103a9f7  슝 결과 패널: sentPayload 디버그 표시 추가
3aaa045  슝 발송: 모든 입력값 trim — senderkey 끝 개행으로 권한 거절되던 버그 수정
5567c6b  슝 알림톡: 템플릿별 변수 분기 + 예약발송 + env 자동로드
5acd95d  슝(Shoong) 알림톡 발송 테스트 도구 추가
```

PR: https://github.com/hatecas/lecture-dashboard/pull/new/claude/analyze-code-5CEiu

---

## 6. 테스트 워크플로 (집에서 이어할 때)

### 6-1. 로컬 개발
```bash
cd lecture-dashboard
git fetch origin
git checkout claude/analyze-code-5CEiu
git pull
npm install  # 새 의존성 없지만 안전
npm run dev
```
브라우저에서 `http://localhost:3000` → 로그인 → 좌측 사이드바 "💌 슝 알림톡 발송 (테스트)" 클릭

### 6-2. 단일 발송 테스트
1. 폼에서 SHOONG_API_KEY/senderkey 자동로드 뱃지 확인 (✅ env 자동로드)
2. 본인 번호 입력, 템플릿 `start(2)` 선택
3. 변수 채우기:
   - 고객명: 본인 이름
   - 유튜브링크: `https://youtu.be/xxx` (URL이어야 함)
   - 강좌명: 아무 텍스트
   - 강사님: 아무 텍스트
   - **링크명: URL** (예: `https://youtu.be/xxx`) ← 라벨이 아님, URL!
4. "🖥️ Vercel 서버로 발송" 클릭 → 본인 폰에 알림톡 도착 확인

### 6-3. 대량 발송 테스트 (반드시 테스트 모드 ON)
1. 대량 발송 섹션의 "🧪 테스트 모드 ON" 체크박스 확인 (기본 ON)
2. 내 번호 입력 (01012345678)
3. 검색창에 "지누" 입력 → Enter
4. 검색 결과에서 "[지누]나만의 제품으로 경쟁없이 월 천만원 번 노하우 - 테스트" 같은 본인 테스트용 강의 선택
5. 변수 입력 (단일 발송과 동일)
6. "🚀 즉시 실전 발송" 옆에 "🧪 테스트 발송 (내 번호 1건)" 버튼 클릭
7. 본인 폰에 알림톡 도착 확인 (선택한 강의 신청자 수와 무관하게 1건만)

### 6-4. 예약 발송 테스트 (미해결 이슈 검증용) ⭐ 다음 우선순위
1. 위와 동일하게 진행하되 "예약" 토글 → 5~10분 후로 시간 설정
2. 발송 후 슝 어드민(`https://app.shoong.kr/...`) 발송 내역 확인
3. **"발송유형" 컬럼이 "예약발송"으로 뜨는지** vs "즉시발송"으로 뜨는지가 핵심
   - "예약발송" → 후보 4개 중 하나 매칭. 어느 건지 확인하려면 다른 3개 빼면서 이진 탐색
   - "즉시발송" → 4개 다 틀림. 슝 docs에서 다른 필드명 찾기 (`requestDate`, `sendAt`, `runAt` 등)

---

## 7. 다음 우선순위 (집에서 할 일)

### 7-1. 🥇 예약 발송 미해결 이슈 (BLOCKING)
- 위 6-4 테스트 결과에 따라:
  - **케이스 A — 예약발송으로 기록됨**: 4개 키 중 정답 식별
    1. `app/api/tools/shoong-send/route.js` 와 `app/api/tools/shoong-bulk/send/route.js` 에서 후보 4개 중 2개씩 빼면서 테스트
    2. 정답 키 하나만 남기고 나머지 제거 + 주석으로 "확인됨" 기록
  - **케이스 B — 4개 다 무시됨**: 슝 API 문서 찾아서 정답 키 입수
    1. 슝 어드민 메뉴에서 "개발자 가이드" / "API 문서" / "Reference" 링크 찾기
    2. "예약" / "reserve" / "scheduled" 검색
    3. 정확한 키 + 시간 포맷 (ISO 8601? KST `yyyyMMddHHmmss`? Unix epoch?) 확인

### 7-2. 슝 docs 위치 메모
슝 어드민 사이트(`app.shoong.kr`)에 로그인해서 사이드바/우측 상단 메뉴 확인. "개발자 도구"에서 senderKey/API 키 발급한 그 페이지 근처에 보통 API 레퍼런스 링크 있음. 없으면 슝 고객지원에 직접 문의:
> 안녕하세요. POST /send 엔드포인트로 알림톡 예약 발송을 하려고 하는데, payload에 어떤 필드명/포맷으로 예약 시간을 전달해야 하는지 알려주시면 감사하겠습니다.

### 7-3. 🥈 자동화 다음 단계 (예약발송 해결 후)
- 강사 드롭다운 선택 시 그 강사의 무료강의 자동 검색 (현재는 keyword 자유입력)
- "이번 주 시작하는 강의" 같은 시간 기반 자동 매칭
- 강사가 보낼 메시지 템플릿 사전 등록해두고 1클릭 발송

---

## 8. 디버깅 팁

### "404 / 401 / 7101" 같은 에러 진단
- **HTTP 401** (`auth.error`): localStorage의 `authToken` 만료. 로그아웃 후 재로그인.
- **HTTP 401 from slug**: `SHOONG_API_KEY` env 없거나 trim 필요. defaults 엔드포인트 응답 확인.
- **HTTP 400 BAD_REQUEST + Validation failed**: 슝 Zod validator에 걸림. 어떤 필드가 enum 위반인지 응답의 `errors[].path` 확인.
- **응답 OK인데 알림톡 안 옴**: 슝 어드민 발송 내역에서 처리상태 확인.
  - `진행중` → 카카오 게이트웨이로 전달 후 대기. 잠시 후 도착하거나 실패 처리.
  - `처리완료` → 카카오에서 수신자에게 발송 시도까지 완료. 안 오면 수신자 차단/번호 오류.
- **7101 요청 형식 오류**: 변수 누락 (특히 `#{링크명}`은 URL이어야 함) 또는 템플릿 자체 문제.
- **7320 알림톡 수신 차단**: 수신자가 카카오에서 N잡연구소 채널 차단. 수신자 본인이 풀어야 함.

### sentPayload 디버그
단일 발송 결과 패널에 "🔍 실제 슝에 전송된 페이로드 (디버그)" 펼쳐서 우리가 보낸 정확한 JSON 확인 가능. 변수 누락/오타 체크 빠름.

### 빌드 안 될 때
```bash
npx next build
```
JSX 문법 에러는 여기서 잡힘. 이번 작업에서 IIFE `(() => {...})()` JSX 안에 많이 써서 구문 오류 위험.

---

## 9. 보안/안전 메모

- **테스트 모드 기본 ON**: 실수로 수만명에게 가는 사고 방지. OFF로 끄려면 명시적 의지 필요.
- **2단계 컨펌**: 실전 발송 시 `confirm()` + `prompt("발송"이라 정확히 입력)` 두 단계.
- **service_role 키는 서버 전용**: `lib/nlabSupabase.js`는 절대 클라이언트 import 금지. nlab DB는 RLS 없는 프로덕션 DB라서 클라이언트 노출 시 전체 사용자 정보 유출.
- **API 키는 .env.local + Vercel env**: 코드에 하드코딩 절대 금지. defaults 엔드포인트도 verifyApiAuth 통과해야만 응답함 (인증된 어드민만 env 값 조회).
