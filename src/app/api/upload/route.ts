import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

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
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
    const fileName = `${date}_${phoneNumber}.mp4`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadDir, fileName);

    // 디렉토리가 없으면 생성
    await mkdir(uploadDir, { recursive: true });

    await writeFile(filePath, buffer);

    // 상대 URL 경로 생성
    const fileUrl = `/uploads/${fileName}`;

    return NextResponse.json({ fileUrl });
  } catch (error) {
    console.error('파일 업로드 중 오류 발생:', error);
    return NextResponse.json({ error: '파일 업로드에 실패했습니다' }, { status: 500 });
  }
}
