// Google Drive 파일 다운로드 헬퍼.
// 노션 페이지 안에 embed 형태로 포함된 Drive 파일(특히 audio)을 정리봇이 가져갈 때 사용.
//
// 작동 조건: Drive 파일이 "링크 있는 모든 사용자 보기 가능" 으로 공유되어 있어야 함.
// (또는 우리 서비스 계정에 공유 — 그 경우는 별도 OAuth 토큰 필요. 현재는 미구현.)
//
// 한도: 100MB 미만 파일은 직접 다운로드 OK. 그 이상은 바이러스 스캔 경고 페이지가
// 끼어서 별도 confirm 토큰 흐름 필요. 1시간 분량 audio (~30~50MB) 는 직접 다운로드 가능.

// /file/d/<ID>/  또는 /open?id=<ID>  또는 /uc?id=<ID>
const DRIVE_FILE_ID_RE = /drive\.google\.com\/(?:file\/d\/|open\?(?:[^&]*&)*id=|uc\?(?:export=download&)?id=)([a-zA-Z0-9_-]+)/i

export function isGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    return /(?:^|\.)drive\.google\.com$/.test(new URL(url).hostname)
  } catch {
    return /drive\.google\.com/i.test(url)
  }
}

export function parseDriveFileId(url) {
  if (!url) return null
  const m = url.match(DRIVE_FILE_ID_RE)
  return m ? m[1] : null
}

export function toDriveDirectDownloadUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}

/**
 * Drive 파일 다운로드. 100MB 이하만 보장. 그 이상은 confirm 페이지가 끼어 별도 처리 필요.
 * 응답이 HTML(login/virus scan 경고)이면 실패로 throw.
 *
 * @param {string} fileIdOrUrl - 파일 ID 또는 Drive URL
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function downloadDriveFile(fileIdOrUrl) {
  let fileId = fileIdOrUrl
  if (fileIdOrUrl.includes('://')) {
    fileId = parseDriveFileId(fileIdOrUrl)
    if (!fileId) throw new Error('Drive URL에서 file ID를 추출할 수 없습니다: ' + fileIdOrUrl)
  }

  const url = toDriveDirectDownloadUrl(fileId)
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Drive 다운로드 실패 (HTTP ${res.status}). 파일이 '링크 있는 사용자 보기' 권한으로 공유되어 있는지 확인해주세요.`)
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase()

  // HTML 응답이면 = 권한 없거나 바이러스 스캔 경고 페이지
  if (contentType.includes('text/html')) {
    const sample = (await res.text()).slice(0, 500)
    if (/quota|exceeded/i.test(sample)) {
      throw new Error("Drive 다운로드 한도 초과. 잠시 후 다시 시도해주세요.")
    }
    if (/sign in|signin|login|로그인/i.test(sample)) {
      throw new Error("Drive 파일에 접근할 수 없습니다. '링크 있는 모든 사용자 보기' 권한으로 공유해주세요.")
    }
    if (/uc-download-link|virus.scan|확인/i.test(sample)) {
      throw new Error('파일이 100MB를 초과해 Drive 바이러스 스캔 확인이 필요합니다. 더 작은 파일로 분할하거나 별도 처리가 필요합니다.')
    }
    throw new Error(`Drive 응답이 audio 파일이 아닙니다 (HTML 응답). 권한·공유 설정 확인 필요.`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  return { buffer, mimeType: contentType.split(';')[0].trim() || 'application/octet-stream' }
}
