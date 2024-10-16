import { NextResponse } from 'next/server'
import axios from 'axios'
import { getEnvVariables } from '@/lib/env'

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    const { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } = await getEnvVariables();

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      { text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 1,
          similarity_boost: 0.5
        }},
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    return new NextResponse(response.data, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error) {
    console.error('Error in text-to-speech:', error)
    return NextResponse.json({ error: 'Failed to convert text to speech' }, { status: 500 })
  }
}
