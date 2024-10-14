import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getEnvVariables } from '@/lib/env'

export async function POST(req: Request) {
  try {
    const env = await getEnvVariables();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const thread = await openai.beta.threads.create()
    
    console.log('Thread created:', thread);
    console.log('생성된 thread_id:', thread.id);

    const message = "면접을 시작하겠습니다. 준비가 되었다면 말씀해주세요."

    return NextResponse.json({ 
      thread_id: thread.id,
      message: message
    })
  } catch (error) {
    console.error('Error starting interview:', error)
    return NextResponse.json({ error: 'Failed to start interview' }, { status: 500 })
  }
}

function generateIntervieweeId() {
  // 여기에 interviewee_id를 생성하는 로직을 구현합니다
  return 'interviewee_' + Math.random().toString(36).substr(2, 9)
}
