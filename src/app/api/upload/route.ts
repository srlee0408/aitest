import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import stream from 'stream';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as Blob;
    const phoneNumber = formData.get('phoneNumber') as string;

    if (!file) {
      return NextResponse.json({ error: '파일이 업로드되지 않았습니다' }, { status: 400 });
    }

    if (!phoneNumber) {
      return NextResponse.json({ error: '전화번호가 제공되지 않았습니다' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}_${phoneNumber}.webm`;

    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'video/webm',
        parents: ['폴더ID'], // 여기에 원하는 폴더의 ID를 넣습니다.
      },
      media: {
        mimeType: 'video/webm',
        body: bufferStream,
      },
    });

    const fileId = response.data.id;
    const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;

    return NextResponse.json({ fileUrl });
  } catch (error) {
    console.error('파일 업로드 중 오류 발생:', error);
    return NextResponse.json({ error: '파일 업로드에 실패했습니다' }, { status: 500 });
  }
}
