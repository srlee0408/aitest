'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { checkPhoneNumberWithWebhook } from '@/lib/db'
import { startInterview, continueInterview, endInterview } from '@/lib/gptAssistant'
import { textToSpeech, playAudio } from '@/lib/elevenlabs'
import axios from 'axios'
import { sendInterviewHistory } from '@/lib/db'
import { useInterview } from '../contexts/InterviewContext'

// 타입 정의 추가
interface SpeechRecognition extends EventTarget {
  start: () => void
  stop: () => void
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: (event: SpeechRecognitionEvent) => void
  onerror: (event: SpeechRecognitionErrorEvent) => void
  onstart: () => void
  onend: () => void
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
  item(index: number): SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
  item(index: number): SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

// window 객체에 SpeechRecognition 속성 추가
declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition
    }
    webkitSpeechRecognition: {
      new (): SpeechRecognition
    }
    webkitAudioContext: typeof AudioContext
  }
}

export default function Home() {
  const { threadId, setThreadId } = useInterview()
  const threadIdRef = useRef<string | null>(null)
  const [number, setNumber] = useState('')
  const [interviewState, setInterviewState] = useState('idle')
  const [interviewMessage, setInterviewMessage] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isGPTSpeaking, setIsGPTSpeaking] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasMicPermission, setHasMicPermission] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [showEndPopup, setShowEndPopup] = useState(false)
  const [interviewHistory, setInterviewHistory] = useState<string>('')
  let silenceTimer: NodeJS.Timeout | null = null
  const SILENCE_THRESHOLD = 1500 // 1.5초

  useEffect(() => {
    threadIdRef.current = threadId
    console.log('threadId가 변경됨:', threadIdRef.current)
  }, [threadId])

  const requestMicrophonePermission = useCallback(async () => {
    if (hasMicPermission) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setHasMicPermission(true)
      return stream
    } catch (error) {
      console.error('마이크 권한 요청 실패:', error)
      setErrorMessage('마이크 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.')
      setHasMicPermission(false)
      return null
    }
  }, [hasMicPermission])

  useEffect(() => {
    requestMicrophonePermission()
    return () => {
      if (silenceTimer) clearTimeout(silenceTimer)
    }
  }, [requestMicrophonePermission])

  const startRecording = useCallback(async () => {
    console.log('녹음 시작 중...')
    console.log('startRecording 함수 호출 시 threadId:', threadIdRef.current)

    if (!threadIdRef.current) {
      console.error('threadId가 설정되지 않았습니다.')
      setErrorMessage('면접 세션이 올바르게 시작되지 않았습니다. 다시 시도해 주세요.')
      setInterviewState('idle')
      return
    }

    if (!hasMicPermission) {
      const stream = await requestMicrophonePermission()
      if (!stream) return
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.lang = 'ko-KR'
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const currentTranscript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('')

        console.log('실시간 음성 인식 결과:', currentTranscript)
        setTranscript(currentTranscript)

        if (silenceTimer) clearTimeout(silenceTimer)
        silenceTimer = setTimeout(() => {
          if (currentTranscript.trim() !== '') {
            sendAudioToServer(currentTranscript)
          }
        }, SILENCE_THRESHOLD)

        if (event.results[event.results.length - 1].isFinal) {
          if (currentTranscript.trim() !== '') {
            sendAudioToServer(currentTranscript)
          }
        }
      }

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('음성 인식 오류:', event.error)
      }

      recognitionRef.current.onend = () => {
        if (silenceTimer) clearTimeout(silenceTimer)
        console.log('음성 인식이 종료되었습니다.')
      }

      recognitionRef.current.start()
      console.log('음성 인식이 시작되었습니다.')
      setIsRecording(true)
    } catch (error) {
      console.error('Error starting recording:', error)
      setErrorMessage('녹음을 시작하는 중 오류가 발생했습니다.')
    }
  }, [hasMicPermission, requestMicrophonePermission, setErrorMessage, setInterviewState])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
      console.log('녹음이 중지되었습니다.')
    }
  }, [])

  const handleContinueInterview = useCallback(async (userMessage: string) => {
    try {
      if (!threadIdRef.current) throw new Error('threadId가 설정되지 않았습니다.')

      setIsGPTSpeaking(true)
      stopRecording()
      console.log('GPT에 전송된 메시지:', userMessage)

      const aiResponse = await continueInterview(userMessage, threadIdRef.current)
      setInterviewHistory(prev => prev + `면접관: ${aiResponse}\n`)
      setInterviewMessage(aiResponse)

      const audioBuffer = await textToSpeech(aiResponse)
      await playAudio(audioBuffer)

      if (aiResponse.includes("수고하셨습니다.")) {
        setInterviewState('ended')
        setShowEndPopup(true)
      } else {
        setIsGPTSpeaking(false)
        setTimeout(startRecording, 1000)
      }
    } catch (error) {
      console.error('Error in handleContinueInterview:', error)
      setInterviewMessage("죄송합니다. 기술적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.")
      setIsGPTSpeaking(false)
      setTimeout(startRecording, 1000)
    }
  }, [stopRecording, setInterviewHistory, setInterviewMessage, setInterviewState, setShowEndPopup, startRecording])

  const sendAudioToServer = useCallback(async (text: string) => {
    console.log('sendAudioToServer, GPT에 보내려는 텍스트:', text)

    if (!threadIdRef.current) {
      setErrorMessage('면접 세션이 올바르게 시작되지 않았습니다. 다시 시도해 주세요.')
      setInterviewState('idle')
      return
    }

    if (text.trim() !== '') {
      try {
        await handleContinueInterview(text)
      } catch (error) {
        console.error('Error sending text to server:', error)
        setErrorMessage('텍스트를 서버로 전송하는 중 오류가 발생했습니다.')
      }
    }
  }, [setErrorMessage, setInterviewState, handleContinueInterview])

  const handleConfirm = async () => {
    if (number.length === 11) {
      try {
        const isValidNumber = await checkPhoneNumberWithWebhook(number)
        if (isValidNumber) {
          if (hasMicPermission) {
            setInterviewState('interviewing')
            try {
              const { threadId: newThreadId, message } = await startInterview()
              setThreadId(newThreadId)
              threadIdRef.current = newThreadId
              setInterviewMessage(message)
              await speakText(message)
              setTimeout(startRecording, 1000)
            } catch (error) {
              console.error('Error starting interview:', error)
              setErrorMessage('면접을 시작하는 중 오류가 발생했습니다. 다시 시도해 주세요.')
              setInterviewState('idle')
            }
          } else {
            setErrorMessage('마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용한 후 다시 시도해주세요.')
          }
        } else {
          setErrorMessage('등록되지 않은 전화번호입니다.')
        }
      } catch (error) {
        console.error('Error checking phone number:', error)
        setErrorMessage('전화번호 확인 중 오류가 발생했습니다. 다시 시도해 주세요.')
      }
    } else {
      setErrorMessage('올바른 11자리 번호를 입력해주세요.')
    }
  }

  const speakText = async (text: string) => {
    try {
      const response = await axios.post('/api/text_to_speech', { text }, { responseType: 'arraybuffer' })
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContext.decodeAudioData(response.data)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start(0)
      return new Promise<void>((resolve) => {
        source.onended = () => {
          audioContext.close()
          resolve()
        }
      })
    } catch (error) {
      console.error('Error in speakText:', error)
      setErrorMessage('음성 합성 중 오류 발생했습니다.')
    }
  }

  const addDigit = (digit: string) => {
    if (number.length < 11 && /^\d$/.test(digit)) {
      setNumber(prevNumber => prevNumber + digit)
    }
  }

  const deleteDigit = () => {
    setNumber(prevNumber => prevNumber.slice(0, -1))
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden p-8">
        <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">AI 면접 프로그램</h1>
        {interviewState === 'idle' && (
          <>
            <p className="text-xl text-center mb-4 text-gray-600">전화번호를 입력해주세요</p>
            <div className="bg-gray-100 rounded-2xl shadow-inner p-4 mb-6">
              <input
                type="text"
                value={number}
                readOnly
                className="w-full text-4xl text-center font-bold focus:outline-none bg-transparent placeholder:text-2xl"
                placeholder="여기에 번호가 표시됩니다"
              />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[...Array(10)].map((_, i) => (
                <Button
                  key={i}
                  onClick={() => addDigit(i.toString())}
                  className="w-full h-16 rounded-xl text-3xl font-bold bg-blue-500 hover:bg-blue-600 focus:ring-2 focus:ring-blue-400 focus:outline-none text-white shadow-lg"
                >
                  {i}
                </Button>
              ))}
              <Button
                onClick={deleteDigit}
                className="w-full h-16 rounded-xl text-2xl font-bold bg-red-500 hover:bg-red-600 focus:ring-2 focus:ring-red-400 focus:outline-none text-white shadow-lg"
              >
                지우기
              </Button>
            </div>
            <div className="flex justify-center">
              <Button
                onClick={handleConfirm}
                className="w-full py-4 rounded-xl text-2xl font-bold bg-green-500 hover:bg-green-600 focus:ring-2 focus:ring-green-400 focus:outline-none text-white shadow-lg"
              >
                확인
              </Button>
            </div>
          </>
        )}
        {interviewState === 'interviewing' && (
          <>
            <p className="text-xl text-center mb-4 text-gray-600">{interviewMessage}</p>
            {isGPTSpeaking && (
              <div className="flex justify-center items-center mb-4">
                <div className="animate-pulse bg-blue-500 rounded-full h-4 w-4 mr-2"></div>
                <p className="text-blue-500 font-semibold">AI 응답 중...</p>
              </div>
            )}
            {isRecording && !isGPTSpeaking && (
              <div className="flex justify-center items-center mb-4">
                <div className="animate-pulse bg-red-500 rounded-full h-4 w-4 mr-2"></div>
                <p className="text-red-500 font-semibold">지금 대답해주세요...</p>
              </div>
            )}
          </>
        )}
        {interviewState === 'ended' && (
          <p className="text-xl text-center mb-4 text-gray-600">{interviewMessage}</p>
        )}
        {!hasMicPermission && (
          <p className="text-yellow-500 text-center mt-4">마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.</p>
        )}
        {errorMessage && (
          <p className="text-red-500 text-center mt-4">{errorMessage}</p>
        )}
        {showEndPopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-4">면접 종료</h2>
              <p>면접이 종료되었습니다. 수고하셨습니다.</p>
              <button
                onClick={() => setShowEndPopup(false)}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                확인
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
