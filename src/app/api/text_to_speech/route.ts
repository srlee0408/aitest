import { NextResponse } from 'next/server'
import axios from 'axios'
import { getEnvVariables } from '@/lib/env'

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    const env = await getEnvVariables();
    
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`,
      {
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer'
      }
    )

    return new NextResponse(response.data, {
      headers: {
        'Content-Type': 'audio/mpeg'
      }
    })
  } catch (error) {
    console.error('Error in text-to-speech:', error)
    return NextResponse.json({ error: 'Failed to convert text to speech' }, { status: 500 })
  }
}
