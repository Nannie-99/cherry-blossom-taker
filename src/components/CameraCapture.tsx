import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera } from 'lucide-react';
import type { FrameConfig } from '../App';
import useMediaPipe from '../hooks/useMediaPipe';
import useMatterPhysics from '../hooks/useMatterPhysics';
import html2canvas from 'html2canvas';
import './CameraCapture.css';

interface CameraCaptureProps {
  frameConfig: FrameConfig;
  onComplete: (images: string[]) => void;
  onBack: () => void;
}

const CameraCapture = ({ frameConfig, onComplete, onBack }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const captureAreaRef = useRef<HTMLDivElement>(null);
  const [streamData, setStreamData] = useState<MediaStream | null>(null);
  
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const [shotsTaken, setShotsTaken] = useState(0);
  const [capturedBuffer, setCapturedBuffer] = useState<string[]>([]);
  const isTypeA = frameConfig.type === 'A';

  // Initialize MediaPipe and get landmarks
  const { results, isModelReady } = useMediaPipe(videoRef);
  
  // Initialize Matter.js physics engine on the same view
  const { initPhysics, destroyPhysics, petalCount } = useMatterPhysics(playAreaRef, results);

  useEffect(() => {
    let active = true;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        if (active && videoRef.current) {
          videoRef.current.srcObject = stream;
          setStreamData(stream);
        }
      } catch (err) {
        console.error("Camera access denied or error", err);
        alert('카메라 접근 권한이 필요합니다!');
      }
    };
    startCamera();

    return () => {
      active = false;
      if (streamData) {
        streamData.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (streamData && isModelReady) {
      initPhysics();
    }
    return () => destroyPhysics();
  }, [streamData, isModelReady, initPhysics, destroyPhysics]);

  // Handle Capture Sequence
  const takeSequence = useCallback(() => {
    if (isCapturing) return;
    setIsCapturing(true);
    setShotsTaken(0);
    setCapturedBuffer([]);

    let shotCount = 0;
    
    const captureLoop = () => {
      if (shotCount >= frameConfig.totalShots) {
         return; // Finished
      }

      // Count down: 3 -> 2 -> 1 -> Flash!
      let count = 3;
      setCountdown(count);

      const countInterval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
        } else {
          clearInterval(countInterval);
          setCountdown(null);
          
          // Flash effect
          setFlash(true);
          setTimeout(() => setFlash(false), 150);
          
          // Capture the exact area using Canvas or html2canvas
          setTimeout(async () => {
             if (captureAreaRef.current) {
                // Ensure physics Canvas and Video are captured together.
                const canvas = await html2canvas(captureAreaRef.current, {
                    backgroundColor: null,
                    useCORS: true,
                    scale: window.devicePixelRatio || 2, 
                });
                const imgData = canvas.toDataURL('image/png');
                
                setCapturedBuffer(prev => {
                  const newBuffer = [...prev, imgData];
                  if (newBuffer.length >= frameConfig.totalShots) {
                     setTimeout(() => onComplete(newBuffer), 1000);
                  }
                  return newBuffer;
                });
                shotCount++;
                setShotsTaken(shotCount);
                
                // Trigger next loop if more
                if(shotCount < frameConfig.totalShots) {
                   captureLoop();
                }
             }
          }, 100);
        }
      }, 1000);
    };

    captureLoop();
  }, [isCapturing, frameConfig.totalShots, onComplete]);

  return (
    <div className="camera-screen screen-layout fade-in">
      <div className="camera-header glass-panel">
         <h2>{isTypeA ? "세로네컷 (A형)" : "가로네컷 (B형)"} 촬영 중</h2>
         <p>{shotsTaken} / {frameConfig.totalShots} 장컷 완료</p>
      </div>

      <div className="camera-stage">
        {/* Full area that gets captured */}
        <div ref={captureAreaRef} className="capture-wrapper">
          <video 
            ref={videoRef} 
            className="webcam-video" 
            autoPlay 
            playsInline 
            muted 
          />
          {/* Physics & Realtime effects layer */}
          <div ref={playAreaRef} className="physics-layer"></div>
        </div>

        {/* UI Overlay (Crop Guide) - NOT captured */}
        {!isCapturing && (
           <div className={`crop-overlay ${isTypeA ? 'type-a' : 'type-b'}`}>
              <div className="crop-mask"></div>
              <div className="crop-border"></div>
           </div>
        )}

        {/* HUD Overlay */}
        {!isCapturing && (
          <div className="score-hud glass-panel">
             <span>🌸 받은 벚꽃잎:</span>
             <span className="score-count">{petalCount}</span>
          </div>
        )}
        
        {countdown !== null && (
          <div className="countdown-display">{countdown}</div>
        )}
        {flash && <div className="flash-overlay"></div>}
      </div>

      <div className="camera-controls">
         <button className="back-btn" onClick={onBack} disabled={isCapturing}>
             뒤로가기
         </button>
         <button className={`btn-primary capture-btn ${isCapturing ? 'disabled' : ''}`} onClick={takeSequence} disabled={isCapturing || !isModelReady}>
            <Camera size={28} />
            {isCapturing ? '촬영 중...' : '셔터 누르기'}
         </button>
      </div>

      {(!isModelReady && !isCapturing) && (
        <div className="loading-toast glass-panel">
           AI 모델 준비중... 잠시만 기다려주세요 ⏳
        </div>
      )}
    </div>
  );
};

export default CameraCapture;
