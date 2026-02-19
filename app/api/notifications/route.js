import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notification'

// 스케줄 기반 알림 발송 (크론잡에서 호출)
// GET /api/notifications?secret=xxx
//
// 알림 조건:
// 1. 마감 1일 전 미완료 업무 → deadline_soon
// 2. 긴급(urgent) 미완료 업무 → urgent_daily (매일)
export async function GET(request) {
  // 크론 시크릿 키 검증
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]

    // 미완료 업무 전체 조회 (pending, in_progress)
    const { data: tasks, error } = await supabase
      .from('task_requests')
      .select('*, requester:admins!task_requests_requester_id_fkey(id, name), assignee:admins!task_requests_assignee_id_fkey(id, name, phone, slack_email)')
      .in('status', ['pending', 'in_progress'])

    if (error) throw error
    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ message: '발송 대상 없음', sent: 0 })
    }

    // 오늘 이미 발송된 로그 조회 (중복 방지)
    const todayStart = new Date(todayStr + 'T00:00:00Z')
    const todayEnd = new Date(todayStr + 'T23:59:59Z')

    const { data: todayLogs } = await supabase
      .from('notification_logs')
      .select('task_id, trigger_reason')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString())

    const sentSet = new Set(
      (todayLogs || []).map(l => `${l.task_id}||${l.trigger_reason}`)
    )

    let sentCount = 0
    const results = []

    for (const task of tasks) {
      const recipient = task.assignee
      if (!recipient || (!recipient.phone && !recipient.slack_email)) continue

      const notifications = []

      // 조건 1: 마감 1일 전 (내일이 마감일)
      if (task.deadline === tomorrowStr) {
        const key = `${task.id}||deadline_soon`
        if (!sentSet.has(key)) {
          notifications.push('deadline_soon')
        }
      }

      // 조건 2: 긴급 업무 미완료 → 매일 발송
      if (task.priority === 'urgent') {
        const key = `${task.id}||urgent_daily`
        if (!sentSet.has(key)) {
          notifications.push('urgent_daily')
        }
      }

      for (const reason of notifications) {
        const result = await sendNotification({
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            deadline: task.deadline,
            requester_name: task.requester?.name || '알 수 없음'
          },
          recipient: {
            id: recipient.id,
            phone: recipient.phone,
            slack_email: recipient.slack_email
          },
          triggerReason: reason
        })
        sentCount++
        results.push({
          task_id: task.id,
          title: task.title,
          assignee: recipient.name,
          reason,
          sms: result.sms?.success || false,
          slack: result.slack?.success || false
        })
      }
    }

    return NextResponse.json({
      message: `알림 발송 완료`,
      sent: sentCount,
      results
    })
  } catch (error) {
    console.error('스케줄 알림 오류:', error)
    return NextResponse.json({ error: '알림 발송 실패' }, { status: 500 })
  }
}
