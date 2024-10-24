'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { checkPhoneNumberWithWebhook } from '@/lib/db'
import { startInterview, continueInterview, endInterview } from '@/lib/gptAssistant'
import axios from 'axios'
import { sendInterviewHistory } from '@/lib/db'
import { useInterview } from '../contexts/InterviewContext';
import { uploadToDropbox } from '@/lib/uploadToDropbox';

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

// 파일 상단에 다음 타입 선언을 추가합니다.
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
  const [isMobile, setIsMobile] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [showEndPopup, setShowEndPopup] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    // 모바일 기기 감지
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    };
    setIsMobile(checkMobile());
  }, []);

  const initializeAudioContext = useCallback(() => {
    if (typeof window !== 'undefined' && !audioContextInitialized) {
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
      //console.log('videoRef.current',videoRef.current);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      //console.error('카메라 권한 요 실패:', error);
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
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
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
      console.log('면접자 음성:', transcript);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      //console.error('Speech recognition error', event.error);
      setErrorMessage(`음성 인식 오류: ${event.error}`);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    console.log('Speech recognition initialized');
  }, [setErrorMessage]);

  const startRecording = useCallback(async () => {
    if (!recognitionRef.current) {
      initializeSpeechRecognition();
    }
    if (recognitionRef.current && !isAISpeaking) {
      recognitionRef.current.start();
      setIsRecording(true);
      console.log('음성 인식 시작');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            // 여기서 녹음된 데이터 처리
            console.log('녹음된 데이터:', event.data);
          }
        };

        if (isMobile) {
          mediaRecorder.start(1000); // 모바일에서는 1초마다 데이터 전송
          console.log('모바일 환경에서 MediaRecorder 시작 (1초 간격)');
          console.log('모바일 환경에서 음성 인식 시작',isMobile);
        } else {
          mediaRecorder.start(); // 데스크톱에서는 기본 설정 사용
          console.log('데스크톱 환경에서 MediaRecorder 시작');
        }
      } catch (error) {
        console.error('MediaRecorder 시작 오류:', error);
        setErrorMessage('음성 녹음을 시작할 수 없습니다.');
      }
    } else {
      console.error('음성 인식을 시작할 수 없습니다.');
    }
  }, [isAISpeaking, initializeSpeechRecognition, isMobile]);

  const checkInterviewEnd = useCallback((response: string): boolean => {
    return response.includes("면접이 종료되었습니다") || response.includes("면접을 마치겠습니다") || response.includes("수고하셨습니다.");
  }, []);

  const stopWebcam = useCallback(async () => {
    console.log('stopWebcam 호출됨');
    console.log('현재 녹화된 청크 수:', recordedChunks.length);

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0) {
          const newChunks = [...recordedChunks, event.data];
          console.log('최종 녹화 데이터 크기:', event.data.size);
          
          const blob = new Blob(newChunks, { 
            type: 'video/webm;codecs=vp8,opus' 
          });
          console.log('생성된 Blob 크기:', blob.size);

          const fileName = `interview_${number}_${new Date().toISOString()}.webm`;
          
          try {
            const url = await uploadToDropbox(blob, fileName);
            console.log('면접 영상이 성공적으로 업로드되었습니다:', url);
            
            // 면접 영상 URL을 웹훅으로 전송
            await sendInterviewHistoryToWebhook(number, interviewHistory, url);
          } catch (error) {
            console.error('면접 영상 업로드 실패:', error);
          }
        }
      }, { once: true });

      mediaRecorder.stop();
      console.log('녹화 중지됨');
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
    }
    
    setShowWebcam(false);
    setRecordedChunks([]);
    console.log('웹캠 중지됨');
  }, [mediaRecorder, recordedChunks, number, interviewHistory]);

  const speakText = useCallback(async (text: string) => {
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
  }, [initializeAudioContext, setErrorMessage, setIsAISpeaking]);

  const sendInterviewHistoryToWebhook = useCallback(async (number: string, finalHistory: string, videoUrl?: string) => {
    if (number && finalHistory) {
      console.log('면접 히스토리 전송 시도 중...');
      console.log('전송할 히스토리:', finalHistory);
      try {
        const success = await sendInterviewHistory(number, finalHistory, videoUrl);
        
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
        setInterviewMessage(prevMessage => prevMessage + "\n면접 기록 저장 중 오류가 발생했습니다. 관리자에게 문의해주��요.");
      }
    } else {
      console.warn('전화번호 또는 면접 히스토리가 비어 있어 히스토리를 전송하지 않았습니다.');
    }
  }, [setInterviewMessage]);

  const handleInterviewEnd = useCallback(async (finalHistory: string) => {
    try {
      const response = await axios.post('/api/end_interview');
      const endMessage = response.data.message;
      setInterviewMessage(endMessage);
      setInterviewState('ended');
      
      // 먼저 음성 출력
      await speakText(endMessage);
      
      // 웹캠/녹화 중지 및 영상 업로드
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        return new Promise((resolve) => {
          mediaRecorder.addEventListener('dataavailable', async (event) => {
            if (event.data.size > 0) {
              const newChunks = [...recordedChunks, event.data];
              const blob = new Blob(newChunks, { 
                type: 'video/webm;codecs=vp8,opus' 
              });
              
              try {
                const timestamp = new Date().toISOString();
                
                // 면접 기록을 텍스트 파일로 변환하여 업로드
                const textBlob = new Blob([finalHistory], { type: 'text/plain' });
                const textFileName = `interview_text_${number}_${timestamp}.txt`;
                const videoFileName = `interview_video_${number}_${timestamp}.webm`;

                // 영상과 텍스트 파일 모두 업로드
                const [videoUrl, textUrl] = await Promise.all([
                  uploadToDropbox(blob, videoFileName),
                  uploadToDropbox(textBlob, textFileName)
                ]);

                console.log('면접 영상 업로드 URL:', videoUrl);
                console.log('면접 기록 업로드 URL:', textUrl);
                
                // 웹훅으로는 영상 URL만 전송
                await sendInterviewHistoryToWebhook(number, finalHistory, videoUrl);
                
                resolve(true);
              } catch (error) {
                console.error('면접 자료 업로드 실패:', error);
                await sendInterviewHistoryToWebhook(number, finalHistory);
                resolve(false);
              }
            }
          }, { once: true });
          
          mediaRecorder.stop();
        });
      }
      
      // 웹캠 스트림 정리
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      setShowWebcam(false);
      setRecordedChunks([]);
      
    } catch (error) {
      console.error('면접 종료 중 오류 발생:', error);
      setErrorMessage('면접 종료 중 오류가 발생했습니다.');
    }
  }, [
    mediaRecorder, 
    recordedChunks, 
    number, 
    sendInterviewHistoryToWebhook, 
    speakText, 
    setErrorMessage, 
    setInterviewMessage, 
    setInterviewState
  ]);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      console.log('음성 인식 종료');
      
      if (currentTranscript.trim() && threadIdRef.current) {
        // 지원자의 답변을 면접 기록에 추가
        const updatedHistory = interviewHistory + `지원자: ${currentTranscript}\n`;
        setInterviewHistory(updatedHistory);
        console.log("Updated interview history:", updatedHistory);
        
        try {
          const response = await continueInterview(currentTranscript, threadIdRef.current);
          setInterviewMessage(response);
          // AI의 응답을 면접 기록에 추가
          const finalHistory = updatedHistory + `면접관: ${response}\n`;
          setInterviewHistory(finalHistory);
          console.log("Final interview history:", finalHistory);
          
          if (checkInterviewEnd(response)) {
            await handleInterviewEnd(finalHistory);
          } else {
            await speakText(response);
          }
        } catch (error) {
          console.error('Error sending user response to GPT:', error);
          setErrorMessage('응답 처리 중 오류가 발생했습니다.');
        }
      }
      setCurrentTranscript('');
    }
  }, [
    currentTranscript, 
    continueInterview, 
    setInterviewMessage, 
    setErrorMessage, 
    setInterviewHistory, 
    setCurrentTranscript,
    threadIdRef,
    checkInterviewEnd,
    handleInterviewEnd,
    speakText,
    interviewHistory
  ]);

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

  // 컴포넌트가 언마운트될 때 타이를 정리합니다.
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: true 
      });
      console.log('웹캠 스트림 획득 성공:', stream);
  
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        console.log('비디오 요소에 스트림 설정 완료');
  
        // MediaRecorder 설정
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8,opus' // 명시적으로 코덱 지정
        });

        recorder.ondataavailable = (event) => {
          console.log('녹화 데이터 가용:', event.data.size);
          if (event.data && event.data.size > 0) {
            setRecordedChunks(prev => [...prev, event.data]);
          }
        };

        // 1초마다 데이터 저장
        recorder.start(1000);
        setMediaRecorder(recorder);
        console.log('녹화 시작됨');

        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            console.log('웹캠 비디오 재생 시작');
            setShowWebcam(true);
          }).catch(error => {
            console.error('웹캠 비디오 재생 실패:', error);
          });
        };
      } else {
        console.error('비디오 요소가 없습니다.');
      }
    } catch (error) {
      console.error('웹캠 시작 오류:', error);
      setErrorMessage('웹캠을 시작할 수 없습니다. 권한을 확인해주세요.');
    }
  }, [setErrorMessage]);

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
            <p className="text-xl text-center mb-4 text-gray-600">입력 후 확인 버튼을 눌러주세요.</p>
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
                  {!isRecording && currentTranscript.length === 0 && (
                    <Button
                      onClick={startRecording}
                      className="w-48 h-16 text-4xl bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                    >
                      답변 시작
                    </Button>
                  )}
                  {isRecording && currentTranscript.length !== 0 && (
                    <Button
                      onClick={stopRecording}
                      className="w-48 h-16 text-4xl bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition duration-300 ease-in-out transform hover:scale-105"
                    >
                      답변 종료
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
        
        {interviewState === 'ended' && (
          <div className="w-full bg-gray-100 rounded-lg p-3 mt-2 text-2xl mb-10 text-gray-600 leading-relaxed">
            <p className="text-gray-600">{interviewMessage}</p>
          </div>
        )}
        
        {errorMessage && errorMessage !== '마이크 사용 권한이 필요합니다. 브라우저 설정에서 권한을 허용해주요.' && (
          <p className="text-red-500 text-center mt-4">{errorMessage}</p>
        )}
      </div>
    </main>
  )
}
