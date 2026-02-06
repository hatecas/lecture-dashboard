import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'

export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { fileUrl } = await request.json()

    if (!fileUrl) {
      return NextResponse.json({ error: 'fileUrl 필요' }, { status: 400 })
    }

    // 동적 import로 jszip 로드
    const JSZip = (await import('jszip')).default

    // ZIP 파일 다운로드
    const response = await fetch(fileUrl)
    if (!response.ok) {
      return NextResponse.json({ error: 'ZIP 파일 다운로드 실패' }, { status: 500 })
    }

    const arrayBuffer = await response.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    // 텍스트 파일 추출
    const textExtensions = ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log', 'csv', 'html', 'css', 'js', 'ts', 'py']
    const extractedFiles = []

    for (const [filename, file] of Object.entries(zip.files)) {
      if (file.dir) continue

      const ext = filename.split('.').pop().toLowerCase()

      if (textExtensions.includes(ext)) {
        try {
          const content = await file.async('string')
          extractedFiles.push({
            name: filename,
            type: ext,
            content: content.slice(0, 5000) // 최대 5000자
          })
        } catch (e) {
          // 텍스트로 읽을 수 없는 파일은 스킵
        }
      } else {
        // 텍스트가 아닌 파일은 메타데이터만
        extractedFiles.push({
          name: filename,
          type: ext,
          content: null
        })
      }
    }

    return NextResponse.json({
      success: true,
      files: extractedFiles,
      totalFiles: Object.keys(zip.files).filter(f => !zip.files[f].dir).length
    })

  } catch (error) {
    console.error('ZIP 추출 오류:', error)
    return NextResponse.json({ error: 'ZIP 파일 처리 중 오류' }, { status: 500 })
  }
}
