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
  },
}

module.exports = nextConfig
