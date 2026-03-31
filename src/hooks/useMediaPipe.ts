import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmarkerResult, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type Gesture = 'none' | 'heart' | 'peace' | 'flowercup';

export type AIResults = {
  hands: HandLandmarkerResult | null;
  face: FaceLandmarkerResult | null;
  gesture: Gesture;
};

function determineGesture(
  hands: HandLandmarkerResult,
  face: FaceLandmarkerResult | null
): Gesture {
  if (!hands.landmarks || hands.landmarks.length === 0) return 'none';

  const lm = hands.landmarks[0];

  // Helper: is a finger extended? (tip y < pip y — y goes down in image space)
  const up = (tip: number, pip: number) => lm[tip].y < lm[pip].y;

  // ── V / Peace ─────────────────────────────────────────────
  const indexUp  = up(8,  6);
  const middleUp = up(12, 10);
  const ringDown  = !up(16, 14);
  const pinkyDown = !up(20, 18);
  if (indexUp && middleUp && ringDown && pinkyDown) return 'peace';

  // ── Flower Cup (both palms near chin) ─────────────────────
  if (hands.landmarks.length >= 2 && face?.faceLandmarks?.length) {
    const chin = face.faceLandmarks[0][152];
    const h1 = hands.landmarks[0][0];
    const h2 = hands.landmarks[1][0];
    const near1 = Math.abs(h1.y - chin.y) < 0.18;
    const near2 = Math.abs(h2.y - chin.y) < 0.18;
    const close = Math.abs(h1.x - h2.x) < 0.35;
    if (near1 && near2 && close) return 'flowercup';
  }

  // ── Heart (index tips + thumb tips touching) ───────────────
  if (hands.landmarks.length >= 2) {
    const a = hands.landmarks[0];
    const b = hands.landmarks[1];
    const idxDist   = Math.hypot(a[8].x - b[8].x, a[8].y - b[8].y);
    const thumbDist = Math.hypot(a[4].x - b[4].x, a[4].y - b[4].y);
    // Loosened threshold: 0.12 -> 0.18 for easier detection
    if (idxDist < 0.18 && thumbDist < 0.18) return 'heart';
  }

  return 'none';
}

export default function useMediaPipe(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isModelReady, setIsModelReady] = useState(false);
  const [results, setResults] = useState<AIResults>({ hands: null, face: null, gesture: 'none' });

  const handRef = useRef<HandLandmarker | null>(null);
  const faceRef = useRef<FaceLandmarker | null>(null);
  const rafRef  = useRef<number>(0);
  const lastTimeRef = useRef<number>(-1);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );
        const [hand, face] = await Promise.all([
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 3,
            outputFaceBlendshapes: false,
          }),
        ]);
        if (!active) return;
        handRef.current = hand;
        faceRef.current = face;
        setIsModelReady(true);
      } catch (e) {
        console.error('MediaPipe init error', e);
      }
    })();
    return () => { active = false; };
  }, []);

  const loop = useCallback(function run() {
    const video = videoRef.current;
    if (!video || !handRef.current || !faceRef.current) {
      rafRef.current = requestAnimationFrame(run);
      return;
    }
    if (video.readyState >= 2 && video.currentTime !== lastTimeRef.current) {
      lastTimeRef.current = video.currentTime;
      
      // Use video timestamp in milliseconds
      const timestamp = video.currentTime * 1000;
      
      const handResult = handRef.current.detectForVideo(video, timestamp);
      const faceResult = faceRef.current.detectForVideo(video, timestamp);
      const gesture    = determineGesture(handResult, faceResult);
      setResults({ hands: handResult, face: faceResult, gesture });
    }
    rafRef.current = requestAnimationFrame(run);
  }, [videoRef]);

  useEffect(() => {
    if (!isModelReady) return;
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isModelReady, loop]);

  return { results, isModelReady };
}
