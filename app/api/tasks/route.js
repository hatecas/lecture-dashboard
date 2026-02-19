import { NextResponse } from 'next/server'
import { verifyApiAuth } from '@/lib/apiAuth'
import { supabase } from '@/lib/supabase'
import { sendNotification, getRecipientContact } from '@/lib/notification'

// 업무 목록 조회
export async function GET(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: '사용자 ID가 필요합니다' }, { status: 400 })
    }

    // 요청한 업무 (내가 다른 사람에게 요청)
    const { data: sentTasks, error: sentError } = await supabase
      .from('task_requests')
      .select('*, requester:admins!task_requests_requester_id_fkey(id, name, username), assignee:admins!task_requests_assignee_id_fkey(id, name, username)')
      .eq('requester_id', userId)
      .order('created_at', { ascending: false })

    // 테이블 미존재(42P01) 또는 관계 오류 시 빈 배열 반환
    if (sentError) {
      const code = sentError.code || ''
      const msg = (sentError.message || '').toLowerCase()
      if (code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
        return NextResponse.json({ sent: [], received: [] })
      }
      throw sentError
    }

    // 요청받은 업무 (다른 사람이 나에게 요청)
    const { data: receivedTasks, error: receivedError } = await supabase
      .from('task_requests')
      .select('*, requester:admins!task_requests_requester_id_fkey(id, name, username), assignee:admins!task_requests_assignee_id_fkey(id, name, username)')
      .eq('assignee_id', userId)
      .order('created_at', { ascending: false })

    if (receivedError) {
      const code = receivedError.code || ''
      const msg = (receivedError.message || '').toLowerCase()
      if (code === '42P01' || msg.includes('relation') || msg.includes('does not exist')) {
        return NextResponse.json({ sent: sentTasks || [], received: [] })
      }
      throw receivedError
    }

    return NextResponse.json({
      sent: sentTasks || [],
      received: receivedTasks || []
    })
  } catch (error) {
    console.error('업무 조회 오류:', error)
    return NextResponse.json({ error: '업무 조회 실패' }, { status: 500 })
  }
}

// 업무 생성
export async function POST(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { requester_id, assignee_id, title, description, priority, deadline } = await request.json()

    if (!requester_id || !assignee_id || !title || !deadline) {
      return NextResponse.json({ error: '요청자, 담당자, 제목, 마감일은 필수입니다' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('task_requests')
      .insert({
        requester_id,
        assignee_id,
        title,
        description: description || '',
        priority: priority || 'normal',
        deadline,
        status: 'pending'
      })
      .select('*, requester:admins!task_requests_requester_id_fkey(id, name, username), assignee:admins!task_requests_assignee_id_fkey(id, name, username)')
      .single()

    if (error) throw error

    // 신규 업무 배정 알림 (비동기 - 응답 지연 방지)
    sendTaskNotification(data).catch(e => console.error('알림 발송 실패:', e))

    return NextResponse.json({ task: data })
  } catch (error) {
    console.error('업무 생성 오류:', error)
    return NextResponse.json({ error: '업무 생성 실패' }, { status: 500 })
  }
}

// 신규 업무 배정 알림 발송
async function sendTaskNotification(task) {
  const recipient = await getRecipientContact(task.assignee_id)
  if (!recipient || (!recipient.phone && !recipient.slack_email)) return

  await sendNotification({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      deadline: task.deadline,
      requester_name: task.requester?.name || '알 수 없음'
    },
    recipient,
    triggerReason: 'new_task'
  })
}

// 업무 수정 (상태 변경, 사유 작성 등)
export async function PUT(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { id, status, rejection_reason, title, description, priority, deadline } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    const updateData = { updated_at: new Date().toISOString() }

    if (status) {
      updateData.status = status
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString()
      }
    }
    if (rejection_reason !== undefined) updateData.rejection_reason = rejection_reason
    if (title) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (priority) updateData.priority = priority
    if (deadline) updateData.deadline = deadline

    const { data, error } = await supabase
      .from('task_requests')
      .update(updateData)
      .eq('id', id)
      .select('*, requester:admins!task_requests_requester_id_fkey(id, name, username), assignee:admins!task_requests_assignee_id_fkey(id, name, username)')
      .single()

    if (error) throw error

    return NextResponse.json({ task: data })
  } catch (error) {
    console.error('업무 수정 오류:', error)
    return NextResponse.json({ error: '업무 수정 실패' }, { status: 500 })
  }
}

// 업무 삭제
export async function DELETE(request) {
  const auth = await verifyApiAuth(request)
  if (!auth.authenticated) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    const { error } = await supabase
      .from('task_requests')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('업무 삭제 오류:', error)
    return NextResponse.json({ error: '업무 삭제 실패' }, { status: 500 })
  }
}
