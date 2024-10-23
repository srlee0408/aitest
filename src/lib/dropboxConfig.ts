import { Dropbox } from 'dropbox';

const dropbox = new Dropbox({ 
  accessToken: process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN,
  fetch: fetch.bind(window) // fetch 함수의 컨텍스트를 window로 바인딩
});

export default dropbox;
