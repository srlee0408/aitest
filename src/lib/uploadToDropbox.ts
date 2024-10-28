import { getDropboxClient } from './dropboxConfig';

export const uploadToDropbox = async (file: Blob, fileName: string): Promise<string> => {
  if (!file || file.size === 0) {
    throw new Error('유효하지 않은 파일입니다.');
  }

  try {
    const dropbox = await getDropboxClient();
    
    if (!dropbox) {
      throw new Error('Dropbox 인증 토큰이 없습니다.');
    }

    const response = await dropbox.filesUpload({
      path: `/${fileName}`,
      contents: file,
      mode: { '.tag': 'add' },
      autorename: true
    });

    const sharedLinkResponse = await dropbox.sharingCreateSharedLinkWithSettings({
      path: response.result.path_display as string,
      settings: {
        requested_visibility: { '.tag': 'public' },
        audience: { '.tag': 'public' },
        access: { '.tag': 'viewer' }
      }
    });

    return sharedLinkResponse.result.url;
  } catch (error) {
    console.error('Dropbox 업로드 오류:', error);
    if (error instanceof Error) {
      if (error.message.includes('401')) {
        throw new Error('Dropbox 인증 실패: 액세스 토큰을 확인하세요.');
      }
      throw new Error(`Dropbox 업로드 실패: ${error.message}`);
    }
    throw new Error('Dropbox 업로드 중 알 수 없는 오류가 발생했습니다.');
  }
};
