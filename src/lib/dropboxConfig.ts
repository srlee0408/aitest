import { Dropbox } from 'dropbox';

let dropbox: Dropbox;

// 클라이언트 사이드에서만 Dropbox 인스턴스를 생성
if (typeof window !== 'undefined') {
  dropbox = new Dropbox({ 
    accessToken: process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN,
    fetch: fetch.bind(window)
  });
} else {
  // 서버 사이드에서는 기본 fetch 사용
  dropbox = new Dropbox({ 
    accessToken: process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN
  });
}

export default dropbox;
