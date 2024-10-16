// 이 파일은 실제 GPT API 연동 대신 간단한 모의 함수를 제공합니다.

import axios from 'axios';

// 환경 변수에서 API 키 가져오기
const openaiApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

// API 키 유효성 검사
if (!openaiApiKey) {
  console.error('OpenAI API 키가 설정되지 않았습니다.');
  throw new Error('환경 변수에서 OpenAI API 키를 가져오지 못했습니다.');
}

export async function startInterview(): Promise<{ message: string; threadId: string }> {
  console.log('Starting interview...');
  console.log('NEXT_PUBLIC_API_BASE_URL:', process.env.NEXT_PUBLIC_API_BASE_URL);

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/start_interview`, {
      method: 'POST', // POST 요청으로 변경
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}) // 필요한 데이터가 있다면 여기에 추가
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    console.log('Response:', data);

    if (!data || !data.thread_id) {
      throw new Error('Invalid response from server');
    }

    return { message: data.message, threadId: data.thread_id };
  } catch (error) {
    console.error('Error in startInterview:', error);
    throw error;
  }
}

export async function continueInterview(userMessage: string, threadId: string): Promise<string> {
  console.log("continueInterview 함수 호출됨");
  console.log("받은 userMessage:", userMessage);
  console.log("받은 threadId:", threadId);

  if (!threadId || typeof threadId !== 'string') {
    console.error('잘못된 threadId:', threadId);
    throw new Error('유효한 threadId가 제공되지 않았습니다');
  }
  try {
    console.log('continue_interview 요청 전송:', { threadId, userMessage });
    const response = await axios.post('/api/continue_interview', {
      thread_id: threadId,
      message: userMessage
    });
    console.log('continue_interview 응답:', response.data);
    if (!response.data || !response.data.response) {
      console.error('잘못된 응답 형식:', response.data);
      throw new Error('서버에서 올바른 응답을 받지 못했습니다');
    }
    return response.data.response;
  } catch (error) {
    console.error('continueInterview 오류:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios 오류 상세:', error.response?.data);
      console.error('Axios 오류 상태:', error.response?.status);
      console.error('Axios 오류 헤더:', error.response?.headers);
    }
    throw new Error('인터뷰를 계속할 수 습니다: ' + (error as Error).message);
  }
}

export async function endInterview(threadId: string): Promise<string> {
  if (!threadId) {
    throw new Error('유효한 threadId가 제공되지 않았습니다');
  }
  try {
    const response = await axios.post('/api/end_interview', {
      thread_id: threadId
    });
    return response.data.message;
  } catch (error) {
    console.error('Error in endInterview:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', error.response?.data);
    }
    throw new Error('Failed to end interview');
  }
}
