import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

// 파일 목록 조회
//   - instructor_id 필수
//   - session_id 선택: 주어지면 그 기수 + 기수 무관(NULL) 자료 모두 반환 (강사 공통 + 기수 전용)
//   - session_id 미지정: 강사의 모든 자료 (기수 무관)
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const instructorId = searchParams.get('instructor_id')
  const sessionId = searchParams.get('session_id')

  if (!instructorId) {
    return NextResponse.json({ error: 'instructor_id 필요' }, { status: 400 })
  }

  let query = supabase
    .from('instructor_attachments')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false })

  if (sessionId) {
    // 그 기수 자료 + 강사 공통(session_id NULL)
    query = query.or(`session_id.eq.${sessionId},session_id.is.null`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ files: data })
}

// 파일 업로드 (강사별)
// 두 가지 모드:
//  1) 작은 파일 (≤4.5MB): formData.file 그대로 받아서 서버가 Supabase Storage 업로드
//  2) 큰 파일 (>4.5MB): 클라이언트가 sign-upload로 토큰 받아 직접 업로드 후, 여기엔
//     storage_path만 전달 → 메타데이터만 DB 기록
//  3) 링크: file_type='link' → URL만 저장
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const instructorId = formData.get('instructor_id')
    const sessionIdRaw = formData.get('session_id')
    const sessionId = sessionIdRaw && String(sessionIdRaw).trim() ? String(sessionIdRaw).trim() : null
    const fileType = formData.get('file_type') // file, link, text
    const linkUrl = formData.get('link_url')
    const linkTitle = formData.get('link_title')
    const description = formData.get('description')
    // 'material'(기본) | 'ebook'(강사 전자책 원문 - AI가 핵심 자료로 사용)
    const fileRoleRaw = formData.get('file_role')
    const fileRole = fileRoleRaw === 'ebook' ? 'ebook' : 'material'
    // 큰 파일은 클라이언트가 직접 Supabase Storage에 업로드 후 메타만 보냄.
    const preuploadedStoragePath = formData.get('storage_path')
    const preuploadedFileName = formData.get('file_name')
    const preuploadedFileSize = formData.get('file_size')
    const preuploadedMimeType = formData.get('mime_type')

    if (!instructorId) {
      return NextResponse.json({ error: 'instructor_id 필요' }, { status: 400 })
    }

    // 모드 2: 클라이언트가 미리 업로드 완료한 파일의 메타데이터만 기록
    if (preuploadedStoragePath) {
      const fileName = preuploadedFileName || preuploadedStoragePath.split('/').pop()
      const ext = (fileName.split('.').pop() || '').toLowerCase()
      let category = 'other'
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) category = 'image'
      else if (ext === 'pdf') category = 'pdf'
      else if (['xlsx', 'xls', 'csv'].includes(ext)) category = 'spreadsheet'
      else if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv'].includes(ext)) category = 'video'
      else if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) category = 'audio'
      else if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log'].includes(ext)) category = 'text'
      else if (['doc', 'docx', 'hwp', 'hwpx'].includes(ext)) category = 'document'
      else if (['ppt', 'pptx'].includes(ext)) category = 'presentation'
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(preuploadedStoragePath)
      const { data: dbData, error: dbError } = await supabase
        .from('instructor_attachments')
        .insert({
          instructor_id: instructorId,
          session_id: sessionId,
          file_type: category,
          file_role: fileRole,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_size: preuploadedFileSize ? parseInt(preuploadedFileSize, 10) : null,
          mime_type: preuploadedMimeType || null,
          storage_path: preuploadedStoragePath,
          description: description || null,
        })
        .select()
        .single()
      if (dbError) {
        return NextResponse.json({ error: dbError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, file: dbData })
    }

    // 링크 저장
    if (fileType === 'link') {
      const { data, error } = await supabase
        .from('instructor_attachments')
        .insert({
          instructor_id: instructorId,
          session_id: sessionId,
          file_type: 'link',
          file_role: fileRole,
          file_name: linkTitle || linkUrl,
          file_url: linkUrl,
          description: description || null
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, file: data })
    }

    // 파일 업로드
    if (!file) {
      return NextResponse.json({ error: '파일 필요' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 파일 확장자 및 타입 결정
    const fileName = file.name
    const ext = fileName.split('.').pop().toLowerCase()

    let category = 'other'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
      category = 'image'
    } else if (['pdf'].includes(ext)) {
      category = 'pdf'
    } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
      category = 'spreadsheet'
    } else if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv'].includes(ext)) {
      category = 'video'
    } else if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) {
      category = 'audio'
    } else if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log'].includes(ext)) {
      category = 'text'
    } else if (['doc', 'docx', 'hwp', 'hwpx'].includes(ext)) {
      category = 'document'
    } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      category = 'archive'
    } else if (['ppt', 'pptx'].includes(ext)) {
      category = 'presentation'
    }

    // Supabase Storage에 업로드
    // 파일명 정규화 (특수문자, 공백, 한글 제거)
    const safeFileName = fileName
      .replace(/[^\w.-]/g, '_')  // 영문, 숫자, 점, 하이픈 외 모두 _로 변환
      .replace(/_+/g, '_')        // 연속된 _ 제거
    const storagePath = `instructor_${instructorId}/${Date.now()}_${safeFileName}`

    // MIME type 결정 (브라우저가 제대로 감지 못하는 경우 대비)
    let contentType = file.type
    if (!contentType || contentType === 'application/octet-stream') {
      const mimeMap = {
        'md': 'text/markdown',
        'txt': 'text/plain',
        'json': 'application/json',
        'xml': 'application/xml',
        'yaml': 'text/yaml',
        'yml': 'text/yaml',
        'csv': 'text/csv'
      }
      contentType = mimeMap[ext] || 'application/octet-stream'
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: contentType,
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: '파일 업로드 실패: ' + uploadError.message }, { status: 500 })
    }

    // Public URL 가져오기
    const { data: urlData } = supabase.storage
      .from('attachments')
      .getPublicUrl(storagePath)

    // DB에 메타데이터 저장
    const { data: dbData, error: dbError } = await supabase
      .from('instructor_attachments')
      .insert({
        instructor_id: instructorId,
        session_id: sessionId,
        file_type: category,
        file_role: fileRole,
        file_name: fileName,
        file_url: urlData.publicUrl,
        file_size: buffer.length,
        mime_type: file.type,
        storage_path: storagePath,
        description: description || null
      })
      .select()
      .single()

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, file: dbData })

  } catch (error) {
    console.error('File upload error:', error)
    return NextResponse.json({ error: '파일 처리 중 오류' }, { status: 500 })
  }
}

// 파일 삭제
export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get('id')
  const instructorId = searchParams.get('instructor_id')
  const deleteAll = searchParams.get('delete_all')

  // 전체 삭제
  if (deleteAll === 'true' && instructorId) {
    // 모든 파일 정보 조회
    const { data: files } = await supabase
      .from('instructor_attachments')
      .select('storage_path')
      .eq('instructor_id', instructorId)

    // Storage에서 모든 파일 삭제
    if (files && files.length > 0) {
      const storagePaths = files.filter(f => f.storage_path).map(f => f.storage_path)
      if (storagePaths.length > 0) {
        await supabase.storage
          .from('attachments')
          .remove(storagePaths)
      }
    }

    // DB에서 모두 삭제
    const { error } = await supabase
      .from('instructor_attachments')
      .delete()
      .eq('instructor_id', instructorId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: files?.length || 0 })
  }

  // 단일 파일 삭제
  if (!fileId) {
    return NextResponse.json({ error: 'file id 필요' }, { status: 400 })
  }

  // 파일 정보 조회
  const { data: fileData } = await supabase
    .from('instructor_attachments')
    .select('storage_path, file_type')
    .eq('id', fileId)
    .single()

  // Storage에서 삭제 (링크가 아닌 경우)
  if (fileData?.storage_path) {
    await supabase.storage
      .from('attachments')
      .remove([fileData.storage_path])
  }

  // DB에서 삭제
  const { error } = await supabase
    .from('instructor_attachments')
    .delete()
    .eq('id', fileId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
