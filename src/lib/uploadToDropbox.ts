import dropbox from './dropboxConfig';

export const uploadToDropbox = async (file: Blob, fileName: string): Promise<string> => {
  if (!file || file.size === 0) {
    throw new Error('유효하지 않은 파일입니다.');
  }

  try {
    // 파일 업로드
    const response = await dropbox.filesUpload({
      path: `/${fileName}`,
      contents: file, // Blob 직접 전달
      mode: { '.tag': 'add' },
      autorename: true
    });

    // 공유 링크 생성
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
      throw new Error(`Dropbox 업로드 실패: ${error.message}`);
    }
    throw new Error('Dropbox 업로드 중 알 수 없는 오류가 발생했습니다.');
  }
};
