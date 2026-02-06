import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyApiAuth } from '@/lib/apiAuth'

// 파일 목록 조회 (강사별)
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const instructorId = searchParams.get('instructor_id')

  if (!instructorId) {
    return NextResponse.json({ error: 'instructor_id 필요' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('instructor_attachments')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ files: data })
}

// 파일 업로드 (강사별)
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const instructorId = formData.get('instructor_id')
    const fileType = formData.get('file_type') // file, link, text
    const linkUrl = formData.get('link_url')
    const linkTitle = formData.get('link_title')
    const description = formData.get('description')

    if (!instructorId) {
      return NextResponse.json({ error: 'instructor_id 필요' }, { status: 400 })
    }

    // 링크 저장
    if (fileType === 'link') {
      const { data, error } = await supabase
        .from('instructor_attachments')
        .insert({
          instructor_id: instructorId,
          file_type: 'link',
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
    const storagePath = `instructor_${instructorId}/${Date.now()}_${fileName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: file.type,
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
        file_type: category,
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
