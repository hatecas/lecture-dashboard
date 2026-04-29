# 주문 동기화 자동화 (nlab DB 직접 연동) — 핸드오프 문서

> 다른 PC, 다른 Claude 세션에서 이 파일 하나만 봐도 전체 맥락이 잡히도록 작성된 문서.
> 작성: 2026-04-30 / 마지막 갱신은 git log 참조.

---

## 0. 한눈에

이 프로젝트(`lecture-dashboard`)의 **`주문 동기화` 도구**(🛠️ 업무 툴 → 📦 주문 동기화)는 두 가지 모드로 동작한다.

| 모드 | 입력 | 데이터 출처 | 비고 |
|---|---|---|---|
| **🤖 자동 (nlab DB)** | 강사 + 기간 선택 | nlab 운영 Supabase의 `TossCustomer` | 이 문서에서 다루는 새 모드 |
| 📁 수동 (CSV 업로드) | nlab 어드민에서 받은 CSV | 파일 | 기존 모드, 호환 유지 |

두 모드 모두 결국 같은 결제자 시트(2025/2026년 Google Sheet)에 **신규 결제자만** append하며, 다음을 자동 처리한다:
- 환불/취소 건 제외
- 시트에 이미 있는 전화번호는 중복으로 분류해 제외
- A열 자동번호, C열 전화번호 포맷, F열 결제방법 통일, H열 IF 공식 자동 주입
- 추가된 행의 셀 서식 강제 초기화 (Arial 11pt, 흰 배경, 검정, 볼드 X)

---

## 1. 왜 만들었나 — 작업 배경

### 기존 흐름 (이 작업 전까지)
1. PM이 [nlab.kr](https://nlab.kr) 어드민 사이트에 로그인
2. 강사별로 필터 걸고 "전체 주문 내역" CSV 다운로드
3. lecture-dashboard에 CSV 업로드
4. 미리보기 확인 → 시트에 append

### 사용자가 원한 것
"드롭다운에서 강사 고르고 버튼 누르면 nlab DB 직접 조회해서 자동으로 시트 업데이트". CSV 다운로드 단계를 없애는 것.

### 선택한 방향
nlab.kr이 **자체 Supabase 운영** 사실을 확인 → service_role 키로 nlab의 운영 Supabase에 직접 연결. CSV 단계 스킵.

> ⚠️ **lecture-dashboard 자체 Supabase**(`aznxzcpcsraqsvkoozfc.supabase.co`)와 **nlab 운영 DB Supabase**(`swsgppjaigbmxetrmygu.supabase.co`)는 **완전히 다른 프로젝트**다. 절대 헷갈리지 말 것.
> - 자체 DB = 대시보드 자체 데이터 (lecture_analysis_cache, payer_tab_mappings, user_permissions 등)
> - nlab DB = 강의 플랫폼 운영 데이터 (User, Course, TossCustomer 등)

---

## 2. nlab DB 스키마 — 핵심 발견

### 헷갈렸던 시행착오 (역순으로 발견)

처음엔 이름만 보고 `DirectPayment` (`결제자` 의미로 추정)를 주문 테이블로 가정했지만 **3개 테이블 모두 비어있음**:
- `DirectPayment` (0행)
- `DirectPaymentLog` (0행)
- `DirectPaymentReceipt` (0행) — 미사용/예비 테이블로 추정

행수 기준으로 다시 봐야 했다. `pg_stat_user_tables`로 실제 행수 조회:

| 테이블 | 행수 | 정체 |
|---|---|---|
| ApplyCourse | 298,447 | **무료강의 신청** (`freeCourseId`만 있고 결제 정보 없음) |
| User | 180,964 | 회원 |
| UserProgress | 78,733 | 강의 진행 진행률 |
| **TossCustomer** | **9,485** | **★ 진짜 유료 결제 테이블** |
| Enrollment | 18,887 | 수강 등록(무료+유료 합산, 결제 정보 없음) |
| Course | 601 | 유료 강의 |
| Teacher | 16 | 메인 노출용 강사 (실제 강사 수보다 훨씬 적음) |

### 결론: `TossCustomer`가 답
컬럼이 결정적이다.

```
TossCustomer
├ id, orderId, paymentKey, orderName
├ originalPrice, discountPrice, finalPrice  ← 결제금액
├ productType  ← 'COURSE' / 'EBOOK'
├ productId, productTitle, productOptionId, productOption(jsonb)
├ paymentStatus  ← 'COMPLETED' / 'CANCELED' / ...
├ cancelAmount, cancelReason, canceledAt  ← 환불 정보
├ userId  → User로 조인 (이름/전화/이메일)
├ courseId, ebookId
└ createdAt, updatedAt, ...
```

샘플 행:
```
productTitle: "[N잡연구소X홍시삼분]2기 누구나 따라하는 구매대행 노하우 - 온라인 클래스 + 챌린지"
productType: COURSE
finalPrice: 2500000
paymentStatus: COMPLETED
```

### 강사 정보의 실체
- `Teacher` 테이블은 **마케팅 페이지에 노출되는 강사 16명**만 등록 — 실제 판매되는 강사진은 훨씬 많다.
- 진짜 강사 정보는 **`productTitle` 첫 대괄호 안에 박혀있다**. 별도 컬럼/테이블 없음.
- 따라서 강사 목록을 만들려면 **productTitle을 정규식으로 파싱**해야 한다.

### productTitle 패턴 (실측 기반)

| 패턴 | 예시 | 추출 결과 |
|---|---|---|
| `[N잡연구소X<강사>]<기수> ...` | `[N잡연구소X홍시삼분]2기 ...` | `홍시삼분` |
| `[N잡연구소x<강사>]...` | `[N잡연구소x토리맘]...` | `토리맘` |
| `[<강사>xN잡연구소]...` | `[사뚜xN잡연구소]...` | `사뚜` |
| `[N잡연구소X<강사><기수>]...` | `[N잡연구소X에어3기]...` | `에어` |
| `[<강사> <기수>] ...` | `[현우 2기] ...` | `현우` |
| `[<강사>] ...` | `[김탄생] ...` | `김탄생` |
| **콜라보 마커**: `[<강사>x<콜라보>]...` | `[온비전x머니탱크]...`, `[잰수성가X]`, `[노바작가x]` | `온비전`, `잰수성가`, `노바작가` |

→ **첫 `x`(대소문자/`×`) 이후는 무조건 콜라보 마커로 보고 잘라낸다.**

### 정규식 알고리즘 (4단계, [route.js:extractInstructorName](../app/api/tools/order-sync/route.js))
```js
function extractInstructorName(title) {
  if (!title) return null
  const m = String(title).match(/^\s*\[([^\]]+)\]/)  // 첫 [...] 추출
  if (!m) return null
  let name = m[1]
  // 1) 'N잡연구소' 마커 + 연결자 제거 (앞/뒤 양쪽)
  name = name.replace(/N\s*잡\s*연구소\s*[xX×]?/gi, '')
  name = name.replace(/[xX×]\s*N\s*잡\s*연구소/gi, '')
  // 2) 첫 x(대소문자/×) 이후 모두 제거 (콜라보 마커)
  name = name.replace(/\s*[xX×].*$/, '')
  // 3) 끝의 "N기" 제거
  name = name.replace(/\s*\d+\s*기\s*$/, '')
  // 4) 양옆 공백/특수문자 정리
  name = name.replace(/^[\s\-:·,]+|[\s\-:·,]+$/g, '').trim()
  return name || null
}
```

---

## 3. 아키텍처

```
[브라우저] components/Dashboard.js
   │
   │ 1. 강사 드롭다운 채우기 (페이지 진입 / 기간 변경)
   ├──→ GET /api/tools/order-sync?from=YYYY-MM-DD&to=YYYY-MM-DD
   │       │
   │       ▼
   │   [서버] app/api/tools/order-sync/route.js (GET)
   │       │
   │       ├──→ nlab Supabase: TossCustomer 페이지네이션 fetch
   │       │       (productType=COURSE, paymentStatus=COMPLETED, 기간 필터)
   │       │
   │       ├──→ extractInstructorName()로 강사명 집계
   │       │
   │       └──← teachers: [{ name, orderCount, courseCount }, ...]
   │
   │ 2. 미리보기 (강사 + 시트 탭 선택 후 버튼 클릭)
   ├──→ POST /api/tools/order-sync (JSON: instructor, year, tabName, from, to)
   │       │
   │       ▼
   │   [서버] route.js (POST, isJson 분기)
   │       │
   │       ├──→ fetchOrdersFromNlab(instructor, dateRange)
   │       │      ├ TossCustomer.productTitle ILIKE %instructor%
   │       │      ├ User 조인 (이름/전화/이메일)
   │       │      ├ ILIKE 후 extractInstructorName 정확 매칭으로 더 거름
   │       │      └ 페이지네이션
   │       │
   │       ├──→ buildPreview(orders, year, tabName, ...)
   │       │      ├ 환불 키워드 분리
   │       │      ├ 시트 기존 전화번호로 dedup
   │       │      └ 시트 컬럼 구조에 맞춰 previewRows 생성
   │       │
   │       └──← stats + newOrders + previewRows + logs
   │
   │ 3. 실제 추가 (사용자 confirm 후)
   └──→ PUT /api/tools/order-sync (JSON: year, tabName, rows)
           │
           ▼
       [서버] route.js (PUT)
           ├ 1) 시트 헤더 + 현재 행수 조회 (행번호 자동 계산용)
           ├ 2) 행마다 공식/포맷 주입:
           │     · A열 = '=Row()-1'
           │     · phone 컬럼 → formatPhoneDisplay (010-xxxx-xxxx)
           │     · method 컬럼 → '카드'
           │     · finalAmount 컬럼 → '=IF(G{row}="결제완료", E{row}, IF(G{row}="전체환불", 0))'
           ├ 3) values:append (USER_ENTERED → 공식 평가됨)
           ├ 4) 추가된 range 파싱 → sheetId 조회 → batchUpdate(repeatCell)
           │     로 추가된 행만 서식 초기화 (Arial 11pt, 흰 배경, 검정, 볼드 X)
           └──← appendedRows, formattingCleared
```

---

## 4. 핵심 파일

```
lecture-dashboard/
├── app/api/tools/order-sync/route.js   ★ 메인 로직 (GET/POST/PUT)
├── lib/nlabSupabase.js                 ★ nlab DB 클라이언트 (서버 전용)
├── components/Dashboard.js             ★ UI (모드 토글, 날짜 픽커, 강사 드롭다운)
├── lib/supabase.js                     자체 대시보드 DB 클라이언트 (별개)
├── app/api/payer-sheets/route.js       시트 탭 목록 + 결제자 데이터 조회 (기존)
├── lib/googleAuth.js                   Google Sheets API 서비스 계정 토큰
└── lib/apiAuth.js                      대시보드 자체 인증
```

### `lib/nlabSupabase.js`
서버 사이드 전용. 싱글톤 패턴. `service_role` 키 사용 → RLS 우회. **절대 클라이언트 코드(`'use client'`나 components/)에서 import 금지.**

### `app/api/tools/order-sync/route.js`
- **GET**: 기간(필수, 최대 31일) 내 결제완료 COURSE의 productTitle을 파싱해 강사 목록 반환
- **POST (multipart/form-data)**: 기존 CSV 업로드 모드
- **POST (application/json)**: 신규 nlab DB 직접 조회 모드
- **PUT**: 시트에 실제 append + 서식 초기화

`buildPreview()`로 환불 필터 + dedup + previewRows 생성 로직을 두 POST 모드 공통 사용.

### `components/Dashboard.js`
3700~4100라인 부근에 주문 동기화 UI. 추가된 상태:
- `orderSyncMode`: 'supabase' | 'csv'
- `orderSyncDateFrom`, `orderSyncDateTo`: 기본값 = 최근 30일
- `orderSyncInstructors`, `orderSyncSelectedInstructor`
- `orderSyncRangeError`: 31일 초과 등 에러 표시용

`loadOrderSyncInstructors(from, to)` 함수가 GET을 호출. 미리보기 버튼은 모드별 분기:
- supabase 모드 → JSON POST (Content-Type: application/json)
- csv 모드 → multipart/form-data POST (기존)

---

## 5. 환경변수

`.env.local` (gitignore 됨, 절대 커밋 X):
```bash
# 자체 대시보드 DB
NEXT_PUBLIC_SUPABASE_URL=https://aznxzcpcsraqsvkoozfc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...

# nlab 운영 DB (이 작업으로 추가)
NLAB_SUPABASE_URL=https://swsgppjaigbmxetrmygu.supabase.co
NLAB_SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# 기존
ANTHROPIC_API_KEY=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
TOSS_SECRET_KEY=...
CHANNEL_ACCESS_KEY=...
CHANNEL_ACCESS_SECRET=...
CHANNEL_WEBHOOK_TOKEN=...
```

**Vercel 프로덕션에는 별도로 같은 두 변수를 등록**해야 동작한다 (Settings → Environment Variables → Production/Preview/Development 모두).

---

## 6. 함정 & 의사결정 (미래 디버깅을 위한 메모)

### ⚠️ 함정 1: PostgREST 1000행 응답 한계
Supabase JS 클라이언트는 PostgREST를 호출하는데, 기본 응답 한계가 **1000행**이다. `.limit(20000)` 걸어도 서버 측 max_rows에 막힐 수 있다.

증상: 강사 목록에서 최근 진행한 강사(예: 김탄생, 현우)가 안 보이고 옛날 강사만 보임. 합계가 정확히 ~1000건 부근.

해결: `fetchAllPaginated()` 헬퍼로 1000개씩 끝까지 페이지네이션 (`.range(offset, offset + 999)` 반복).

### ⚠️ 함정 2: productTitle 부분 일치 false positive
ILIKE `%션%`은 `[김선호]`, `[션]`, `[성수]` 등 모두 매칭한다.

해결: ILIKE로 1차 좁히고, 결과를 JS에서 `extractInstructorName(title) === instructor` 정확 비교로 한 번 더 거른다.

### ⚠️ 함정 3: 시트 사본은 셀 서식이 따라온다
사용자가 결제자 시트의 기존 탭을 "복사"해서 테스트 탭을 만들면 셀 서식(보라 배경, 볼드)이 그대로 따라온다. `values:append`는 서식을 안 바꾸기 때문에 새 행이 보라색으로 들어간다.

해결: append 후 `spreadsheets.batchUpdate`의 `repeatCell` 요청으로 추가 영역만 서식 초기화. `sheetId`는 spreadsheets metadata에서 탭 이름으로 찾는다.

### ⚠️ 함정 4: 결제자 시트 탭 이름 필터
`app/api/payer-sheets/route.js`의 `EXCLUDE_KEYWORDS`에 `'테스트'`, `'사본'`, `'복사'`, `'백업'`, `'정산'`, `'임시'`, `'copy'`, `'backup'`, `'test'`가 있다. 이런 단어가 들어간 탭은 드롭다운에 안 뜬다.

해결: 테스트할 땐 `260428_김탄생999기` 같은 이름 (가짜 기수, 정상 패턴) 사용.

### ⚠️ 함정 5: paymentStatus와 cancelAmount 둘 다 봐야 함
`paymentStatus = 'COMPLETED'` 인데도 `cancelAmount > 0` 또는 `canceledAt`이 있는 경우가 있다 (부분환불).

해결: 두 신호 모두 OR로 체크해서 환불 처리.
```js
const refundedFlag = (row.cancelAmount && row.cancelAmount > 0) || row.canceledAt
if (refundedFlag || /CANCEL|REFUND|FAIL|ABORT/i.test(status)) {
  status = '환불/취소'  // 기존 isRefundStatus()가 잡아냄
}
```

### ⚠️ 함정 6: H열 IF 공식의 행번호
사용자 요구 공식 `=IF(G7="결제완료", E7, IF(G7="전체환불", 0))`은 **행번호 7이 박혀있다**. 새 행마다 정확한 행번호로 바꿔서 주입해야 한다.

해결: append 직전에 시트 현재 행수를 GET해서 `startRowNumber = sheetRows.length + 1`을 계산. 각 행에 `i`를 더해서 정확한 번호 부여. 컬럼 문자(G, E)는 `colLetter()` 헬퍼로 인덱스 → 알파벳 변환.

### 의사결정: Teacher 테이블 안 쓴 이유
초반엔 `Teacher` 테이블 16행을 강사 목록으로 썼더니 김탄생/현우 같은 실제 강사가 누락. 알고보니 Teacher는 메인 노출용이라 의도적으로 적은 수만 등록돼 있었음. **결제 데이터 자체에서 강사명을 추출**하는 게 정답이었다 (= 매출 있는 강사 = 동기화 대상).

### 의사결정: 기간 제한 31일
PostgREST/네트워크 부하 고려 + 사용자 UX (보통 한 달 단위로 결제자 정산하므로). 25년 강사 보고 싶으면 25년의 한 달 기간 선택해서 다시 조회하면 됨.

### 의사결정: F열 결제방법 = '카드'
TossCustomer의 productOption.payMethod 같은 정확한 컬럼은 없지만, 이 동기화 경로 자체가 토스페이먼츠 결제 건만 처리하므로 통일적으로 '카드'로 표기. (계좌이체/가상계좌는 `VirtualAccount` 테이블에 별도이지만 행수가 10건뿐이라 무시. 필요시 향후 분리)

---

## 7. 결제자 시트 구조 (스프레드시트 컬럼 매핑)

매년 1개 시트, 각 시트는 강사·기수별 탭 다수.

`PAYER_SHEETS`:
- `25`: `1z101XT93fPOXuPTfSTFOvRJ_ELUeSAZI2tO4K8Aibvg`
- `26`: `1w0daItI4r4v6sKMH3lWqIY95LJCWuQTBA8UjP1_tCbA`

탭 이름 패턴: `날짜코드(6자리)_강사명기수`. 예: `260428_김탄생`, `260427_현우2기`.

각 탭의 헤더 (예시):

| 컬럼 | 헤더 | 자동 처리 |
|---|---|---|
| A | No | `=Row()-1` 자동 입력 |
| B | 이름 | User.username |
| C | 전화번호 | `010-xxxx-xxxx` 포맷 |
| D | 이메일 | User.email |
| E | 결제금액 | TossCustomer.finalPrice |
| F | 결제 방법 | `'카드'` 고정 |
| G | 결제 구분 | `'결제완료'` / `'환불/취소'` |
| H | 최종 결제 금액 | `=IF(G{n}="결제완료", E{n}, IF(G{n}="전체환불", 0))` |
| I~N | 구분/카톡 입장/입장여부/챌린지방/입장여부/비고 | 빈칸 (다른 도구가 채움) |

`detectColumns()`이 헤더 키워드로 인덱스를 찾는다 — 시트마다 헤더가 약간 달라도 자동 매핑. 매칭 실패 시 해당 컬럼은 -1로 빈칸.

---

## 8. 보안 메모

- `service_role` 키는 **RLS를 우회**한다. 절대 브라우저로 노출 금지.
- 한 번 채팅이나 PR에 노출된 키는 즉시 [Supabase 대시보드](https://supabase.com/dashboard/project/swsgppjaigbmxetrmygu/settings/api-keys)에서 새 secret key 만들고 교체.
- Legacy JWT 키 시스템은 개별 rotate 불가 (JWT secret 통째 rotate해야 함 → 운영 사이트 영향). **새 시스템(Publishable + Secret) 사용 권장.**
- `.env.local`은 `.gitignore`에 잡혀있어 commit/push되지 않음. 그러나 **다른 형태로 새지 않게 항상 주의** (스크린샷, 로그, 채팅 등).

---

## 9. 향후 작업 아이디어 (나중에 추가하고 싶을 때)

- **결제 방법 정확화**: TossCustomer + VirtualAccount 조인해서 카드/계좌이체 구분
- **부분환불 처리**: 현재는 환불=전체로 처리. 부분환불 케이스를 별도 통계로 분리
- **이전 동기화 이력**: 시트 이외에 별도 자체 DB 테이블에 동기화 로그 적재 (어느 강사·기간을 누가 언제 동기화했는지)
- **자동 시트 탭 생성**: 신규 강사 발견 시 결제자 시트에 탭 자동 추가
- **Webhook 기반**: 토스 결제 완료 webhook으로 실시간 동기화 (현재는 사용자 트리거 풀링)

---

## 10. 작업 히스토리 (이 문서 생성 시점)

- [#29 PR](https://github.com/hatecas/lecture-dashboard/pull/29) → 머지됨: 주문 동기화 도구 초기 추가 (CSV 업로드 모드만)
- 본 작업: nlab DB 직접 연동 모드 + 시트 서식 자동화 (이 PR)

이 문서는 향후 변경 시 같이 갱신할 것 — 특히 nlab DB 스키마가 변하거나 새 모드가 추가될 때.
