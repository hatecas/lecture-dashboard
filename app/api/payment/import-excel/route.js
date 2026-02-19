import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

const DATA_DIR = path.join(process.cwd(), 'data')
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json')

async function readOrders() {
  try {
    const raw = await readFile(ORDERS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeOrders(orders) {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true })
  }
  await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8')
}

// 토스 대시보드 엑셀에서 컬럼명 매칭 (다양한 포맷 대응)
function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const found = headers.find((h) =>
      h && h.replace(/\s/g, '').includes(candidate.replace(/\s/g, ''))
    )
    if (found) return found
  }
  return null
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    if (rows.length === 0) {
      return NextResponse.json({ error: '엑셀에 데이터가 없습니다' }, { status: 400 })
    }

    // 컬럼명 찾기
    const headers = Object.keys(rows[0])
    const orderIdCol = findColumn(headers, ['주문번호', 'orderId', 'order_id', '주문ID'])
    const nameCol = findColumn(headers, ['구매자', '구매자명', '주문자명', '고객명', '이름', 'customerName', '구매자이름'])
    const phoneCol = findColumn(headers, ['구매자휴대폰번호', '구매자연락처', '구매자전화번호', '전화번호', '연락처', 'customerPhone', '휴대폰', '핸드폰번호', '휴대폰번호'])
    const emailCol = findColumn(headers, ['구매자이메일', '이메일', 'customerEmail', 'email', '구매자메일'])
    const productCol = findColumn(headers, ['상품명', '주문명', 'orderName', '상품'])
    const amountCol = findColumn(headers, ['결제금액', '결제 금액', '금액', '결제액', 'amount', '총결제금액'])
    const statusCol = findColumn(headers, ['결제상태', '결제 상태', '상태', 'status'])
    const paymentKeyCol = findColumn(headers, ['paymentKey', '결제키', 'Payment Key'])

    console.log('[엑셀 임포트] 감지된 컬럼:', headers.join(', '))
    console.log('[엑셀 임포트] 매핑:', { orderIdCol, nameCol, phoneCol, emailCol, productCol, amountCol, paymentKeyCol })

    if (!orderIdCol) {
      return NextResponse.json(
        { error: `주문번호 컬럼을 찾을 수 없습니다. 현재 컬럼: ${headers.join(', ')}` },
        { status: 400 }
      )
    }

    // 기존 주문 데이터 로드
    const orders = await readOrders()
    let imported = 0
    let updated = 0
    let skipped = 0

    for (const row of rows) {
      const orderId = String(row[orderIdCol] || '').trim()
      if (!orderId) {
        skipped++
        continue
      }

      const customerName = nameCol ? String(row[nameCol] || '').trim() : ''
      const customerPhone = phoneCol
        ? String(row[phoneCol] || '').replace(/[^0-9]/g, '').trim()
        : ''
      const customerEmail = emailCol ? String(row[emailCol] || '').trim() : ''
      const orderName = productCol ? String(row[productCol] || '').trim() : ''
      const rawAmount = amountCol ? String(row[amountCol] || '').replace(/[^0-9]/g, '') : ''
      const amount = rawAmount ? Number(rawAmount) : 0
      const paymentKey = paymentKeyCol ? String(row[paymentKeyCol] || '').trim() : ''

      // 이름도 전화번호도 없으면 스킵
      if (!customerName && !customerPhone) {
        skipped++
        continue
      }

      const isNew = !orders[orderId]
      orders[orderId] = {
        ...(orders[orderId] || {}),
        orderId,
        ...(customerName && { customerName }),
        ...(customerPhone && { customerPhone }),
        ...(customerEmail && { customerEmail }),
        ...(orderName && { orderName }),
        ...(amount && { amount }),
        ...(paymentKey && { paymentKey }),
        updatedAt: new Date().toISOString(),
        ...(!orders[orderId]?.createdAt && { createdAt: new Date().toISOString() }),
      }

      if (isNew) imported++
      else updated++
    }

    await writeOrders(orders)

    return NextResponse.json({
      success: true,
      total: rows.length,
      imported,
      updated,
      skipped,
      columns: {
        orderId: orderIdCol,
        name: nameCol,
        phone: phoneCol,
        email: emailCol,
        product: productCol,
      },
    })
  } catch (error) {
    console.error('[엑셀 임포트 오류]', error)
    return NextResponse.json(
      { error: '엑셀 파일 처리에 실패했습니다: ' + error.message },
      { status: 500 }
    )
  }
}
