// 한국 시간(KST) 표시·계산 공통 헬퍼.
//
// Vercel은 UTC로 동작하므로 시각 표시는 항상 명시적으로 KST(+09:00)로 처리.
// 기존: 코드 곳곳에서 toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) 직접 호출.
//       포맷 옵션이 호출마다 달라 화면별 표기가 미묘하게 어긋남.
// 통일: 아래 헬퍼 사용. mode 인자로 일관된 표기.

const TZ = 'Asia/Seoul'

// mode:
//   'datetime' (기본): 2026. 5. 14. 오후 3:30
//   'short'           : 2026. 5. 14. 15:30
//   'date'            : 2026. 5. 14.
//   'time'            : 15:30
//   'full'            : 2026. 5. 14. 오후 3:30:00
export function formatKST(value, mode = 'datetime') {
  if (value === null || value === undefined || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  switch (mode) {
    case 'short':
      return d.toLocaleString('ko-KR', {
        timeZone: TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
    case 'date':
      return d.toLocaleDateString('ko-KR', { timeZone: TZ })
    case 'time':
      return d.toLocaleTimeString('ko-KR', {
        timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
      })
    case 'full':
      return d.toLocaleString('ko-KR', { timeZone: TZ })
    case 'datetime':
    default:
      return d.toLocaleString('ko-KR', {
        timeZone: TZ, dateStyle: 'short', timeStyle: 'short',
      })
  }
}

// 현재 시각 (Date 객체) — 시점 비교용. 표시는 formatKST() 사용.
export function getKSTNow() {
  return new Date()
}

// 무료특강 KST 시간 윈도우 계산.
//   예: kstWindow('2026-05-14', '19:30', 5)
//      → { startISO: '2026-05-14T10:30:00.000Z', endISO: '2026-05-14T15:30:00.000Z' }
//   서버에서 nlab DB 조회 범위 계산할 때 사용 (CLAUDE.md §5-5).
export function kstWindow(dateYMD, startHHmm, durationHours) {
  const startKST = new Date(`${dateYMD}T${startHHmm}:00+09:00`)
  const endKST = new Date(startKST.getTime() + durationHours * 60 * 60 * 1000)
  return {
    startISO: startKST.toISOString(),
    endISO: endKST.toISOString(),
  }
}
