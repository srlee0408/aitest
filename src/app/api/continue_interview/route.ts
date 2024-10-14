import { NextResponse, NextRequest } from 'next/server'
import OpenAI from 'openai'
import { getEnvVariables } from '@/lib/env'

export async function POST(req: NextRequest) {
  try {
    const { message, thread_id } = await req.json()
    
    console.log('Received request:', { message, thread_id });

    if (!thread_id) {
      console.error('thread_id is undefined');
      return NextResponse.json({ error: 'thread_id is required' }, { status: 400 })
    }

    const env = await getEnvVariables();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const threadMessages = await openai.beta.threads.messages.create(
      thread_id,
      { role: "user", content: message }
    )

    console.log('사용자 답변:', message);

    const run = await openai.beta.threads.runs.create(thread_id, {
      assistant_id: env.ASSISTANT_ID
    })

    let runStatus = await openai.beta.threads.runs.retrieve(thread_id, run.id)

    while (runStatus.status !== 'completed') {
      await new Promise(resolve => setTimeout(resolve, 1000))
      runStatus = await openai.beta.threads.runs.retrieve(thread_id, run.id)
    }

    const messages = await openai.beta.threads.messages.list(thread_id)

    const lastMessageForRun = messages.data
      .filter(message => message.run_id === run.id && message.role === 'assistant')
      .pop()

    const response = lastMessageForRun?.content[0] && 'text' in lastMessageForRun.content[0]
      ? lastMessageForRun.content[0].text.value
      : "No response"

    console.log('Sending response:', response);

    return NextResponse.json({ response })
  } catch (error) {
    console.error('Error in continue_interview:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
