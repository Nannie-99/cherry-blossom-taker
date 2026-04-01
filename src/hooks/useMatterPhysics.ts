/**
 * useMatterPhysics – manages the realtime rendering loop.
 *
 * Architecture:
 *  - One <canvas> element (the "stage") is the single output surface.
 *  - Every animation frame we:
 *      1. drawImage(video) – mirrored, full-stage
 *      2. Step Matter.js engine
 *      3. Draw each petal body using its pre-loaded Image
 *      4. Draw gesture overlays (hearts / confetti / butterflies)
 *  - This approach works because we own the canvas; no html2canvas needed.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import Matter from 'matter-js';
import type { AIResults } from './useMediaPipe';

// ─── asset URLs (Vite resolves these at build time) ─────────────────────────
import fullBlossom1Url from '../assets/full_blossom_1_1774967338859.png';
import fullBlossom2Url from '../assets/full_blossom_2_1774967354374.png';
import petal1Url       from '../assets/single_petal_1_1774967368457.png';
import petal2Url       from '../assets/single_petal_2_1774967383493.png';
import petal3Url       from '../assets/single_petal_3_1774967404817.png';
import butterfly1Url   from '../assets/butterfly_group_1_1774967605803.png';
import butterfly2Url   from '../assets/butterfly_group_2_1774967557567.png';
import butterfly3Url   from '../assets/butterfly_group_3_1774967573251.png';

// Import newly generated Wreaths (removed realistic images as per request)

const PETAL_URLS   = [fullBlossom1Url, fullBlossom2Url, petal1Url, petal2Url, petal3Url];
const BUTTERFLY_URLS = [butterfly1Url, butterfly2Url, butterfly3Url];

// Standard image loader for pre-processed assets
async function loadTransparentImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
  });
}

// Matter body extended with our petal image reference
interface PetalBody extends Matter.Body {
  _img?: HTMLImageElement;
  _size?: number;
  _opacity?: number;   // for FIFO fade-out
  _age?: number;
}

// ─── Main hook ───────────────────────────────────────────────────────────────
export default function useMatterPhysics(
  stageCanvasRef: RefObject<HTMLCanvasElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  aiResults: AIResults,
  frameType: 'A' | 'B' = 'A'
) {
  const [petalCount, setPetalCount] = useState(0);

  // Use a ref for AI results so the render loop always sees the latest state
  // without needing to recreate the entire physics system.
  const aiRef = useRef(aiResults);
  useEffect(() => {
    aiRef.current = aiResults;
  }, [aiResults]);

  const engineRef   = useRef<Matter.Engine | null>(null);
  const faceBodyRef = useRef<Matter.Body | null>(null);
  const handBodies  = useRef<Matter.Body[]>([]);
  const petalBodies = useRef<PetalBody[]>([]);
  const rafRef      = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const isRunning   = useRef(false);

  // Loaded images
  const petalImgs     = useRef<HTMLImageElement[]>([]);
  const butterflyImgs = useRef<HTMLImageElement[]>([]);
  const imgsLoaded    = useRef(false);

  const getCropParams = useCallback((vW: number, vH: number, cW: number, cH: number) => {
    const aspectVid = vW / vH;
    const aspectCv = cW / cH;
    let sx = 0, sy = 0, sw = vW, sh = vH;

    if (aspectVid > aspectCv) {
      sw = vH * aspectCv;
      sx = (vW - sw) / 2;
    } else {
      sh = vW / aspectCv;
      sy = (vH - sh) / 2;
    }
    return { sx, sy, sw, sh };
  }, []);

  // ── Gesture overlay drawing ───────────────────────────────────────────────
  const drawGestureOverlay = useCallback((ctx: CanvasRenderingContext2D, W: number, H: number, ai: AIResults, vid: HTMLVideoElement) => {
    const { gesture, face } = ai;
    const vW = vid.videoWidth || 1280;
    const vH = vid.videoHeight || 720;
    const { sx, sy, sw, sh } = getCropParams(vW, vH, W, H);

    if (gesture === 'peace') {
      if (face?.faceLandmarks?.[0]) {
        // Draw emoji crown above the head (forehead is landmark 10)
        const forehead = face.faceLandmarks[0][10];
        const nx = (forehead.x * vW - sx) / sw;
        const ny = (forehead.y * vH - sy) / sh;
        const px = (1 - nx) * W;
        const py = ny * H;
        
        // 3 combinations of emoji crowns
        const combinations = [
          ['🌸', '🌷', '🌸', '🌷', '🌸'],
          ['🌺', '🌼', '🌺', '🌼', '🌺'],
          ['🌻', '🌹', '🌻', '🌹', '🌻']
        ];
        
        const idx = Math.floor(Date.now() / 2000) % combinations.length;
        const crown = combinations[idx];
        
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Slight bobbing animation
        const bob = Math.sin(Date.now() / 500) * 10;
        
        // Draw the emojis in a slight curve above the forehead
        const radius = 100;
        const items = crown.length;
        for (let i = 0; i < items; i++) {
          // Spread across an arc (-45 to 45 degrees approx)
          const angle = -Math.PI / 4 + (i * (Math.PI / 2) / (items - 1));
          const ex = px + Math.sin(angle) * radius;
          const ey = py - 40 + -Math.cos(angle) * radius * 0.3 + bob;
          
          ctx.font = '40px serif';
          ctx.fillText(crown[i], ex, ey);
        }
        ctx.restore();
      }
    } else if (gesture === 'heart') {
      if (face?.faceLandmarks?.[0]) {
        // Draw hearts floating up from the forehead (landmark 10)
        const forehead = face.faceLandmarks[0][10];
        const nx = (forehead.x * vW - sx) / sw;
        const ny = (forehead.y * vH - sy) / sh;
        const px = (1 - nx) * W;
        const py = ny * H;
        const t  = Date.now() / 400;
        for (let k = 0; k < 5; k++) {
          const angle = t + (k * 2 * Math.PI) / 5;
          const r     = 55 + Math.sin(t + k) * 15;
          ctx.font    = `${22 + k * 3}px serif`;
          ctx.globalAlpha = 0.8;
          ctx.fillText('💖', px + Math.cos(angle) * r, py - 60 + Math.sin(angle) * r * 0.5);
        }
        ctx.globalAlpha = 1;
      }
    } else if (gesture === 'flowercup') {
      if (face?.faceLandmarks?.[0] && butterflyImgs.current.length > 0) {
        const nose = face.faceLandmarks[0][1];
        const nx = (nose.x * vW - sx) / sw;
        const ny = (nose.y * vH - sy) / sh;
        const bx   = (1 - nx) * W;
        const by   = ny * H;
        const idx  = Math.floor(Date.now() / 600) % butterflyImgs.current.length;
        const bImg = butterflyImgs.current[idx];
        const flap = Math.sin(Date.now() / 150) * 0.1;
        ctx.save();
        ctx.translate(bx, by - 160 + Math.sin(Date.now() / 300) * 10);
        ctx.scale(1 + flap, 1 - flap);
        ctx.drawImage(bImg, -80, -60, 160, 120);
        ctx.restore();
      }
    }
  }, [getCropParams]);

  useEffect(() => {
    Promise.all([
      ...PETAL_URLS.map(loadTransparentImage),
      ...BUTTERFLY_URLS.map(loadTransparentImage),
    ]).then((imgs) => {
      let offset = 0;
      petalImgs.current     = imgs.slice(offset, offset += PETAL_URLS.length);
      butterflyImgs.current = imgs.slice(offset, offset += BUTTERFLY_URLS.length);
      imgsLoaded.current    = true;
    });
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  const initPhysics = useCallback(() => {
    if (isRunning.current || !stageCanvasRef.current) return;
    isRunning.current = true;

    const canvas = stageCanvasRef.current;
    const { Engine, Bodies, Composite, Body } = Matter;

    const engine = Engine.create({ gravity: { x: 0, y: 0.6 } });
    engineRef.current = engine;

    // Floor / walls so petals don't fall off forever
    const floor  = Bodies.rectangle(canvas.width / 2, canvas.height + 25, canvas.width * 2, 50, { isStatic: true, render: { visible: false } });
    const wallL  = Bodies.rectangle(-25, canvas.height / 2, 50, canvas.height * 2, { isStatic: true, render: { visible: false } });
    const wallR  = Bodies.rectangle(canvas.width + 25, canvas.height / 2, 50, canvas.height * 2, { isStatic: true, render: { visible: false } });

    // Face / hand invisible sensors
    const face  = Bodies.circle(-500, -500, 90, { isStatic: true, isSensor: false, render: { visible: false } });
    const hand1 = Bodies.rectangle(-500, -500, 150, 24, { isStatic: true, isSensor: false, render: { visible: false }, friction: 1.0, restitution: 0 });
    const hand2 = Bodies.rectangle(-500, -500, 150, 24, { isStatic: true, isSensor: false, render: { visible: false }, friction: 1.0, restitution: 0 });

    faceBodyRef.current = face;
    handBodies.current  = [hand1, hand2];

    Composite.add(engine.world, [floor, wallL, wallR, face, hand1, hand2]);

    // ── Spawn loop ───────────────────────────────────────────
    spawnTimerRef.current = window.setInterval(() => {
      if (!imgsLoaded.current || !engineRef.current || !stageCanvasRef.current) return;
      const w = stageCanvasRef.current.width;
      const idx    = Math.floor(Math.random() * petalImgs.current.length);
      const img    = petalImgs.current[idx];
      const isFull = idx < 2; // first two are full blossoms
      
      // B-type (mobile) gets smaller petals (0.8x)
      const scale  = frameType === 'B' ? 0.8 : 1.0;
      const size   = (isFull ? 58 : 50) * scale;

      const x = Math.random() * w;
      const body = Bodies.circle(x, -60, size / 2, {
        frictionAir: isFull ? 0.06 : 0.10,
        restitution: 0.15,
        friction: 0.5,
        mass: isFull ? 0.4 : 0.15,
        render: { visible: false },
      }) as PetalBody;
      body._img  = img;
      body._size = size;
      body._opacity = 1;
      body._age  = 0;

      // Give a tiny initial sideways nudge
      Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0.5 });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);

      petalBodies.current.push(body);
      Composite.add(engine.world, body);

      // FIFO: fade out oldest when too many
      // B-type has lower limit (30) for performance on mobile
      const LIMIT = frameType === 'B' ? 30 : 40;
      if (petalBodies.current.length > LIMIT) {
        const excess = petalBodies.current.length - LIMIT;
        for (let i = 0; i < excess; i++) {
          const target = petalBodies.current[i];
          target._opacity = Math.max(0, (target._opacity ?? 1) - 0.2); // Faster fade for excess
          if (target._opacity <= 0) {
            Composite.remove(engine.world, target);
            petalBodies.current.splice(i, 1);
          }
        }
      }
    }, 700);

    // ── Render loop ──────────────────────────────────────────
    const renderLoop = () => {
      const cv = stageCanvasRef.current;
      const vid = videoRef.current;
      if (!cv || !vid || !engineRef.current) {
        rafRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const ctx = cv.getContext('2d')!;
      const W = cv.width;
      const H = cv.height;

      // 1. Draw mirrored video
      ctx.save();
      ctx.scale(-1, 1);
      
      const vW = vid.videoWidth || 1280;
      const vH = vid.videoHeight || 720;
      const { sx, sy, sw, sh } = getCropParams(vW, vH, W, H);
      
      ctx.drawImage(vid, sx, sy, sw, sh, -W, 0, W, H);
      ctx.restore();

      // 2. Step physics
      Matter.Engine.update(engine, 1000 / 60);

      // 3. Draw petals
      for (const b of petalBodies.current) {
        if (!b._img) continue;
        b._age = (b._age ?? 0) + 1;
        // Gradually reduce opacity for bodies marked for removal
        if (b._opacity !== undefined && b._opacity < 1) {
          b._opacity = Math.max(0, b._opacity - 0.01);
        }
        ctx.save();
        ctx.globalAlpha = b._opacity ?? 1;
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.angle);
        const s = b._size ?? 30;
        ctx.drawImage(b._img, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      // 4. Gesture overlays (realtime, visible while shooting!)
      // Use the ref here!
      drawGestureOverlay(ctx, W, H, aiRef.current, vid);

      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {};
  }, [stageCanvasRef, videoRef, getCropParams, drawGestureOverlay, frameType]);

  // ── Keep face/hand bodies synced with AI ────────────────────────────────
  // Synced in the main hook body above
  // aiRef.current = aiResults; 


  useEffect(() => {
    const sync = setInterval(() => {
      const { face, hands } = aiRef.current;
      const canvas = stageCanvasRef.current;
      const vid = videoRef.current;
      if (!canvas || !engineRef.current || !vid) return;
      const W = canvas.width;
      const H = canvas.height;
      const { Body } = Matter;

      // Face (no mirror – we mirror the draw, so keep coords)
      if (face?.faceLandmarks?.[0]) {
        const vW = vid.videoWidth || 1280;
        const vH = vid.videoHeight || 720;
        const { sx, sy, sw, sh } = getCropParams(vW, vH, W, H);

        const nose = face.faceLandmarks[0][1];
        // Map normalized video x/y to cropped canvas x/y
        const nx = (nose.x * vW - sx) / sw;
        const ny = (nose.y * vH - sy) / sh;

        Body.setPosition(faceBodyRef.current!, {
          x: (1 - nx) * W,
          y: ny * H,
        });
      } else {
        Body.setPosition(faceBodyRef.current!, { x: -500, y: -500 });
      }

      // Hands
      const vW = vid.videoWidth || 1280;
      const vH = vid.videoHeight || 720;
      const { sx, sy, sw, sh } = getCropParams(vW, vH, W, H);

      handBodies.current.forEach((hb, i) => {
        const h = hands?.landmarks?.[i];
        if (h) {
          const nx = (h[9].x * vW - sx) / sw;
          const ny = (h[9].y * vH - sy) / sh;
          
          if (aiRef.current.gesture === 'open_palm') {
            Body.setPosition(hb, { x: (1 - nx) * W, y: ny * H });
          } else {
            // Drop hands if not openly checking for petals
            Body.setPosition(hb, { x: -500, y: -500 });
          }
        } else {
          Body.setPosition(hb, { x: -500, y: -500 });
        }
      });

      // ── Stacked Petal Counting ──────────────────────────────────────────────
      // 1. Identify petals directly touching or resting on hand bodies
      const onHandIds = new Set<number>();
      const petalArr = petalBodies.current;
      
      petalArr.forEach((p) => {
        const speedOk = p.speed < 1.8; // Relaxed speed
        const onHand1 = handBodies.current[0] && speedOk && Math.abs(p.position.y - (handBodies.current[0].position.y - 12)) < 55 && Math.abs(p.position.x - handBodies.current[0].position.x) < 110;
        const onHand2 = handBodies.current[1] && speedOk && Math.abs(p.position.y - (handBodies.current[1].position.y - 12)) < 55 && Math.abs(p.position.x - handBodies.current[1].position.x) < 110;
        
        if (onHand1 || onHand2) {
          onHandIds.add(p.id);
        }
      });
      
      // 2. Iteratively find petals resting on petals that are already "on hand" (the stack)
      // We run 3 passes to catch stacks up to 4 petals deep.
      for (let pass = 0; pass < 3; pass++) {
        let addedInPass = false;
        petalArr.forEach((p) => {
          if (onHandIds.has(p.id)) return;
          
          // Check if p is resting on any body already in our set
          for (const other of petalArr) {
            if (onHandIds.has(other.id) && other.id !== p.id) {
              // "Resting" condition: p is above other (p.y < other.y) and close horizontally
              const horizontalDist = Math.abs(p.position.x - other.position.x);
              const verticalDist   = other.position.y - p.position.y; // positive if p is above other
              
              if (horizontalDist < 45 && verticalDist > 2 && verticalDist < 50 && p.speed < 2.0) {
                onHandIds.add(p.id);
                addedInPass = true;
                break;
              }
            }
          }
        });
        if (!addedInPass) break;
      }
      
      setPetalCount(onHandIds.size);
    }, 50);

    return () => clearInterval(sync);
  }, [stageCanvasRef, videoRef, getCropParams]);

  // ── Destroy ───────────────────────────────────────────────────────────────
  const destroyPhysics = useCallback(() => {
    isRunning.current = false;
    cancelAnimationFrame(rafRef.current);
    clearInterval(spawnTimerRef.current);
    if (engineRef.current) {
      Matter.World.clear(engineRef.current.world, false);
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
    petalBodies.current = [];
  }, []);

  return { initPhysics, destroyPhysics, petalCount };
}
