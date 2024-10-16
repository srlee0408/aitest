import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { getEnvVariables } from '@/lib/env'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File

    if (!audio) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    const env = await getEnvVariables();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
    })

    return NextResponse.json({ text: transcription.text })
  } catch (error) {
    console.error('Error in speech-to-text:', error)
    return NextResponse.json({ error: 'Failed to convert speech to text' }, { status: 500 })
  }
}
