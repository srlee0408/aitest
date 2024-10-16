import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getEnvVariables } from '@/lib/env'

export async function POST(req: Request) {
  console.log('Received POST request at /api/start_interview');
  try {
    const env = await getEnvVariables();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const thread = await openai.beta.threads.create()
    
    console.log('Thread created:', thread.id);

    const message = "테스트를 진행해보겠습니다. 빨간 점이 들어오면 네 라고 답변해주세요.";

    return NextResponse.json({ 
      thread_id: thread.id,
      message: message
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*', // 모든 도메인 허용
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  } catch (error) {
    console.error('Error in POST /api/start_interview:', error);
    return NextResponse.json({ error: 'Failed to start interview' }, { status: 500 })
  }
}

// OPTIONS 메서드 핸들러
export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
