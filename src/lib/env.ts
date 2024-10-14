import axios from 'axios';

interface EnvVariables {
  OPENAI_API_KEY: string;
  ASSISTANT_ID: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
}

let cachedEnv: EnvVariables | null = null;

export async function getEnvVariables(): Promise<EnvVariables> {
  if (cachedEnv) {
    return cachedEnv;
  }

  try {
    const response = await axios.get<EnvVariables>('https://hook.eu2.make.com/pbhl5qc9tvvrto9itb3t7xk0hrn4v9r5');
    cachedEnv = response.data;
    
    // 환경 변수를 콘솔에 출력
    console.log('웹훅에서 받아온 환경 변수:', {
      OPENAI_API_KEY: cachedEnv.OPENAI_API_KEY.substring(0, 10) + '...',
      ASSISTANT_ID: cachedEnv.ASSISTANT_ID,
      ELEVENLABS_API_KEY: cachedEnv.ELEVENLABS_API_KEY.substring(0, 10) + '...',
      ELEVENLABS_VOICE_ID: cachedEnv.ELEVENLABS_VOICE_ID
    });

    return cachedEnv;
  } catch (error) {
    console.error('환경 변수를 가져오는 데 실패했습니다:', error);
    throw new Error('환경 변수를 가져오는 데 실패했습니다.');
  }
}
