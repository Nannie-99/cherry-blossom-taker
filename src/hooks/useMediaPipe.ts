import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { HandLandmarkerResult, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type AIResults = {
  hands: HandLandmarkerResult | null;
  face: FaceLandmarkerResult | null;
  gesture: 'none' | 'heart' | 'peace' | 'flowercup';
};

function determineGesture(hands: HandLandmarkerResult, face: FaceLandmarkerResult | null): AIResults['gesture'] {
  if (!hands.landmarks || hands.landmarks.length === 0) return 'none';
  
  // For simplicity, implement heuristic gesture detection.
  // 1. Check for Peace (V) sign: Index and Middle up, Ring and Pinky down.
  const isFingerUp = (tip: number, pip: number, mcp: number) => tip < pip && pip < mcp; // 'y' is smaller when up
  
  let hasPeace = false;
  let hasHeart = false;
  let hasFlowerCup = false;

  const hand1 = hands.landmarks[0];
  
  // V Sign Logic (1 hand enough)
  if (hand1) {
     const iUp = isFingerUp(hand1[8].y, hand1[6].y, hand1[5].y); // index
     const mUp = isFingerUp(hand1[12].y, hand1[10].y, hand1[9].y); // middle
     const rDown = hand1[16].y > hand1[14].y; // ring folded (tip lower than pip)
     const pDown = hand1[20].y > hand1[18].y; // pinky folded
     
     if (iUp && mUp && rDown && pDown) hasPeace = true;
  }
  
  // Heart Logic (2 hands)
  // Index tips touch, Thumb tips touch
  if (hands.landmarks.length >= 2) {
    const h1 = hands.landmarks[0];
    const h2 = hands.landmarks[1];
    
    const indexDist = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
    const thumbDist = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);
    // If index tips are close and thumb tips are close, it's a hand heart
    if (indexDist < 0.1 && thumbDist < 0.1) {
        hasHeart = true;
    }
    
    // Flower Cup Logic: Two hands near the bottom bounding box of the face
    if (face && face.faceLandmarks && face.faceLandmarks.length > 0) {
        const chin = face.faceLandmarks[0][152]; // Chin bottom
        const p1 = h1[0]; // palm base
        const p2 = h2[0];
        
        // If palm bases are near chin y-coordinate
        const p1Near = Math.abs(p1.y - chin.y) < 0.2;
        const p2Near = Math.abs(p2.y - chin.y) < 0.2;
        const bothClose = Math.abs(p1.x - p2.x) < 0.3; // Hands are together
        
        if (p1Near && p2Near && bothClose) {
            hasFlowerCup = true;
        }
    }
  }

  if (hasFlowerCup) return 'flowercup';
  if (hasHeart) return 'heart';
  if (hasPeace) return 'peace';
  return 'none';
}

export default function useMediaPipe(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isModelReady, setIsModelReady] = useState(false);
  const [results, setResults] = useState<AIResults>({ hands: null, face: null, gesture: 'none' });
  const handModelRef = useRef<HandLandmarker | null>(null);
  const faceModelRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);

  useEffect(() => {
    let active = true;

    async function initModels() {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.x/wasm"
      );
      
      const handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: false
      });

      if (active) {
        handModelRef.current = handLandmarker;
        faceModelRef.current = faceLandmarker;
        setIsModelReady(true);
      }
    }

    initModels();
    return () => { active = false; };
  }, []);

  const trackFrames = useCallback(function loop() {
    if (!videoRef.current || !handModelRef.current || !faceModelRef.current) return;
    
    // Process frames slightly slower or using animation frame
    const video = videoRef.current;
    if (video.currentTime !== lastVideoTimeRef.current && video.readyState >= 2) {
      lastVideoTimeRef.current = video.currentTime;
      const startTimeMs = performance.now();
      
      const handResult = handModelRef.current.detectForVideo(video, startTimeMs);
      const faceResult = faceModelRef.current.detectForVideo(video, startTimeMs);
      
      const gesture = determineGesture(handResult, faceResult);
      
      setResults({ hands: handResult, face: faceResult, gesture });
    }
    
    requestRef.current = requestAnimationFrame(loop);
  }, [videoRef]);

  useEffect(() => {
    if (isModelReady) {
      requestRef.current = requestAnimationFrame(trackFrames);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isModelReady, trackFrames]);

  return { results, isModelReady };
}
