import axios from 'axios';
import { getEnvVariables } from './env';

// 이 함수는 실제 데이터베이스 연동 대신 간단한 모의 함수입니다.
export async function checkPhoneNumber(number: string): Promise<boolean> {
  // 실제 구현에서는 데이터베이스를 확인해야 합니다.
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(registeredPhoneNumbers.has(number));
    }, 1000); // 1초 지연을 주어 비동기 작업을 시뮬레이션합니다.
  });
}

// 전화번호를 저장할 Set 객체를 생성합니다.
const registeredPhoneNumbers = new Set<string>();

// 전화번호를 등록하는 함수
export function registerPhoneNumber(number: string): boolean {
  if (isValidPhoneNumber(number)) {
    registeredPhoneNumbers.add(number);
    return true;
  }
  return false;
}

// 전화번호 형식을 검증하는 함수
function isValidPhoneNumber(number: string): boolean {
  // 간단한 정규식을 사용하여 01로 시작하는 10-11자리 숫자인지 확인
  return /^01\d{8,9}$/.test(number);
}

// 웹훅에서 전화번호를 받는 함수
export async function getPhoneNumberFromWebhook(): Promise<string | null> {
  const { CHECK_PHONE_WEBHOOK_URL } = await getEnvVariables();
  try {
    const response = await axios.get(CHECK_PHONE_WEBHOOK_URL);
    const phoneNumber = response.data.trim(); // 받은 데이터에서 앞뒤 공백 제거

    console.log('웹훅에서 받은 전화번호:', phoneNumber);

    if (isValidPhoneNumber(phoneNumber)) {
      return phoneNumber;
    } else {
      console.log(`유효하지 않은 전화번호입니다: ${phoneNumber}`);
      return null;
    }
  } catch (error) {
    console.error('웹훅에서 전화번호를 가져오는 중 오류 발생:', error);
    return null;
  }
}

// 지원자가 확인을 누를 때 호출될 함수
export async function onApplicantConfirm() {
  console.log('지원자 확인 버튼이 눌렸습니다.');
  const phoneNumber = await getPhoneNumberFromWebhook();
  if (phoneNumber) {
    console.log(`유효한 전화번호를 받았습니다: ${phoneNumber}`);
    const isRegistered = await checkPhoneNumberWithWebhook(phoneNumber);
    if (isRegistered) {
      console.log('전화번호가 등록되었습니다.');
      startInterview(phoneNumber);
    } else {
      console.log('전화번호가 등록되지 않았습니다.');
    }
  } else {
    console.log('유효한 전화번호를 받지 못했습니다. 면접을 진행할 수 없습니다.');
  }
}

// 면접을 시작하는 함수 (예시)
function startInterview(phoneNumber: string) {
  console.log(`${phoneNumber} 번호로 면접을 시작합니다.`);
  // 기에 실제 면접 진행 로직을 구현하세요
}

// 등록된 번호 목록을 콘솔에 출력 (디버그용)
console.log('등록된 전화번호:', Array.from(registeredPhoneNumbers));

export async function checkPhoneNumberWithWebhook(phoneNumber: string): Promise<boolean> {
  const { CHECK_PHONE_WEBHOOK_URL } = await getEnvVariables();
  try {
    console.log('Checking phone number with webhook:', phoneNumber);
    const response = await axios.get(`${CHECK_PHONE_WEBHOOK_URL}?phoneNumber=${phoneNumber}`);
    console.log('Webhook response:', response.data);
    return response.data.isRegistered === true;
  } catch (error) {
    console.error('Error checking phone number:', error);
    return false;
  }
}

// 면접 히스토리를 웹훅으로 전송하는 함수
export const sendInterviewHistory = async (
  phoneNumber: string,
  transcript: string
): Promise<boolean> => {
  const { INTERVIEW_HISTORY_WEBHOOK_URL } = await getEnvVariables();
  console.log('sendInterviewHistory 함수 호출됨');
  console.log('전송할 데이터:', { phoneNumber, transcript });
  
  if (!INTERVIEW_HISTORY_WEBHOOK_URL) {
    console.error('INTERVIEW_HISTORY_WEBHOOK_URL이 설정되지 않았습니다.');
    return false;
  }

  try {
    console.log('Make 웹훅으로 POST 요청 전송 중...');
    const response = await axios.post(INTERVIEW_HISTORY_WEBHOOK_URL, {
      phoneNumber,
      transcript
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Make 응답:', response.data);
    console.log('Make 응답 상태:', response.status);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('면접 히스토리가 성공적으로 전송되었습니다.');
      return true;
    } else {
      console.error('Make 웹훅 오류: 예상치 못한 응답을 받았습니다.');
      return false;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Make 웹훅 요청 실패:', error.response?.data || error.message);
      console.error('에러 상세 정보:', error.toJSON());
    } else {
      console.error('알 수 없는 오류 발생:', error);
    }
    return false;
  }
};
