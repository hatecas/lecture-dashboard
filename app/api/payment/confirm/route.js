import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json')

async function updateOrderStatus(orderId, paymentKey, status) {
  try {
    if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true })
    let orders = {}
    try { orders = JSON.parse(await readFile(ORDERS_FILE, 'utf-8')) } catch {}
    if (orders[orderId]) {
      orders[orderId].paymentKey = paymentKey
      orders[orderId].status = status
      orders[orderId].updatedAt = new Date().toISOString()
      await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8')
    }
  } catch (err) {
    console.error('[주문 상태 업데이트 실패]', err)
  }
}

// 토스페이먼츠 결제 승인 API
export async function POST(request) {
  try {
    const { paymentKey, orderId, amount } = await request.json()

    if (!paymentKey || !orderId || !amount) {
      return NextResponse.json(
        { error: '필수 파라미터가 누락되었습니다' },
        { status: 400 }
      )
    }

    // 시크릿 키를 Base64로 인코딩 (토스 요구사항)
    const secretKey = process.env.TOSS_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json(
        { error: '결제 설정이 완료되지 않았습니다' },
        { status: 500 }
      )
    }

    const encryptedSecretKey = Buffer.from(secretKey + ':').toString('base64')

    // 토스페이먼츠 결제 승인 요청
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encryptedSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[결제 승인 실패]', data)
      return NextResponse.json(
        { error: data.message || '결제 승인에 실패했습니다', code: data.code },
        { status: response.status }
      )
    }

    // 결제 성공 - 주문 상태 업데이트
    await updateOrderStatus(data.orderId, paymentKey, 'DONE')

    console.log('[결제 승인 성공]', {
      orderId: data.orderId,
      amount: data.totalAmount,
      method: data.method,
      status: data.status,
    })

    return NextResponse.json({
      success: true,
      orderId: data.orderId,
      amount: data.totalAmount,
      method: data.method,
      approvedAt: data.approvedAt,
      // 가상계좌인 경우 추가 정보
      virtualAccount: data.virtualAccount || null,
    })
  } catch (error) {
    console.error('[결제 승인 오류]', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
