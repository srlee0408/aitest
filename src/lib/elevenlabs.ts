// 이 파일은 실제 Eleven Labs API 연동 대신 간단한 모의 함수를 제공합니다.

import axios from 'axios';
import { getEnvVariables } from './env';

export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } = await getEnvVariables();
  const response = await axios.post('/api/text_to_speech', 
    { text, apiKey: ELEVENLABS_API_KEY, voiceId: ELEVENLABS_VOICE_ID }, 
    { responseType: 'arraybuffer' }
  );
  return response.data;
}

export const playAudio = (audioBuffer: ArrayBuffer): Promise<void> => {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioContext.decodeAudioData(audioBuffer, (buffer) => {
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      source.onended = () => {
        audioContext.close()
        resolve()
      }
      source.start(0)
    }, reject)
  })
}
