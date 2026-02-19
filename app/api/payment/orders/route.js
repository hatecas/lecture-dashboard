import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json')

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
}

async function readOrders() {
  await ensureDataDir()
  try {
    const raw = await readFile(ORDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeOrders(orders) {
  await ensureDataDir()
  await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8')
}

// GET: 전체 주문 정보 조회 (거래 내역 머지용)
export async function GET() {
  try {
    const orders = await readOrders()
    return NextResponse.json({ orders })
  } catch (error) {
    console.error('[주문 조회 오류]', error)
    return NextResponse.json({ error: '주문 조회 실패' }, { status: 500 })
  }
}

// POST: 새 주문 정보 저장 (결제 전)
export async function POST(request) {
  try {
    const body = await request.json()
    const { orderId, customerName, customerPhone, orderName, amount } = body

    if (!orderId || !customerName) {
      return NextResponse.json({ error: 'orderId, customerName 필수' }, { status: 400 })
    }

    const orders = await readOrders()
    orders[orderId] = {
      orderId,
      customerName: customerName.trim(),
      customerPhone: (customerPhone || '').replace(/-/g, '').trim(),
      orderName: (orderName || '').trim(),
      amount: amount || 0,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    }

    await writeOrders(orders)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[주문 저장 오류]', error)
    return NextResponse.json({ error: '주문 저장 실패' }, { status: 500 })
  }
}

// PATCH: 주문 상태/정보 업데이트 (결제 완료 또는 수동 입력)
export async function PATCH(request) {
  try {
    const body = await request.json()
    const { orderId, paymentKey, ...updates } = body

    if (!orderId && !paymentKey) {
      return NextResponse.json({ error: 'orderId 또는 paymentKey 필수' }, { status: 400 })
    }

    const orders = await readOrders()

    // orderId로 찾거나, paymentKey로 찾기
    let targetKey = orderId
    if (!targetKey && paymentKey) {
      targetKey = Object.keys(orders).find((k) => orders[k].paymentKey === paymentKey)
    }

    if (targetKey && orders[targetKey]) {
      orders[targetKey] = { ...orders[targetKey], ...updates, updatedAt: new Date().toISOString() }
    } else if (orderId) {
      // 기존 결제건에 수동으로 고객 정보 추가
      orders[orderId] = {
        orderId,
        ...updates,
        createdAt: new Date().toISOString(),
      }
    }

    await writeOrders(orders)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[주문 업데이트 오류]', error)
    return NextResponse.json({ error: '주문 업데이트 실패' }, { status: 500 })
  }
}
