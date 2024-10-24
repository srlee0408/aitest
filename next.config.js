/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_DROPBOX_ACCESS_TOKEN,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ASSISTANT_ID: process.env.ASSISTANT_ID,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    CHECK_PHONE_WEBHOOK_URL: process.env.CHECK_PHONE_WEBHOOK_URL,
    INTERVIEW_HISTORY_WEBHOOK_URL: process.env.INTERVIEW_HISTORY_WEBHOOK_URL,
  },
}
module.exports = nextConfig
