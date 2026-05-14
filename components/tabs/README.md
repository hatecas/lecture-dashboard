# components/tabs/

Dashboard.js가 너무 비대해져서(1만 줄+) 메뉴별로 점진 분리 중인 폴더.

## 분리 원칙

1. **자족적인 탭부터** — 다른 탭과 state 공유가 적은 탭이 first candidate
2. **state는 탭 컴포넌트 안으로 이동** — 그 탭만 쓰는 state는 Dashboard.js에 둘 필요 없음
3. **공유 의존성은 props로** — `isMobile`, `loginId`, `isDevEnv` 같은 건 props
4. **공통 헬퍼는 lib/ import** — `getAuthHeaders`, `formatKST` 등
5. **로드 useEffect도 함께** — 탭 진입 시 데이터 로드하는 useEffect는 탭 컴포넌트 안으로

## Dashboard.js에서 사용 패턴

```js
import ErrorLogsTab from './tabs/ErrorLogsTab'

// JSX 안:
{currentTab === 'error-logs' && (isDevEnv || loginId === 'jinwoo') && (
  <ErrorLogsTab isMobile={isMobile} isDevEnv={isDevEnv} loginId={loginId} />
)}
```

## 분리 진행 상황

- ✅ `ErrorLogsTab.js` — 에러 로그 (jinwoo/dev 전용) — 2026-05-14 분리, 첫 시범 사례

## 다음 분리 후보 (작은 것부터)

- ranking (~70줄) — `allSheetData`, sort state 의존
- account-management (~330줄) — am_* state 전부 자족
- planner-config (~570줄) — pc_* state 전부 자족
- payer-data (~450줄)
- lecture-analyzer (~530줄)
