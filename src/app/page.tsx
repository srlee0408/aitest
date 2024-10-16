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
  onspeechstart: () => void;
  onstart: () => void;
  onend: () => void;
  // 필요에 따라 더 많은 속성과 메서드를 추가할 수 있습니다.
}

// SpeechRecognitionEvent 인터페이스 추가
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

// SpeechRecognitionResultList 인터페이스 수정
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null); // null은 아직 확인되지 않은 상태를 의미
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [interviewHistory, setInterviewHistory] = useState<string>('');
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [audioContextInitialized, setAudioContextInitialized] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);

  useEffect(() => {
    threadIdRef.current = threadId;
    console.log('threadId가 변경됨:', threadIdRef.current);
  }, [threadId]);

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    };
    setIsMobile(checkMobile());
    console.log('isMobile', isMobile);
  }, []);

  const initializeAudioContext = useCallback(() => {
    if (!audioContextInitialized) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      new AudioContext();
      setAudioContextInitialized(true);
    }
  }, [audioContextInitialized]);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasMicPermission(true);
      setAudioStream(stream);
      return stream;
    } catch (error) {
      console.error('마이크 권한 요청 실패:', error);
      setErrorMessage('마이크 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
      setHasMicPermission(false);
      return null;
    }
  }, []);

  const requestCameraPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setHasCameraPermission(true);
      console.log('videoRef.current',videoRef.current);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('카메라 권한 요청 실패:', error);
      setErrorMessage('카메라 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.');
      setHasCameraPermission(false);
      return null;
    }
  }, [setErrorMessage]);

  useEffect(() => {
    const checkSpeechRecognitionSupport = () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setErrorMessage('이 브라우저는 음성 인식을 지원하지 않습니다. 다른 브라우저를 사용해 주세요.');
      }
    };

    checkSpeechRecognitionSupport();
    requestMicrophonePermission();
    requestCameraPermission();
  }, [requestMicrophonePermission, requestCameraPermission]);

  const initializeSpeechRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('SpeechRecognition is not supported in this browser');
      setErrorMessage('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      setCurrentTranscript(transcript);
      console.log('Transcript:', transcript);
      if (checkInterviewEnd(transcript)) {
        setInterviewMessage(transcript);  
        setInterviewState('ended');
        sendInterviewHistoryToWebhook(); 
        stopWebcam();
      } else {
        setInterviewHistory(prev => prev + `면접관: ${transcript}\n`);
      }
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error);
      setErrorMessage(`음성 인식 오류: ${event.error}`);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    console.log('Speech recognition initialized');
  }, [setErrorMessage]);

  const startRecording = useCallback(() => {
    if (!recognitionRef.current) {
      initializeSpeechRecognition();
    }
    if (recognitionRef.current && !isAISpeaking) {
      recognitionRef.current.start();
      setIsRecording(true);
      console.log('음성 인식 시작');
    } else {
      console.error('음성 인식을 시작할 수 없습니다.');
    }
  }, [isAISpeaking, initializeSpeechRecognition]);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      console.log('음성 인식 종료');
      
      if (currentTranscript.trim() && threadIdRef.current) {
        try {
          const response = await continueInterview(currentTranscript, threadIdRef.current);
          setInterviewMessage(response);
          await speakText(response);

        } catch (error) {
          console.error('Error sending user response to GPT:', error);
          setErrorMessage('응답 처리 중 오류가 발생했습니다.');
        }
      }
      setCurrentTranscript('');
    }
  }, [currentTranscript, startRecording, continueInterview, setInterviewMessage, setErrorMessage]);

  const checkInterviewEnd = useCallback((response: string): boolean => {
    return response.includes("답변해주셔서 감사합니다. 이로써 면접이 종료되었습니다.");
  }, []);

  const handleConfirm = async () => {
    if (number.length === 11) {
      try {
        const isValidNumber = await checkPhoneNumberWithWebhook(number);
        if (isValidNumber) {
          if (hasMicPermission && hasCameraPermission) {
            setInterviewState('interviewing');
            setErrorMessage('');
            try {
              const { threadId: newThreadId, message } = await startInterview();
              setThreadId(newThreadId);
              threadIdRef.current = newThreadId;
              setInterviewMessage(message);
              await speakText(message);
              console.log('AI 음성 출력 완료. 사용자 응답 대기 중...');
              // 웹캠 시작
              startWebcam();
              console.log('웹캠 시작');
              console.log('startRecording 호출 완료');
            } catch (error) {
              console.error('Error starting interview:', error);
              setErrorMessage('면접을 시작하는 중 오류가 발생했습니다. 다시 시도해 주세요.');
              setInterviewState('idle');
            }
          } else {
            setErrorMessage('마이크와 카메라 권한이 필요합니다. 브라우저 설정에서 권한을 허용한 후 다시 시도해세요.');
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
      setIsAISpeaking(true);
      initializeAudioContext();
      const response = await axios.post('/api/text_to_speech', { text }, { responseType: 'arraybuffer' })
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const audioBuffer = await audioContext.decodeAudioData(response.data)
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContext.destination)
      source.start(0)
      console.log('speakText', response.data)
      return new Promise<void>((resolve) => {
        source.onended = () => {
          setIsAISpeaking(false);
          resolve()
        }
      })
    } catch (error) {
      console.error('Error in speakText:', error)
      setErrorMessage('음성 합성 중 오류 발생했습니다.')
      setIsAISpeaking(false);
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

  // 컴포넌트가 언마운트될 때 타이머를 정리합니다.
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);
  //웹켐 시작
  const startWebcam = useCallback(async () => {
    try {
      console.log('웹캠 시작 시도...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      console.log('웹캠 스트림 획득 성공:', stream);
  
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('비디오 요소에 스트림 설정 완료');
  
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            console.log('웹캠 비디오 재생 시작');
            setShowWebcam(true);
          }).catch(error => {
            console.error('웹캠 비디오 재생 실패:', error);
          });
        };
      } else {
        console.error('비디오 요소가 없습니다. 5초 후 재시도합니다.');
        setTimeout(startWebcam, 5000);  // 5초 후 재시도
      }
    } catch (error) {
      console.error('웹캠 시작 오류:', error);
      setErrorMessage('웹캠을 시작할 수 없습니다. 권한을 확인해주세요.');
    }
  }, [setErrorMessage]);

  const stopWebcam = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    setShowWebcam(false);
    console.log('웹캠 중지됨');
  }, []);

  useEffect(() => {
    initializeSpeechRecognition();
  }, [initializeSpeechRecognition]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="max-w-4xl w-full bg-white rounded-3xl shadow-xl overflow-hidden p-8">
        <h1 className="text-4xl font-bold text-center mb-6 text-gray-800">AI 면접 프로그램</h1>
        <div className={`mb-6 relative w-full h-48 bg-black ${showWebcam ? '' : 'hidden'}`}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-0 left-0 w-full h-full object-contain"
            onError={(e) => console.error('비디오 요소 오류:', e)}
          />
        </div>

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
            <p className="text-3xl text-left mb-10 text-gray-600 leading-relaxed">
              {interviewMessage.split('.').join('.\n')}
            </p>
            {isAISpeaking ? (
              <div className="flex justify-center items-center mb-4">
                <div className="animate-pulse bg-blue-500 rounded-full h-4 w-4 mr-2"></div>
                <p className="text-blue-500 text-3xl font-semibold">AI 응답 중...</p>
              </div>
            ) : (
              <>
                {isRecording && (
                  <div className="flex flex-col items-center mb-4">
                    <div className="flex items-center mb-2">
                      <div className="animate-pulse bg-red-500 rounded-full h-4 w-4 mr-2"></div>
                      <p className="text-red-500 text-3xl font-semibold">지금 대답해주세요...</p>
                    </div>
                    <div className="w-full bg-gray-100 rounded-lg p-3 mt-2 text-2xl mb-10 text-gray-600 leading-relaxed">
                      <p className="text-gray-600">{currentTranscript}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-row justify-center space-x-4 mb-5">
                  <Button
                    onClick={startRecording}
                    disabled={isRecording || isAISpeaking}
                    className="w-48 h-16 text-4xl bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                  >
                    답변 시작
                  </Button>
                  <Button
                    onClick={stopRecording}
                    disabled={!isRecording || isAISpeaking}
                    className="w-48 h-16 text-4xl bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                  >
                    답변 종료
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        
        {interviewState === 'ended' && (
          <p className="text-xl text-left text-4xl mb-4 text-gray-600">{interviewMessage}</p>
        )}
        
        {errorMessage && errorMessage !== '마이크 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주세요.' && (
          <p className="text-red-500 text-center mt-4">{errorMessage}</p>
        )}
      </div>
    </main>
  )
}
