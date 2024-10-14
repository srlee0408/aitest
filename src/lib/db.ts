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

// 요청한 번호를 등록합니다.
registerPhoneNumber('01011111111');

// 등록된 번호 목록을 콘솔에 출력 (디버���용)
console.log('등록된 전화번호:', Array.from(registeredPhoneNumbers));
