import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ message: "면접이 종료되었습니다. 매니저에게 알림이 전송되었습니다. 잠시만 기다려주시기 바랍니다." })
}

