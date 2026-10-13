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
  const prevIndexXRef = useRef(null);
  const prettyMoveDirRef = useRef(null);
  const prevMiddleYRef = useRef(null);
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

  const isHorizontalHand = (lm) => {
    if (isFourFingersClosed(lm)) return false;
    const dx = Math.abs(lm[8].x - lm[5].x);
    const dy = Math.abs(lm[8].y - lm[5].y);
    return dx > dy * 0.7;
  };

  const isPinkyOnly = (lm) => {
    const isPinkyExtended = lm[20].y < lm[18].y;
    const isIndexClosed = lm[8].y > lm[6].y;
    const isMiddleClosed = lm[12].y > lm[10].y;
    const isRingClosed = lm[16].y > lm[14].y;
    return isPinkyExtended && isIndexClosed && isMiddleClosed && isRingClosed;
  };

  const isIndexOnly = (lm) => {
    const isIndexExtended = lm[8].y < lm[6].y;
    const isMiddleClosed = lm[12].y > lm[10].y;
    const isRingClosed = lm[16].y > lm[14].y;
    const isPinkyClosed = lm[20].y > lm[18].y;
    return isIndexExtended && isMiddleClosed && isRingClosed && isPinkyClosed;
  };

  const isMiddleFingerOnly = (lm) => {
    const isMiddleUp = lm[12].y < lm[10].y && lm[12].y < lm[9].y;
    const isIndexClosed = lm[8].y > lm[6].y;
    const isRingClosed = lm[16].y > lm[14].y;
    const isPinkyClosed = lm[20].y > lm[18].y;
    return isMiddleUp && isIndexClosed && isRingClosed && isPinkyClosed;
  };

  const isIndexAndMiddleOnly = (lm) => {
    const isIndexUp = lm[8].y < lm[6].y;
    const isMiddleUp = lm[12].y < lm[10].y;
    const isRingClosed = lm[16].y > lm[14].y;
    const isPinkyClosed = lm[20].y > lm[18].y;
    return isIndexUp && isMiddleUp && isRingClosed && isPinkyClosed;
  };

  const isRestroomGesture = (lm) => {
    const thumbIndexDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
    const isC_Shape = thumbIndexDist > 0.03 && thumbIndexDist < 0.20;
    const isMiddleUp = lm[12].y < lm[10].y;
    const isRingUp = lm[16].y < lm[14].y;
    const isPinkyUp = lm[20].y < lm[18].y;
    return isC_Shape && isMiddleUp && isRingUp && isPinkyUp;
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
      prevIndexXRef.current = null;
      prettyMoveDirRef.current = null;
      prevMiddleYRef.current = null;
      return null;
    }

    const handCount = handsLandmarks.length;

    // 1. [양손 동작 처리]
    if (handCount === 2) {
      prevIndexXRef.current = null;
      prettyMoveDirRef.current = null;
      prevMiddleYRef.current = null;

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

      const avgY = (hand1[0].y + hand2[0].y) / 2;

      // ① [강아지]
      const h1NearHead = hand1[0].y < 0.48;
      const h2NearHead = hand2[0].y < 0.48;
      const h1Open = countExtendedFingers(hand1) >= 3;
      const h2Open = countExtendedFingers(hand2) >= 3;

      if (h1NearHead && h2NearHead && h1Open && h2Open) {
        const rule = getDbRule('dog');
        return { text: rule?.text || '강아지', gesture: rule?.gesture_name || '양손 손바닥 보이게 머리 위에 올리기' };
      }

      // ② [최고입니다!]
      if (h1ThumbUp && h2ThumbUp) {
        const rule = getDbRule('double_thumbs_up');
        return { text: rule?.text || '최고입니다!', gesture: rule?.gesture_name || '양손 엄지 척' };
      }

      // ③ [사랑합니다!]
      if (wristDistance < 0.32) {
        const isLoveGesture = (h1Closed && !h2Closed) || (h2Closed && !h1Closed);
        if (isLoveGesture) {
          const rule = getDbRule('love');
          return { text: rule?.text || '사랑합니다!', gesture: rule?.gesture_name || '주먹+손바닥' };
        }
      }

      // ④ [감사합니다!]
      const noOneIsFist = !h1Closed && !h2Closed;
      if (wristDistance < 0.22 && noOneIsFist && (h1Flat || h2Flat)) {
        prevNiceHandYRef.current = null;
        lastNiceDirRef.current = null;
        const rule = getDbRule('thanks');
        return { text: rule?.text || '감사합니다!', gesture: rule?.gesture_name || '양 손바닥 맞대기' };
      }

      // ⑤ [안녕하세요!]
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

      // ⑥ [반갑습니다!]
      const h1Horizontal = isHorizontalHand(hand1);
      const h2Horizontal = isHorizontalHand(hand2);

      if ((h1Horizontal || h2Horizontal) && wristDistance >= 0.22 && wristDistance < 0.70) {
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
      const indexTip = hand[8];
      const middleTip = hand[12];
      const extendedCount = countExtendedFingers(hand);

      // ① [화장실]
      if (isRestroomGesture(hand)) {
        const rule = getDbRule('restroom');
        return { text: rule?.text || '화장실', gesture: rule?.gesture_name || '엄지·검지 C + 중지·약지·새끼 W' };
      }

      // ② [엄마]
      const isNearNasolabial = indexTip.y > 0.38 && indexTip.y < 0.68;
      if (isNearNasolabial && isPinkyOnly(hand)) {
        const rule = getDbRule('mom');
        return { text: rule?.text || '엄마', gesture: rule?.gesture_name || '팔자주름 부근 대기' };
      }

      // ③ [예쁘다]
      if (isIndexOnly(hand) && indexTip.y > 0.25 && indexTip.y < 0.70) {
        if (prevIndexXRef.current !== null) {
          const deltaX = indexTip.x - prevIndexXRef.current;
          
          if (Math.abs(deltaX) > 0.008) {
            const currentDir = deltaX > 0 ? 'right' : 'left';
            
            if (prettyMoveDirRef.current && prettyMoveDirRef.current !== currentDir) {
              const rule = getDbRule('pretty');
              return { text: rule?.text || '예쁘다', gesture: rule?.gesture_name || '검지로 볼 돌리기' };
            }
            prettyMoveDirRef.current = currentDir;
          }
        }
        prevIndexXRef.current = indexTip.x;
      } else {
        prevIndexXRef.current = null;
        prettyMoveDirRef.current = null;
      }

      // ④ [없다]
      if (isIndexAndMiddleOnly(hand) && indexTip.y > 0.55 && indexTip.y < 0.80) {
        const rule = getDbRule('none');
        return { text: rule?.text || '없다', gesture: rule?.gesture_name || '검지/중지 펴고 턱에 대기' };
      }

      // ⑤ [남동생] & [산]
      if (isMiddleFingerOnly(hand)) {
        if (prevMiddleYRef.current !== null) {
          const deltaY = middleTip.y - prevMiddleYRef.current;
          
          if (deltaY > 0.012) {
            const rule = getDbRule('younger_brother');
            return { text: rule?.text || '남동생', gesture: rule?.gesture_name || '중지 세우고 아래로 내리기' };
          }
        }
        prevMiddleYRef.current = middleTip.y;

        const rule = getDbRule('mountain');
        return { text: rule?.text || '산', gesture: rule?.gesture_name || '중지 세우기' };
      } else {
        prevMiddleYRef.current = null;
      }

      // ⑥ [괜찮아]
      if (isPinkyOnly(hand) && pinkyTipY > 0.58 && pinkyTipY < 0.80) {
        const rule = getDbRule('fine') || getDbRule('okay');
        return { text: rule?.text || '괜찮아', gesture: rule?.gesture_name || '새끼손가락 턱에 대기' };
      }

      // ⑦ [좋습니다!]
      if (isThumbUp(hand)) {
        const rule = getDbRule('like');
        return { text: rule?.text || '좋습니다!', gesture: rule?.gesture_name || '한 손 엄지 척' };
      }

      // ⑧ [미안합니다!]
      const ruleSorry = getDbRule('sorry');
      if (wristY < 0.45 && (isOkShape(hand) || extendedCount <= 3 || isFourFingersClosed(hand))) {
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
            ctx.fillStyle = '#0284c7';
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
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#ffffff', color: '#1e293b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      
      {/* 헤더 */}
      <header style={{ textAlign: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#0369a1', marginBottom: '2px', fontSize: '12px', fontWeight: 'bold' }}>
          <Hand size={14} /> KOREAN SIGN LANGUAGE DETECTOR
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-0.5px' }}>DB 통합 수어 ➔ 텍스트 번역기</h1>
      </header>

      {/* 카메라 및 비디오 영역 */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '520px', height: '240px', backgroundColor: '#f8fafc', borderRadius: '14px', overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: '12px', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
        <canvas ref={canvasRef} width={640} height={480} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />

        {!isCameraActive && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
            <Video size={36} style={{ color: '#94a3b8', marginBottom: '8px' }} />
            <button onClick={startCamera} style={{ backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(2,132,199,0.2)' }}>
              <Camera size={18} /> 카메라 켜기
            </button>
          </div>
        )}
      </div>

      {/* 실시간 번역 결과 박스 (높이 고정으로 흔들림 완전 방지) */}
      <div style={{ width: '100%', maxWidth: '520px', height: '75px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '10px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', marginBottom: '12px', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px', fontWeight: '500' }}>
          <MessageSquare size={13} /> 실시간 번역 결과
        </div>

        {detectedText ? (
          <div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#0284c7', lineHeight: '1.2' }}>
              "{detectedText}"
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
              감지된 동작: {detectedGestureName}
            </div>
          </div>
        ) : (
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: '500' }}>
            {isLoadingDB 
              ? 'Supabase DB 데이터 로딩 중...' 
              : dbError 
                ? `DB 에러: ${dbError}` 
                : '수어 동작을 취해 보세요!'}
          </div>
        )}
      </div>

      {/* DB 연동 안내 하단 바 */}
      <div style={{ width: '100%', maxWidth: '520px', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#475569', textAlign: 'center', boxSizing: 'border-box', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px', color: '#0369a1', fontWeight: 'bold' }}>
          <Database size={12} /> DB 연동 완료: 총 {gesturesList.length}개 동작 등록됨
        </div>
        • 강아지, 화장실, 없다, 엄마, 예쁘다 등 실시간 인식 중
      </div>

    </div>
  );
}