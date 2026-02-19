import crypto from 'crypto'
import { supabase } from './supabase'

// ============================================================
// Solapi SMS 발송
// ============================================================
export async function sendSMS(phoneNumber, text) {
  const apiKey = process.env.SOLAPI_API_KEY
  const apiSecret = process.env.SOLAPI_API_SECRET
  const fromNumber = process.env.SOLAPI_FROM

  if (!apiKey || !apiSecret || !fromNumber) {
    console.error('SMS 환경변수 미설정 (SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_FROM)')
    return { success: false, error: 'SMS 환경변수 미설정' }
  }

  if (!phoneNumber) {
    return { success: false, error: '전화번호 없음' }
  }

  try {
    // Solapi HMAC-SHA256 인증 (Apps Script 코드 기반)
    const now = new Date().toISOString()
    const salt = crypto.randomBytes(8).toString('hex')
    const message = now + salt
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(message)
      .digest('hex')

    const cleanPhone = phoneNumber.replace(/-/g, '').trim()

    const res = await fetch('https://api.solapi.com/messages/v4/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `HMAC-SHA256 apiKey=${apiKey}, date=${now}, salt=${salt}, signature=${signature}`
      },
      body: JSON.stringify({
        message: {
          to: cleanPhone,
          from: fromNumber,
          text: text,
          type: text.length > 90 ? 'LMS' : 'SMS'
        }
      })
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('SMS 발송 실패:', data)
      return { success: false, error: JSON.stringify(data) }
    }

    console.log(`SMS 발송 성공 (${cleanPhone})`)
    return { success: true }
  } catch (e) {
    console.error('SMS 에러:', e)
    return { success: false, error: e.message }
  }
}

// ============================================================
// Slack DM 발송
// ============================================================
export async function sendSlackDM(email, messageText) {
  const botToken = process.env.SLACK_BOT_TOKEN

  if (!botToken) {
    console.error('Slack 환경변수 미설정 (SLACK_BOT_TOKEN)')
    return { success: false, error: 'Slack 환경변수 미설정' }
  }

  if (!email) {
    return { success: false, error: '슬랙 이메일 없음' }
  }

  try {
    // 1. 이메일로 슬랙 유저 조회
    const userRes = await fetch(
      `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
      { headers: { 'Authorization': `Bearer ${botToken}` } }
    )
    const userData = await userRes.json()

    if (!userData.ok) {
      console.error(`슬랙 유저 조회 실패 (${email}):`, userData.error)
      return { success: false, error: `유저 조회 실패: ${userData.error}` }
    }

    // 2. DM 채널 열기
    const convRes = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${botToken}`
      },
      body: JSON.stringify({ users: userData.user.id })
    })
    const convData = await convRes.json()

    if (!convData.ok) {
      console.error('DM 채널 열기 실패:', convData.error)
      return { success: false, error: `DM 채널 실패: ${convData.error}` }
    }

    // 3. 메시지 전송
    const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${botToken}`
      },
      body: JSON.stringify({
        channel: convData.channel.id,
        text: messageText
      })
    })
    const msgData = await msgRes.json()

    if (msgData.ok) {
      console.log(`슬랙 DM 성공: ${email}`)
      return { success: true }
    }

    console.error('슬랙 DM 실패:', msgData.error)
    return { success: false, error: msgData.error }
  } catch (e) {
    console.error('슬랙 에러:', e)
    return { success: false, error: e.message }
  }
}

// ============================================================
// 알림 통합 발송 (SMS + Slack 동시)
// ============================================================
export async function sendNotification({ task, recipient, triggerReason }) {
  const results = { sms: null, slack: null }

  // SMS 메시지 포맷
  const priorityLabel = { urgent: '긴급', high: '높음', normal: '보통', low: '낮음' }
  const reasonLabel = {
    new_task: '신규 업무 배정',
    deadline_soon: '마감 임박 (D-1)',
    urgent_daily: '긴급 업무 미완료'
  }

  const smsText = `[N잡연구소 업무 알림]\n\n`
    + `${reasonLabel[triggerReason]}\n\n`
    + `제목: ${task.title}\n`
    + `우선순위: ${priorityLabel[task.priority] || task.priority}\n`
    + `마감일: ${task.deadline}\n`
    + `요청자: ${task.requester_name || '알 수 없음'}\n\n`
    + `대시보드에서 확인해주세요.`

  // Slack 메시지 포맷
  const urgentEmoji = task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟠' : '🔵'
  const slackText = `${urgentEmoji} *[업무 알림 - ${reasonLabel[triggerReason]}]*\n\n`
    + `📌 *${task.title}*\n`
    + (task.description ? `📝 ${task.description}\n` : '')
    + `👤 요청자: ${task.requester_name || '알 수 없음'}\n`
    + `⏰ 마감일: ${task.deadline}\n`
    + `🏷️ 우선순위: ${priorityLabel[task.priority] || task.priority}\n\n`
    + `대시보드에서 확인해주세요! 🙏`

  // SMS 발송
  if (recipient.phone) {
    results.sms = await sendSMS(recipient.phone, smsText)
  }

  // Slack DM 발송
  if (recipient.slack_email) {
    results.slack = await sendSlackDM(recipient.slack_email, slackText)
  }

  // 발송 로그 기록
  const logs = []
  if (recipient.phone) {
    logs.push({
      task_id: task.id,
      recipient_id: recipient.id,
      type: 'sms',
      trigger_reason: triggerReason,
      success: results.sms?.success || false,
      error_message: results.sms?.error || null
    })
  }
  if (recipient.slack_email) {
    logs.push({
      task_id: task.id,
      recipient_id: recipient.id,
      type: 'slack',
      trigger_reason: triggerReason,
      success: results.slack?.success || false,
      error_message: results.slack?.error || null
    })
  }

  if (logs.length > 0) {
    const { error } = await supabase.from('notification_logs').insert(logs)
    if (error) console.error('알림 로그 저장 실패:', error)
  }

  return results
}

// ============================================================
// 수신자 연락처 조회
// ============================================================
export async function getRecipientContact(userId) {
  const { data, error } = await supabase
    .from('admins')
    .select('id, name, phone, slack_email')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data
}
