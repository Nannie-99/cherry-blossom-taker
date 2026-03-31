import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import Matter from 'matter-js';
import type { AIResults } from './useMediaPipe';

import fullBlossom1 from '../assets/full_blossom_1.png';
import fullBlossom2 from '../assets/full_blossom_2.png';
import petal1 from '../assets/single_petal_1.png';
import petal2 from '../assets/single_petal_2.png';
import petal3 from '../assets/single_petal_3.png';
import butterfly1 from '../assets/butterfly_group_1.png';
import butterfly2 from '../assets/butterfly_group_2.png';
import butterfly3 from '../assets/butterfly_group_3.png';

const ASSETS = {
  blossoms: [fullBlossom1, fullBlossom2],
  petals: [petal1, petal2, petal3],
  butterflies: [butterfly1, butterfly2, butterfly3]
};

// Helper to remove white background and return transparent DataURL
const removeWhiteBackground = async (imgUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(imgUrl);
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2];
          // If it's pure white or close to white, make transparent
          if (r > 230 && g > 230 && b > 230) {
             data[i+3] = 0; // Alpha
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL());
      } catch (e) {
        resolve(imgUrl);
      }
    };
    img.onerror = () => resolve(imgUrl);
  });
};

export default function useMatterPhysics(
  containerRef: RefObject<HTMLDivElement | null>,
  aiResults: AIResults
) {
  const [petalCount, setPetalCount] = useState(0);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);
  const runnerRef = useRef<Matter.Runner | null>(null);
  const faceBodyRef = useRef<Matter.Body | null>(null);
  const handsBodyRefs = useRef<Matter.Body[]>([]);
  
  // Track sprites for physics objects
  const spritesRef = useRef<{blossoms: string[], petals: string[], butterflies: string[]}>({
    blossoms: [], petals: [], butterflies: []
  });

  const processedImagesRef = useRef(false);

  useEffect(() => {
    const loadImages = async () => {
      const blossoms = await Promise.all(ASSETS.blossoms.map(removeWhiteBackground));
      const petals = await Promise.all(ASSETS.petals.map(removeWhiteBackground));
      const butterflies = await Promise.all(ASSETS.butterflies.map(removeWhiteBackground));
      spritesRef.current = { blossoms, petals, butterflies };
      processedImagesRef.current = true;
    };
    loadImages();
  }, []);

  const initPhysics = () => {
    if (!containerRef.current || engineRef.current) return;

    const Engine = Matter.Engine,
          Render = Matter.Render,
          Runner = Matter.Runner,
          Composite = Matter.Composite,
          Bodies = Matter.Bodies;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const engine = Engine.create();
    engine.gravity.y = 0.5; // gentle gravity
    engineRef.current = engine;

    const render = Render.create({
      element: containerRef.current,
      engine: engine,
      options: {
        width,
        height,
        wireframes: false,
        background: 'transparent'
      }
    });
    renderRef.current = render;

    // Invisible obstacles (Face and Hands)
    const faceBody = Bodies.circle(-100, -100, 80, { isStatic: true, render: { visible: false } });
    faceBodyRef.current = faceBody;
    
    const hand1 = Bodies.rectangle(-100, -100, 120, 20, { isStatic: true, render: { visible: false } });
    const hand2 = Bodies.rectangle(-100, -100, 120, 20, { isStatic: true, render: { visible: false } });
    handsBodyRefs.current = [hand1, hand2];

    Composite.add(engine.world, [faceBody, hand1, hand2]);

    Render.run(render);
    
    const runner = Runner.create();
    Runner.run(runner, engine);
    runnerRef.current = runner;

    // Spawn falling petals periodically
    setInterval(() => {
        if (!processedImagesRef.current) return;
        const x = Math.random() * width;
        const isFull = Math.random() > 0.7; // 30% chance for full blossom
        const arr = isFull ? spritesRef.current.blossoms : spritesRef.current.petals;
        const texture = arr[Math.floor(Math.random() * arr.length)];
        const scale = isFull ? 0.3 : 0.15; // adjust to realistic size
        
        const petal = Bodies.circle(x, -50, 20 * scale, {
            restitution: 0.1,
            frictionAir: isFull ? 0.05 : 0.08,
            render: {
                sprite: {
                    texture,
                    xScale: scale,
                    yScale: scale
                }
            }
        });
        
        // Remove old petals to save memory
        if (engine.world.bodies.length > 100) {
            const oldBody = engine.world.bodies.find(b => b !== faceBody && !handsBodyRefs.current.includes(b));
            if (oldBody) Composite.remove(engine.world, oldBody);
        }

        Composite.add(engine.world, petal);
    }, 800);
  };

  const destroyPhysics = () => {
    if (renderRef.current) {
        Matter.Render.stop(renderRef.current);
        renderRef.current.canvas.remove();
        renderRef.current = null;
    }
    if (runnerRef.current) {
        Matter.Runner.stop(runnerRef.current);
        runnerRef.current = null;
    }
    if (engineRef.current) {
        Matter.World.clear(engineRef.current.world, false);
        Matter.Engine.clear(engineRef.current);
        engineRef.current = null;
    }
  };

  // Update Face/Hand hitboxes every frame based on AI results
  useEffect(() => {
      if (!engineRef.current || !containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      const { face, hands, gesture } = aiResults;

      // Update Face
      if (face && face.faceLandmarks && face.faceLandmarks.length > 0) {
          const nose = face.faceLandmarks[0][1]; 
          // Note: MediaPipe coordinates are 0-1, so multiply by width/height
          // Note: Video is mirrored (scaleX(-1)), so we must flip X coordinate
          const flippedX = (1 - nose.x) * width;
          Matter.Body.setPosition(faceBodyRef.current!, { x: flippedX, y: nose.y * height });
      } else {
          Matter.Body.setPosition(faceBodyRef.current!, { x: -500, y: -500 });
      }

      // Update Hands (Palm up)
      if (hands && hands.landmarks) {
        // Collect points
        handsBodyRefs.current.forEach((handBody, index) => {
            if (index < hands.landmarks.length) {
                const h = hands.landmarks[index];
                // Wrist to middle finger base roughly defines the palm
                const wrist = h[0];
                const base = h[9];
                
                // If the wrist is strictly below the base (y coordinate in mediapipe is top-down) => palm is up
                const isPalmUp = wrist.y > base.y + 0.05;
                const flippedX = (1 - base.x) * width;

                if (isPalmUp) {
                    Matter.Body.setPosition(handBody, { x: flippedX, y: base.y * height });
                } else {
                    // Hand not in catching position, move bounding box away
                    Matter.Body.setPosition(handBody, { x: -500, y: -500 });
                }
            } else {
                Matter.Body.setPosition(handBody, { x: -500, y: -500 });
            }
        });
      }

      // Custom Draw Effect Logic for Confetti/Butterflies/Hearts based on gesture
      Matter.Events.on(renderRef.current!, 'afterRender', () => {
         const render = renderRef.current;
         if (!render) return;
         const ctx = render.context;
         
         if (gesture === 'peace') {
            // Draw random confetti at top or scattered
            for(let i=0; i<30; i++) {
                ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 70%)`;
                ctx.fillRect(Math.random() * width, Math.random() * height, 10, 10);
            }
         } else if (gesture === 'heart') {
            // Draw hearts near hands
            if (hands && hands.landmarks) {
                hands.landmarks.forEach((h) => {
                    const px = (1 - h[9].x) * width;
                    const py = h[9].y * height;
                    ctx.fillStyle = '#ff5e72';
                    ctx.font = '30px serif';
                    ctx.fillText('💖', px + (Math.random()*100 - 50), py + (Math.random()*100 - 50));
                });
            }
         } else if (gesture === 'flowercup') {
            // Draw butterflies above face
            if (face && face.faceLandmarks?.length) {
               const fnose = face.faceLandmarks[0][1];
               const fx = (1 - fnose.x) * width;
               const fy = fnose.y * height - 150; // Above head
               
               if (processedImagesRef.current) {
                   const btries = spritesRef.current.butterflies;
                   const btry = btries[Math.floor(Date.now() / 200) % btries.length];
                   const imgLocal = new Image();
                   imgLocal.src = btry;
                   ctx.drawImage(imgLocal, fx - 100, fy - 100, 200, 200);
               }
            }
         }
      });
      
  }, [aiResults]);

  // Update count of resting petals on hands
  useEffect(() => {
     const countInterval = setInterval(() => {
        if (!engineRef.current) return;
        const bodies = engineRef.current.world.bodies;
        // Check how many bodies are "resting" (low velocity) on top of the hands' hitboxes
        let count = 0;
        bodies.forEach(b => {
            if (b !== faceBodyRef.current && !handsBodyRefs.current.includes(b)) {
                if (b.speed < 0.2 && Math.abs(b.velocity.y) < 0.1) {
                    // Usually implies resting on something (mostly our hands since gravity is downward)
                    count++;
                }
            }
        });
        setPetalCount(count);
     }, 500);
     return () => clearInterval(countInterval);
  }, []);

  return { initPhysics, destroyPhysics, petalCount };
}
