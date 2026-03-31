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
  // A: each cell ≈ 568×405 → landscape 640×457
  // B: each cell ≈ 576×826 → portrait  480×686
  const STAGE_W = isA ? 640 : 480;
  const STAGE_H = isA ? 457 : 686;

  // AI hook
  const { results, isModelReady } = useMediaPipe(videoRef);

  // Physics / render hook (draws onto stageCanvas)
  const { initPhysics, destroyPhysics, petalCount } = useMatterPhysics(stageCanvas, videoRef, results);

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
      let c = 3;
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
      captureOne(() => setTimeout(() => runShots(remaining - 1), 600));
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
            <span>✌️ Confetti</span>
            <span>💖 하트</span>
            <span>🦋 나비</span>
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

      {!isModelReady && (
        <div className="loading-pill glass-panel">⏳ AI 모델 로딩 중...</div>
      )}
    </div>
  );
}
