// 이 파일은 실제 GPT API 연동 대신 간단한 모의 함수를 제공합니다.

import axios from 'axios';

let threadId: string | null = null;

export async function startInterview(): Promise<{ message: string; threadId: string }> {
  try {
    const response = await axios.post('/api/start_interview');
    console.log('Start interview response:', response.data);  // 응답 로깅
    if (!response.data || !response.data.thread_id) {
      throw new Error('Invalid response from server');
    }
    threadId = response.data.thread_id;
    return { message: response.data.message, threadId: threadId as string };
  } catch (error) {
    console.error('Error in startInterview:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', error.response?.data);
    }
    throw new Error('Failed to start interview');
  }
}

export async function continueInterview(userMessage: string): Promise<string> {
  if (!threadId) {
    throw new Error('Interview has not been started');
  }
  try {
    console.log('Sending request to continue_interview:', { threadId, userMessage });
    const response = await axios.post('/api/continue_interview', {
      thread_id: threadId,
      message: userMessage
    });
    console.log('Response from continue_interview:', response.data);
    return response.data.response;
  } catch (error) {
    console.error('Error in continueInterview:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', error.response?.data);
    }
    throw new Error('Failed to continue interview');
  }
}

export async function endInterview(): Promise<string> {
  if (!threadId) {
    throw new Error('Interview has not been started');
  }
  const response = await axios.post('/api/end_interview', {
    thread_id: threadId
  });
  threadId = null;
  return response.data.message;
}
