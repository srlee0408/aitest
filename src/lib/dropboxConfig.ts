import { Dropbox } from 'dropbox';
import { getEnvVariables } from './env';

let dropbox: Dropbox;

const { DROPBOX_ACCESS_TOKEN } = getEnvVariables();

// 클라이언트 사이드에서만 Dropbox 인스턴스를 생성
if (typeof window !== 'undefined') {
  dropbox = new Dropbox({ 
    accessToken: DROPBOX_ACCESS_TOKEN,
    fetch: fetch.bind(window)
  });
} else {
  // 서버 사이드에서는 기본 fetch 사용
  dropbox = new Dropbox({ 
    accessToken: DROPBOX_ACCESS_TOKEN
  });
}

export default dropbox;
