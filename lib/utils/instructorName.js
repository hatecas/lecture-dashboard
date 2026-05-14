// nlab DB의 productTitle/orderName에서 강사명을 추출하는 공통 로직.
// 과거 sales-analysis/route.js, tools/order-sync/route.js에 동일 코드가 복사되어 있어 통합.
//
// 지원 패턴:
//   [N잡연구소X홍시삼분]2기..., [N잡연구소x토리맘]..., [사뚜xN잡연구소]...,
//   [현우 2기]..., [김탄생]..., [N잡연구소X에어3기]..., [노바작가x]...,
//   [온비전x머니탱크]... (x는 콜라보 마커 → x 이후는 모두 제거)
export function extractInstructorName(title) {
  if (!title) return null
  const m = String(title).match(/^\s*\[([^\]]+)\]/)
  if (!m) return null
  let name = m[1]
  // 1) N잡연구소 + 연결자(x/X/×) 제거 (앞/뒤 양쪽)
  name = name.replace(/N\s*잡\s*연구소\s*[xX×]?/gi, '')
  name = name.replace(/[xX×]\s*N\s*잡\s*연구소/gi, '')
  // 2) "강사명x콜라보/기타" 패턴: 첫 x(대소문자/×) 이후 전부 제거
  name = name.replace(/\s*[xX×].*$/, '')
  // 3) 기수 제거: " 2기", "3기" 등 (이름 끝의 숫자기)
  name = name.replace(/\s*\d+\s*기\s*$/, '')
  // 4) 양옆 공백/특수문자 정리
  name = name.replace(/^[\s\-:·,]+|[\s\-:·,]+$/g, '').trim()
  return name || null
}

// TossCustomer 환불 판정 — paymentStatus만으로 부족(부분환불은 COMPLETED인 채로 cancelAmount만 채워짐).
export function isRefunded(row) {
  if (!row) return false
  if (row.cancelAmount && row.cancelAmount > 0) return true
  if (row.canceledAt) return true
  const status = row.paymentStatus || ''
  if (/CANCEL|REFUND|FAIL|ABORT/i.test(status)) return true
  return false
}
