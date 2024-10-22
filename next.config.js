/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // 다른 설정들...
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ASSISTANT_ID: process.env.ASSISTANT_ID,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    CHECK_PHONE_WEBHOOK_URL: process.env.CHECK_PHONE_WEBHOOK_URL,
    INTERVIEW_HISTORY_WEBHOOK_URL: process.env.INTERVIEW_HISTORY_WEBHOOK_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  },
  // 아래 설정 추가
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: '/public/uploads/:path*',
      },
    ]
  },
  api: {
    bodyParser: {
      sizeLimit: '5000mb', // 여기를 5000mb로 변경
    },
  },
}
module.exports = nextConfig
