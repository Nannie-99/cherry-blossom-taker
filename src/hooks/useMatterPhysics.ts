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

const PETAL_URLS   = [fullBlossom1Url, fullBlossom2Url, petal1Url, petal2Url, petal3Url];
const BUTTERFLY_URLS = [butterfly1Url, butterfly2Url, butterfly3Url];

// Remove white background via pixel manipulation
async function loadTransparentImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i] > 220 && d.data[i + 1] > 220 && d.data[i + 2] > 220) {
          d.data[i + 3] = 0;
        }
      }
      ctx.putImageData(d, 0, 0);
      const out = new Image();
      out.src = c.toDataURL();
      out.onload = () => resolve(out);
    };
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
  aiResults: AIResults
) {
  const [petalCount, setPetalCount] = useState(0);

  // Use a ref for AI results so the render loop always sees the latest state
  // without needing to recreate the entire physics system.
  const aiRef = useRef(aiResults);
  aiRef.current = aiResults;

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

  useEffect(() => {
    Promise.all([
      ...PETAL_URLS.map(loadTransparentImage),
      ...BUTTERFLY_URLS.map(loadTransparentImage),
    ]).then((imgs) => {
      petalImgs.current     = imgs.slice(0, PETAL_URLS.length);
      butterflyImgs.current = imgs.slice(PETAL_URLS.length);
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
    const hand1 = Bodies.rectangle(-500, -500, 130, 18, { isStatic: true, isSensor: false, render: { visible: false }, friction: 0.8, restitution: 0 });
    const hand2 = Bodies.rectangle(-500, -500, 130, 18, { isStatic: true, isSensor: false, render: { visible: false }, friction: 0.8, restitution: 0 });

    faceBodyRef.current = face;
    handBodies.current  = [hand1, hand2];

    Composite.add(engine.world, [floor, wallL, wallR, face, hand1, hand2]);

    // ── Spawn loop ───────────────────────────────────────────
    spawnTimerRef.current = window.setInterval(() => {
      if (!imgsLoaded.current || !engineRef.current || !stageCanvasRef.current) return;
      const w = stageCanvasRef.current.width;
      const idx = Math.floor(Math.random() * petalImgs.current.length);
      const img = petalImgs.current[idx];
      const isFull = idx < 2; // first two are full blossoms
      const size   = isFull ? 48 : 28;

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
      const LIMIT = 30; // User requested 1/2 of previous 60
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
      ctx.drawImage(vid, -W, 0, W, H);
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
      drawGestureOverlay(ctx, W, H, aiRef.current);

      rafRef.current = requestAnimationFrame(renderLoop);
    };

    rafRef.current = requestAnimationFrame(renderLoop);
    return () => {};
  }, [stageCanvasRef, videoRef]); // Removed aiResults from dependency array

  // ── Keep face/hand bodies synced with AI ────────────────────────────────
  // Synced in the main hook body above
  // aiRef.current = aiResults; 


  useEffect(() => {
    const sync = setInterval(() => {
      const { face, hands } = aiRef.current;
      const canvas = stageCanvasRef.current;
      if (!canvas || !engineRef.current) return;
      const W = canvas.width;
      const H = canvas.height;
      const { Body } = Matter;

      // Face (no mirror – we mirror the draw, so keep coords)
      if (face?.faceLandmarks?.[0]) {
        const nose = face.faceLandmarks[0][1];
        Body.setPosition(faceBodyRef.current!, {
          x: (1 - nose.x) * W,
          y: nose.y * H,
        });
      } else {
        Body.setPosition(faceBodyRef.current!, { x: -500, y: -500 });
      }

      // Hands
      handBodies.current.forEach((hb, i) => {
        const h = hands?.landmarks?.[i];
        if (h) {
          const wrist = h[0];
          const base  = h[9];
          const palmUp = wrist.y > base.y + 0.04;
          if (palmUp) {
            Body.setPosition(hb, { x: (1 - base.x) * W, y: base.y * H });
          } else {
            Body.setPosition(hb, { x: -500, y: -500 });
          }
        } else {
          Body.setPosition(hb, { x: -500, y: -500 });
        }
      });

      // Count petals resting on hands
      let count = 0;
      petalBodies.current.forEach((b) => {
        if (b.speed < 0.3 && Math.abs(b.position.y - (handBodies.current[0]?.position.y ?? -999)) < 40) count++;
      });
      setPetalCount(count);
    }, 50);

    return () => clearInterval(sync);
  }, [stageCanvasRef]);

  // ── Gesture overlay drawing ───────────────────────────────────────────────
  function drawGestureOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, ai: AIResults) {
    const { gesture, hands, face } = ai;

    if (gesture === 'peace') {
      // Bright confetti
      const N = 25;
      for (let i = 0; i < N; i++) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = `hsl(${(Date.now() / 5 + i * 37) % 360}, 100%, 65%)`;
        const bx = ((Date.now() / 3 + i * 173) % W);
        const by = ((Date.now() / 2 + i * 97)  % H);
        ctx.fillRect(bx, by, 10, 10);
        ctx.restore();
      }
    } else if (gesture === 'heart') {
      // Floating hearts near each hand
      if (hands?.landmarks) {
        hands.landmarks.forEach((lm) => {
          const px = (1 - lm[9].x) * W;
          const py = lm[9].y * H;
          const t  = Date.now() / 400;
          for (let k = 0; k < 5; k++) {
            const angle = t + (k * 2 * Math.PI) / 5;
            const r     = 55 + Math.sin(t + k) * 15;
            ctx.font    = `${22 + k * 3}px serif`;
            ctx.globalAlpha = 0.8;
            ctx.fillText('💖', px + Math.cos(angle) * r, py + Math.sin(angle) * r * 0.5);
          }
        });
        ctx.globalAlpha = 1;
      }
    } else if (gesture === 'flowercup') {
      // Butterfly above head
      if (face?.faceLandmarks?.[0] && butterflyImgs.current.length > 0) {
        const nose = face.faceLandmarks[0][1];
        const bx   = (1 - nose.x) * W;
        const by   = nose.y * H;
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
  }

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
