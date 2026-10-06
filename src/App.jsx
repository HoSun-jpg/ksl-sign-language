import React, { useRef, useState, useEffect } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { Camera, Hand, MessageSquare, Video, Database } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [detectedText, setDetectedText] = useState('');
  const [detectedGestureName, setDetectedGestureName] = useState('');
  
  const [gesturesList, setGesturesList] = useState([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);
  const [dbError, setDbError] = useState('');

  const prevHandYRef = useRef(null);
  const prevNiceHandYRef = useRef(null);
  const lastNiceDirRef = useRef(null);
  const clearTimerRef = useRef(null);

  // 1. Supabase DB 데이터 로드
  useEffect(() => {
    const fetchGestures = async () => {
      try {
        const { data, error } = await supabase
          .from('sign_language_gestures')
          .select('*');

        if (error) throw error;
        setGesturesList(data || []);
      } catch (err) {
        console.error('Supabase 데이터 로드 실패:', err);
        setDbError(err.message || '데이터를 불러오지 못했습니다.');
      } finally {
        setIsLoadingDB(false);
      }
    };

    fetchGestures();
  }, []);

  // 2. MediaPipe 초기화
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
        setHandLandmarker(landmarker);
      } catch (err) {
        console.error('MediaPipe 초기화 실패:', err);
      }
    };
    initMediaPipe();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', predictWebcam);
        setIsCameraActive(true);
      }
    } catch (err) {
      alert(`카메라 접근 실패: ${err.message}`);
    }
  };

  const isFourFingersClosed = (lm) => {
    return lm[8].y > lm[6].y && lm[12].y > lm[10].y && lm[16].y > lm[14].y && lm[20].y > lm[18].y;
  };

  const isFlatHand = (lm) => {
    return lm[8].y < lm[5].y && lm[12].y < lm[9].y && lm[16].y < lm[13].y && lm[20].y < lm[17].y;
  };

  // 90도 눕힌 손 (살짝 구부린 상태 + 손등이 앞을 향함) 판별
  const isHorizontalHand = (lm) => {
    if (isFourFingersClosed(lm)) return false;
    const dx = Math.abs(lm[8].x - lm[5].x);
    const dy = Math.abs(lm[8].y - lm[5].y);
    return dx > dy * 0.7;
  };

  // 새끼손가락만 펴진 상태 판별
  const isPinkyOnly = (lm) => {
    const isPinkyExtended = lm[20].y < lm[18].y;
    const isIndexClosed = lm[8].y > lm[6].y;
    const isMiddleClosed = lm[12].y > lm[10].y;
    const isRingClosed = lm[16].y > lm[14].y;
    return isPinkyExtended && isIndexClosed && isMiddleClosed && isRingClosed;
  };

  const isMiddleFingerOnly = (lm) => {
    const isMiddleUp = lm[12].y < lm[10].y && lm[12].y < lm[9].y;
    const isIndexClosed = lm[8].y > lm[6].y;
    const isRingClosed = lm[16].y > lm[14].y;
    const isPinkyClosed = lm[20].y > lm[18].y;
    return isMiddleUp && isIndexClosed && isRingClosed && isPinkyClosed;
  };

  const countExtendedFingers = (lm) => {
    let count = 0;
    if (lm[8].y < lm[6].y) count++;
    if (lm[12].y < lm[10].y) count++;
    if (lm[16].y < lm[14].y) count++;
    if (lm[20].y < lm[18].y) count++;
    return count;
  };

  const isOkShape = (lm) => {
    return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.12;
  };

  const isThumbUp = (lm) => {
    return lm[4].y < lm[2].y && lm[4].y < lm[5].y && isFourFingersClosed(lm);
  };

  const getDbRule = (key) => gesturesList.find((g) => g.gesture_key === key);

  // --- 수어 동작 분류 엔진 ---
  const classifySignLanguage = (handsLandmarks) => {
    if (!handsLandmarks || handsLandmarks.length === 0) {
      prevHandYRef.current = null;
      prevNiceHandYRef.current = null;
      lastNiceDirRef.current = null;
      return null;
    }

    const handCount = handsLandmarks.length;

    // 1. [양손 동작 처리]
    if (handCount === 2) {
      const hand1 = handsLandmarks[0];
      const hand2 = handsLandmarks[1];

      const h1Closed = isFourFingersClosed(hand1);
      const h2Closed = isFourFingersClosed(hand2);
      const h1ThumbUp = isThumbUp(hand1);
      const h2ThumbUp = isThumbUp(hand2);
      const h1Flat = isFlatHand(hand1);
      const h2Flat = isFlatHand(hand2);

      const wristDistance = Math.hypot(
        hand1[0].x - hand2[0].x,
        hand1[0].y - hand2[0].y
      );

      // ① [최고입니다!] - 양손 엄지 척
      if (h1ThumbUp && h2ThumbUp) {
        const rule = getDbRule('double_thumbs_up');
        return { text: rule?.text || '최고입니다!', gesture: rule?.gesture_name || '양손 엄지 척' };
      }

      // ② [반갑습니다!] - 90도 눕히고 살짝 구부린 손으로 위아래 흔들기
      const avgY = (hand1[0].y + hand2[0].y) / 2;
      const h1Horizontal = isHorizontalHand(hand1);
      const h2Horizontal = isHorizontalHand(hand2);

      if ((h1Horizontal || h2Horizontal) && wristDistance < 0.7) {
        if (prevNiceHandYRef.current !== null) {
          const deltaY = avgY - prevNiceHandYRef.current;

          if (Math.abs(deltaY) > 0.005) {
            const currentDir = deltaY > 0 ? 'down' : 'up';
            
            if (lastNiceDirRef.current && lastNiceDirRef.current !== currentDir) {
              const rule = getDbRule('nice_to_meet_you');
              return { text: rule?.text || '반갑습니다!', gesture: rule?.gesture_name || '양손 눕혀 흔들기' };
            }
            lastNiceDirRef.current = currentDir;
          }
        }
        prevNiceHandYRef.current = avgY;
      } else {
        prevNiceHandYRef.current = null;
        lastNiceDirRef.current = null;
      }

      // ③ [안녕하세요!] - 두 주먹을 쥔 채 아래로 내림
      if (h1Closed && h2Closed && !h1ThumbUp && !h2ThumbUp) {
        if (prevHandYRef.current !== null) {
          const deltaY = avgY - prevHandYRef.current;
          if (deltaY > 0.015) {
            const rule = getDbRule('hello');
            return { text: rule?.text || '안녕하세요!', gesture: rule?.gesture_name || '두 주먹 내리기' };
          }
        }
        prevHandYRef.current = avgY;
      } else {
        prevHandYRef.current = null;
      }

      // 두 손이 가깝게 위치할 때 (거리 0.32 이하)
      if (wristDistance < 0.32) {
        // ④ [사랑합니다!] - 한 손 주먹 + 한 손 펴짐
        const isLoveGesture = (h1Closed && !h2Closed) || (h2Closed && !h1Closed);
        if (isLoveGesture) {
          const rule = getDbRule('love');
          return { text: rule?.text || '사랑합니다!', gesture: rule?.gesture_name || '주먹+손바닥' };
        }

        // ⑤ [감사합니다!] - 두 손바닥이 마주보거나 거의 붙어있을 때
        const noOneIsFist = !h1Closed && !h2Closed;
        const isThanksGesture = noOneIsFist && (h1Flat || h2Flat || wristDistance < 0.22);
        if (isThanksGesture) {
          const rule = getDbRule('thanks');
          return { text: rule?.text || '감사합니다!', gesture: rule?.gesture_name || '양 손바닥 맞대기' };
        }
      }
    } else {
      prevHandYRef.current = null;
      prevNiceHandYRef.current = null;
      lastNiceDirRef.current = null;
    }

    // 2. [한 손 동작 처리]
    if (handCount === 1) {
      const hand = handsLandmarks[0];
      const wristY = hand[0].y;
      const pinkyTipY = hand[20].y;
      const extendedCount = countExtendedFingers(hand);

      // ① [괜찮아 / 괜찮습니다] - 새끼손가락만 펴서 턱 근처(Y축 0.25~0.65 위치)에 가져가기
      if (isPinkyOnly(hand) && pinkyTipY > 0.2 && pinkyTipY < 0.65) {
        const rule = getDbRule('fine') || getDbRule('okay') || getDbRule('fine_to_be_ok');
        return { 
          text: rule?.text || '괜찮아', 
          gesture: rule?.gesture_name || '새끼손가락 턱에 대기' 
        };
      }

      // ② [산] - 중지만 세우기
      if (isMiddleFingerOnly(hand)) {
        const rule = getDbRule('mountain');
        return { text: rule?.text || '산', gesture: rule?.gesture_name || '중지 세우기' };
      }

      // ③ [좋습니다!] - 한 손 엄지 척
      if (isThumbUp(hand)) {
        const rule = getDbRule('like');
        return { text: rule?.text || '좋습니다!', gesture: rule?.gesture_name || '한 손 엄지 척' };
      }

      // ④ [미안합니다!] - 이마 부근 + OK / 주먹 모양
      const ruleSorry = getDbRule('sorry');
      const maxWristY = ruleSorry ? ruleSorry.max_wrist_y : 0.58;
      
      if (wristY < maxWristY && (isOkShape(hand) || extendedCount <= 3 || isFourFingersClosed(hand))) {
        return { text: ruleSorry?.text || '미안합니다!', gesture: ruleSorry?.gesture_name || '이마에 손대기' };
      }
    }

    return null;
  };

  let lastVideoTime = -1;
  const predictWebcam = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.currentTime !== lastVideoTime && handLandmarker) {
      lastVideoTime = video.currentTime;
      const results = handLandmarker.detectForVideo(video, performance.now());

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks && results.landmarks.length > 0) {
        results.landmarks.forEach((landmarks) => {
          landmarks.forEach((lm) => {
            ctx.beginPath();
            ctx.arc((1 - lm.x) * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
          });
        });

        const result = classifySignLanguage(results.landmarks);
        if (result) {
          setDetectedText(result.text);
          setDetectedGestureName(result.gesture);

          if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
          clearTimerRef.current = setTimeout(() => {
            setDetectedText('');
            setDetectedGestureName('');
          }, 1500);
        }
      }
    }

    requestAnimationFrame(predictWebcam);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#38bdf8', marginBottom: '8px', fontSize: '13px', fontWeight: 'bold' }}>
          <Hand size={18} /> KOREAN SIGN LANGUAGE DETECTOR
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>DB 통합 수어 ➔ 텍스트 번역기</h1>
      </header>

      <div style={{ position: 'relative', width: '640px', height: '480px', backgroundColor: '#1e293b', borderRadius: '16px', overflow: 'hidden', border: '2px solid #334155', marginBottom: '24px' }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} width={640} height={480} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

        {!isCameraActive && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172aee' }}>
            <Video size={48} style={{ color: '#64748b', marginBottom: '12px' }} />
            <button onClick={startCamera} style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '14px 28px', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Camera size={20} /> 카메라 켜기
            </button>
          </div>
        )}
      </div>

      <div style={{ width: '640px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '24px', textAlign: 'center', minHeight: '130px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '8px' }}>
          <MessageSquare size={16} /> 실시간 번역 결과
        </div>

        {detectedText ? (
          <div>
            <div style={{ fontSize: '36px', fontWeight: '800', color: '#38bdf8', marginBottom: '4px' }}>
              "{detectedText}"
            </div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              감지된 동작: {detectedGestureName}
            </div>
          </div>
        ) : (
          <div style={{ color: '#475569', fontSize: '15px' }}>
            {isLoadingDB 
              ? 'Supabase DB 데이터 로딩 중...' 
              : dbError 
                ? `DB 에러: ${dbError}` 
                : '수어 동작을 취해 보세요!'}
          </div>
        )}
      </div>

      <div style={{ width: '640px', marginTop: '16px', padding: '12px 16px', backgroundColor: '#0f172a', borderRadius: '10px', border: '1px solid #334155', fontSize: '13px', color: '#94a3b8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#38bdf8', fontWeight: 'bold' }}>
          <Database size={14} /> DB 연동 완료: 총 {gesturesList.length}개 동작 등록됨
        </div>
        • [괜찮아] ➔ 새끼손가락만 펴서 턱 끝 근처에 가져다 대기
      </div>
    </div>
  );
}