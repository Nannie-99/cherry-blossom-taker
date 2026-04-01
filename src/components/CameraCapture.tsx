/**
 * CameraCapture
 *
 * Stage canvas = the crop preview (aspect ratio matches each individual cell).
 *
 * A型 (Desktop / 2×6 in print):
 *   Final canvas 600×1800 px → 4 cells stacked, each ≈ 568×405 px
 *   → Cell ratio ≈ 568:405 ≈ 1.4:1  →  Stage canvas  640 × 457 (landscape)
 *
 * B型 (Mobile / 4×6 in print):
 *   Final canvas 1200×1800 px → 2×2 grid, each ≈ 576×826 px
 *   → Cell ratio ≈ 576:826 ≈ 0.7:1  →  Stage canvas  480 × 686 (portrait)
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { FrameConfig } from '../App';
import useMediaPipe from '../hooks/useMediaPipe';
import useMatterPhysics from '../hooks/useMatterPhysics';
import './CameraCapture.css';

interface CameraCaptureProps {
  frameConfig: FrameConfig;
  onComplete: (images: string[]) => void;
  onBack: () => void;
}

export default function CameraCapture({ frameConfig, onComplete, onBack }: CameraCaptureProps) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const stageCanvas   = useRef<HTMLCanvasElement>(null);

  const [countdown,   setCountdown]   = useState<number | null>(null);
  const [flash,       setFlash]       = useState(false);
  const [shotsTaken,  setShotsTaken]  = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [camReady,    setCamReady]    = useState(false);

  const isA = frameConfig.type === 'A';

  // Stage canvas = viewport the user shoots through.
  // Size = individual cell aspect ratio (not whole frame ratio).
  // A: each cell ≈ 568×405 → landscape 896×640 (increased 1.4x for visibility)
  // B: each cell ≈ 576×826 → portrait  480×686
  const STAGE_W = isA ? 896 : 480;
  const STAGE_H = isA ? 640 : 686;

  // AI hook
  const { results, isModelReady } = useMediaPipe(videoRef);

  // Initial guide show for 5 seconds
  const [showInitialGuide, setShowInitialGuide] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowInitialGuide(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Physics / render hook (draws onto stageCanvas)
  const { initPhysics, destroyPhysics, petalCount } = useMatterPhysics(stageCanvas, videoRef, results, frameConfig.type);

  // ── Camera setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    const startCam = async () => {
      // Check API availability first
      if (!navigator.mediaDevices?.getUserMedia) {
        alert('이 브라우저는 카메라를 지원하지 않습니다.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        const vid = videoRef.current;
        if (!vid) return;
        vid.srcObject = stream;

        // Wait for metadata so we have real dimensions, then set canvas
        await new Promise<void>((resolve) => {
          vid.onloadedmetadata = () => resolve();
        });
        await vid.play();

        if (cancelled) return;
        if (stageCanvas.current) {
          stageCanvas.current.width  = STAGE_W;
          stageCanvas.current.height = STAGE_H;
        }
        setCamReady(true);
      } catch (err) {
        if (cancelled) return;
        const e = err as DOMException;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          alert('카메라 접근 권한을 허용해 주세요!');
        } else {
          console.error('Camera error:', e);
          // Not a permission error – might be device busy, retry silently
          setTimeout(startCam, 1500);
        }
      }
    };

    startCam();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STAGE_W, STAGE_H]);

  // ── Start physics as long as camera is ready ──────────────────────────────
  // Even if AI models are loading, petals should start falling.
  useEffect(() => {
    if (camReady) {
      initPhysics();
    }
    return () => destroyPhysics();
  }, [camReady, initPhysics, destroyPhysics]);

  // ── Shoot sequence ──────────────────────────────────────────────────────
  const shoot = useCallback(() => {
    if (isCapturing) return;
    setIsCapturing(true);
    const shots: string[] = [];

    const captureOne = (doneCallback: () => void) => {
      let c = 10;
      setCountdown(c);
      const iv = setInterval(() => {
        c -= 1;
        if (c > 0) { setCountdown(c); return; }
        clearInterval(iv);
        setCountdown(null);
        setFlash(true);
        setTimeout(() => setFlash(false), 160);

        // Capture canvas as-is (includes video + physics + effects)
        const dataUrl = stageCanvas.current?.toDataURL('image/png') ?? '';
        shots.push(dataUrl);
        setShotsTaken(shots.length);
        doneCallback();
      }, 1000);
    };

    const runShots = (remaining: number) => {
      if (remaining === 0) {
        setIsCapturing(false);
        onComplete(shots);
        return;
      }
      captureOne(() => setTimeout(() => runShots(remaining - 1), 1000));
    };

    runShots(frameConfig.totalShots);
  }, [isCapturing, onComplete, frameConfig.totalShots]);

  return (
    <div className="cam-screen">
      {/* Hidden video element — feeds canvas draw loop */}
      {/* Safety: position: absolute hides but lets browser/AI process the video buffer */}
      <video 
        ref={videoRef} 
        style={{ position: 'absolute', left: '-9999px', opacity: 0, width: '1px', height: '1px' }} 
        autoPlay 
        playsInline 
        muted 
      />

      <div className="cam-header glass-panel">
        <span>{isA ? '세로네컷 A형 (데스크톱)' : '가로네컷 B형 (모바일)'}</span>
        <span className="shot-counter">{shotsTaken} / {frameConfig.totalShots}</span>
      </div>

      {/* Stage: this IS the cropped view, no overlay needed */}
      <div className="stage-wrapper" style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}>
        <canvas
          ref={stageCanvas}
          className="stage-canvas"
          width={STAGE_W}
          height={STAGE_H}
        />

        {/* HUD: petal counter — hidden during capture */}
        {!isCapturing && isModelReady && (
          <div className="petal-hud">🌸 손 위 꽃잎: <strong>{petalCount}</strong></div>
        )}

        {countdown !== null && (
          <div className="countdown">{countdown}</div>
        )}
        {flash && <div className="flash" />}

        {/* Gesture guide shown when not capturing */}
        {!isCapturing && (
          <div className="gesture-guide">
            <div className="gesture-item">✌️ 화환</div>
            <div className="gesture-item">🫶 하트</div>
            <div className="gesture-item">🤗 나비</div>
            <div className="gesture-item">🫴 벚꽃 잡기</div>
          </div>
        )}

        {/* Initial setup guide modal */}
        {showInitialGuide && (
          <div className="initial-guide-overlay fade-in">
            <div className="initial-guide-content glass-panel">
              <div className="guide-icon">📸</div>
              <p>얼굴과 손이 화면에 잘 보이도록<br /><strong>1~1.5m 정도 거리</strong>를 유지해주세요.<br /><br /><span>밝은 곳에서 인식이 더 잘 됩니다!</span></p>
            </div>
          </div>
        )}
      </div>

      <div className="cam-controls">
        <button className="back-btn" onClick={onBack} disabled={isCapturing}>← 뒤로</button>
        <button
          className={`btn-primary shoot-btn ${!isModelReady || isCapturing ? 'disabled' : ''}`}
          onClick={shoot}
          disabled={!isModelReady || isCapturing}
        >
          📸 {isCapturing ? '촬영 중...' : '셔터'}
        </button>
      </div>

    </div>
  );
}
