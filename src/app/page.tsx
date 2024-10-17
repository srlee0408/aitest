  'use client'

  import React, { useState, useEffect, useRef, useCallback } from 'react'
  import { Button } from '@/components/ui/button'
  import { checkPhoneNumberWithWebhook } from '@/lib/db'
  import { startInterview, continueInterview, endInterview } from '@/lib/gptAssistant'
  import { textToSpeech, playAudio } from '@/lib/elevenlabs'
  import axios from 'axios'
  import { sendInterviewHistory } from '@/lib/db'
  import { useInterview } from '../contexts/InterviewContext';

  // SpeechRecognition 타입 정의 추가
  interface SpeechRecognition extends EventTarget {
    start: () => void;
    stop: () => void;
    abort: () => void;
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onstart: () => void;
    onend: () => void;
    // 필요에 따라 더 많은 속성과 메서드를 추가할 수 있습니다.
  }

  // SpeechRecognitionEvent 인터페이스 추가
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }

  // SpeechRecognitionResultList 인페이스 수정
  interface SpeechRecognitionResultList {
    readonly length: number;
    [index: number]: SpeechRecognitionResult;
    item(index: number): SpeechRecognitionResult;
  }

  // SpeechRecognitionResult 인터페이스 수정
  interface SpeechRecognitionResult {
    readonly length: number;
    [index: number]: SpeechRecognitionAlternative;
    item(index: number): SpeechRecognitionAlternative;
    isFinal: boolean; // 이 줄을 추가
  }

  // SpeechRecognitionAlternative 인터페이스 추가
  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }

  // SpeechRecognitionErrorEvent 인터페이스 추가
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }

  // window 객체에 SpeechRecognition 속성 추가
  declare global {
    interface Window {
      SpeechRecognition: {
        new (): SpeechRecognition;
      };
      webkitSpeechRecognition: {
        new (): SpeechRecognition;
      };
    }
  }

  // 파일 상단에 다음 타입 선언을 추가합니다
  declare global {
    interface Window {
      webkitAudioContext: typeof AudioContext
    }
  }

  export default function Home() {
    const {threadId, setThreadId } = useInterview();
    const threadIdRef = useRef<string | null>(null);
    const [number, setNumber] = useState('')
    const [interviewState, setInterviewState] = useState('idle')
    const [interviewMessage, setInterviewMessage] = useState('')
    const [isRecording, setIsRecording] = useState(false)
    const [transcript, setTranscript] = useState('')
    const [isGPTSpeaking, setIsGPTSpeaking] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [intervieweeId, setIntervieweeId] = useState<number | null>(null)
    const [questionNumber, setQuestionNumber] = useState(0)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const audioChunksRef = useRef<Blob[]>([])
    const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const [showEndPopup, setShowEndPopup] = useState(false);
    const [interviewHistory, setInterviewHistory] = useState<string>('');
    const beepAudioRef = useRef<HTMLAudioElement | null>(null);
    let silenceTimer: NodeJS.Timeout | null = null;
    const SILENCE_THRESHOLD = 1500; // 1.5초
    const [audioContextInitialized, setAudioContextInitialized] = useState(false);
    const [currentTranscript, setCurrentTranscript] = useState('');
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

    useEffect(() => {
      threadIdRef.current = threadId;
      console.log('threadId가 변경됨:', threadIdRef.current);
    }, [threadId]);

    const initializeAudioContext = useCallback(() => {
      if (!audioContextInitialized) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        new AudioContext();
        setAudioContextInitialized(true);
      }
    }, [audioContextInitialized]);

    const checkMicrophonePermission = useCallback(async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'granted') {
          setHasMicPermission(true);
          return true;
        } else if (result.state === 'prompt') {
          // 권한 요청이 필요한 상태
          return null;
        } else {
          setHasMicPermission(false);
          return false;
        }
      } catch (error) {
        console.error('마이크 권한 확인 실패:', error);
        return null;
      }
    }, []);

    const requestMicrophonePermission = useCallback(async () => {
      const permissionStatus = await checkMicrophonePermission();
      if (permissionStatus === true) return true; // 이미 권한이 있는 경우
      if (permissionStatus === false) return false; // 권한이 명시적으로 거부된 경우

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setHasMicPermission(true);
        setAudioStream(stream);
        return true;
      } catch (error) {
        console.error('마이크 권한 요청 실패:', error);
        setHasMicPermission(false);
        return false;
      }
    }, [checkMicrophonePermission]);

    useEffect(() => {
      const checkPermission = async () => {
        const result = await checkMicrophonePermission();
        if (result === null) {
          // 권한 상태가 'prompt'인 경우, 사용자 상호작용 시 권한을 요청합니다.
          const button = document.createElement('button');
          button.textContent = '마이크 권한 요청';
          button.onclick = async () => {
            await requestMicrophonePermission();
            button.remove();
          };
          document.body.appendChild(button);
        }
      };
      checkPermission();
    }, [checkMicrophonePermission, requestMicrophonePermission]);

    const startRecording = useCallback(async () => {
      if (!hasMicPermission) {
        const granted = await requestMicrophonePermission();
        if (!granted) {
          setErrorMessage('마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
          return;
        }
      }

      console.log('녹음 시작 중...');
      if (!threadIdRef.current) {
        console.error('threadId가 설정되지 않았습니다.');
        setErrorMessage('면접 세션이 올바르게 시작되지 않았습니다. 다시 시도해 주세요.');
        setInterviewState('idle');
        return;
      }

      initializeAudioContext();

      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.lang = 'ko-KR';
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;

        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          const currentTranscript = Array.from(event.results)
            .map(result => result[0].transcript)
            .join('');
          
          console.log('실시간 음성 인식 결과 & threadid', currentTranscript, threadIdRef.current);
          setCurrentTranscript(currentTranscript);

          // 타이머 재설정
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            console.log('침묵 감지, 현재 텍스트 전송');
            if (currentTranscript.trim() !== '') {
              sendAudioToServer(currentTranscript);
              setCurrentTranscript(''); // 전송 후 현재 트랜스크립트 초기화
            }
          }, SILENCE_THRESHOLD);

          // 최종 결과 처리
          if (event.results[event.results.length - 1].isFinal) {
            console.log('발화 종료 감지, GPT에 전송 준비');
            if (currentTranscript.trim() !== '') {
              sendAudioToServer(currentTranscript);
              setCurrentTranscript(''); // 전송 후 현재 트랜스크립트 초기화
            } else {
              console.log('인식된 텍스트가 비어있어 GPT에 전송하지 않습니다.');
            }
          }
        };

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error('음성 인식 오류:', event.error);
        };

        recognitionRef.current.onend = () => {
          console.log('음성 인식이 종료되었습니다.');
          if (silenceTimer) clearTimeout(silenceTimer);
        };

        recognitionRef.current.start();
        console.log('음성 인식이 시작되었습니다.');
        setIsRecording(true);
      } catch (error) {
        console.error('Error starting recording:', error);
        setErrorMessage('녹음을 시작하는 중 오류가 발생했습니다.');
      }
    }, [hasMicPermission, requestMicrophonePermission, setErrorMessage, setInterviewState, initializeAudioContext]);

    const stopRecording = useCallback(() => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsRecording(false);
        console.log('Recording stopped');
      } else {
        console.log('SpeechRecognition is not active');
      }
    }, []);

    const checkInterviewEnd = useCallback((response: string): boolean => {
      return response.includes("수고하셨습니다.");
    }, []);

    const handleContinueInterview = useCallback(async (userMessage: string) => {
      try {
        if (!threadIdRef.current) {
          throw new Error('threadId가 설정되지 않았습니다.');
        }
        
        setIsGPTSpeaking(true);
        stopRecording(); // 녹음 중지
        console.log('GPT에 전송된 메시지:', userMessage);
        console.log('handleContinueInterview 사용 중인 threadId:', threadIdRef.current);

        const aiResponse = await continueInterview(userMessage, threadIdRef.current);
        console.log('handleContinueInterview GPT 응답:', aiResponse);

        // AI 응답을 히스토리에 추가
        setInterviewHistory(prev => prev + `면접관: ${aiResponse}\n`);
        setInterviewMessage(aiResponse);

        // 음성 변환 및 재생
        const audioBuffer = await textToSpeech(aiResponse);
        await playAudio(audioBuffer);

        if (checkInterviewEnd(aiResponse)) {
          setInterviewState('ended');
          setShowEndPopup(true);
        } else {
          setIsGPTSpeaking(false);
          console.log('Starting recording after AI response...');
          setTimeout(startRecording, 1000); // AI 응답 재생 후 1초 뒤에 녹음 시작
        }
      } catch (error) {
        console.error('Error in handleContinueInterview:', error);
        setInterviewMessage("죄송합니다. 기술적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        setIsGPTSpeaking(false);
        setTimeout(startRecording, 1000); // 오류 발생 시에도 1초 후 녹음 시작
      }
    }, [setIsGPTSpeaking, stopRecording, setInterviewHistory, setInterviewMessage, setInterviewState, setShowEndPopup, startRecording, textToSpeech, playAudio, checkInterviewEnd, continueInterview]);

    const sendAudioToServer = useCallback(async (text: string) => {
      console.log('sendAudioToServer, GPT에 보내려는 텍스트:', text);
      console.log('sendAudioToServer 함수 호출 시 threadId:', threadIdRef.current);

      if (!threadIdRef.current) {
        console.error('threadId가 설정되지 않았습니다.');
          setErrorMessage('면접 세션이 올바르게 시작되지 않았습니다. 다시 시도해 주세요.');
          setInterviewState('idle');
          return;
        }
            
      if (text.trim() !== '') {
        try {
          if (!threadIdRef.current) {
            console.error('threadId is null or undefined in sendAudioToServer');
            setErrorMessage('면접 세션이 올바르게 시작되지 않았습니다. 다시 시도해 주세요.');
            setInterviewState('idle');
            return;
          }
          await handleContinueInterview(text);
        } catch (error) {
          console.error('Error sending text to server:', error);
          setErrorMessage('텍스트를 서버로 전송하는 중 오류가 발생했습니다.');
        }
      } else {
        console.log('텍스트가 비어있어 GPT에 전송하지 않습니다.');
      }
    }, [setErrorMessage, setInterviewState, handleContinueInterview, threadIdRef]);

    const handleConfirm = async () => {
      if (number.length === 11) {
        try {
          const isValidNumber = await checkPhoneNumberWithWebhook(number);
          if (isValidNumber) {
            if (hasMicPermission) {
              setInterviewState('interviewing');
              setErrorMessage('');
              try {
                const { threadId: newThreadId, message } = await startInterview();
                setThreadId(newThreadId);
                threadIdRef.current = newThreadId;
                setInterviewMessage(message);
                await speakText(message);
                console.log('AI 음성 출력 완료. 사용자 응답 대기 중...');
                // 자동으로 녹음 시작
                startRecording();
              } catch (error) {
                console.error('Error starting interview:', error);
                setErrorMessage('면접을 시작하는 중 오류가 발생했습니다. 다시 시도해 주세요.');
                setInterviewState('idle');
              }
            } else {
              setErrorMessage('마이크 권한이 필요합니다. 브라우저 설정에서 권한을 허용한 후 다시 시도해세요.');
            }
          } else {
            setErrorMessage('등록되지 않은 전화번호입니다.');
          }
        } catch (error) {
          console.error('Error checking phone number:', error);
          setErrorMessage('전화번호 확인 중 오류가 발생했습니다. 다시 시도해 주세요.');
        }
      } else {
        setErrorMessage('올바른 11자리 번호를 입력해주세요.');
      }
    };

    const closeEndPopup = () => {
      setShowEndPopup(false);
      sendInterviewHistoryToWebhook();
    }

    const sendInterviewHistoryToWebhook = async () => {
      if (number && interviewHistory) {
        console.log('면접 히스토리 전송 시도 중...');
        try {
          const success = await sendInterviewHistory(number, interviewHistory);
          console.log('sendInterviewHistory 결과:', success);
          if (success) {
            console.log('면접 기록이 성공적으로 저장되었습니다.');
            setInterviewMessage(prevMessage => prevMessage + "\n면접 기록이 성공적으로 저장되었습니다.");
          } else {
            console.error('면접 기록 저장에 실패했습니다.');
            setInterviewMessage(prevMessage => prevMessage + "\n면접 기록 저장에 실패했습니다. 관리자에게 문의해주세요.");
          }
        } catch (error) {
          console.error('면접 히스토리 전송 중 오류 발생:', error);
          setInterviewMessage(prevMessage => prevMessage + "\n면접 기록 저장 중 오류가 발생했습니다. 관리자에게 문의해주세요.");
        }
      } else {
        console.warn('전화번호 또는 면접 히스토리가 비어 있어 히스토리를 전송하지 않았습니다.');
      }
    };

    const speakText = async (text: string) => {
      try {
        initializeAudioContext();
        const response = await axios.post('/api/text_to_speech', { text }, { responseType: 'arraybuffer' })
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await audioContext.decodeAudioData(response.data)
        const source = audioContext.createBufferSource()
        source.buffer = audioBuffer
        source.connect(audioContext.destination)
        source.start(0)
        return new Promise<void>((resolve) => {
          source.onended = () => {
            resolve()
          }
        })
      } catch (error) {
        console.error('Error in speakText:', error)
        setErrorMessage('음성 합성 중 오류 발생했습니다.')
      }
    }

    const addDigit = (digit: string) => {
      if (number.length < 11) {
        setNumber(prevNumber => prevNumber + digit)
      }
    }

    const deleteDigit = () => {
      setNumber(prevNumber => prevNumber.slice(0, -1))
    }
    const dialPad = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['*', '0', '#']
    ]

    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden p-8">
          <h1 className="text-3xl font-bold text-center mb-6 text-gray-800">AI 면접 프로그램</h1>
          
          {hasMicPermission === false && (
            <p className="text-yellow-500 text-center mt-4 mb-4">마이크 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.</p>
          )}

          {interviewState === 'idle' && (
            <>
              <p className="text-xl text-center mb-2 text-gray-600">전화번호를 입력해주세요.</p>
              <p className="text-xl text-center mb-4 text-gray-600">확인 버튼을 눌러주세요.</p>
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
                {dialPad.map((row, rowIndex) => (
                  <React.Fragment key={rowIndex}>
                    {row.map((digit) => (
                      <Button
                        key={digit}
                        onClick={() => addDigit(digit)}
                        className="w-full h-16 rounded-xl text-3xl font-bold bg-blue-500 hover:bg-blue-600 focus:ring-2 focus:ring-blue-400 focus:outline-none text-white shadow-lg"
                      >
                        {digit}
                      </Button>
                    ))}
                  </React.Fragment>
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
                <div className="flex flex-col items-center mb-4">
                  <div className="flex items-center mb-2">
                    <div className="animate-pulse bg-red-500 rounded-full h-4 w-4 mr-2"></div>
                    <p className="text-red-500 font-semibold">지금 대답해주세요...</p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-lg p-3 mt-2">
                    <p className="text-gray-600">{currentTranscript}</p>
                  </div>
                </div>
              )}
            </>
          )}
          {interviewState === 'ended' && (
            <p className="text-xl text-center mb-4 text-gray-600">{interviewMessage}</p>
          )}
          {errorMessage && errorMessage !== '마이크 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.' && (
            <p className="text-red-500 text-center mt-4">{errorMessage}</p>
          )}
          {showEndPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded-lg">
                <h2 className="text-xl font-bold mb-4">면접 종료</h2>
                <p>면접이 종료되었습니다. 수고하셨습니다.</p>
                <button
                  onClick={closeEndPopup}
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
