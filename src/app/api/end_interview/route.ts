import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ message: "면접이 종료되었습니다. 참여해 주셔서 감사합니다." })
}

