/**
 * Result – assembles the final collage canvas at print resolution.
 *
 * Print spec (300 DPI):
 *  A型 (Desktop / 2×6 in): 600 × 1800 px
 *    1×4 grid: CELL_W=572, CELL_H=410  (AR≈1.39 landscape)
 *
 *  B型 (Mobile / 4×6 in): 1200 × 1800 px
 *    2×2 grid: CELL_W=579, CELL_H=834  (AR≈0.69 portrait)
 */
import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCcw } from 'lucide-react';
import type { FrameConfig } from '../App';
import './Result.css';

const MESSAGES = [
  '오늘 너라는 꽃이\n활짝 피었네!',
  '너의 웃음이 교실을\n봄으로 채우고 있어.',
  '오늘 나의 하트가\n누군가에게 봄이 됩니다.',
  '봄바람 타고 너에게\n전하는 작은 응원!',
  '지금 흘리는 땀방울이\n나중에 큰 꽃이 될 거야.',
  '네가 꿈꾸는 모든 순간을\n선생님이 응원할게.',
  '작은 하트 하나가 세상을\n따뜻하게 만들 수 있어.',
  '벚꽃처럼 너도 참 예쁘게\n피어날 거야.',
];

interface ResultProps {
  images: string[];
  frameConfig: FrameConfig;
  onBack: () => void;
  finalImage: string | null;
  setFinalImage: (u: string) => void;
}

export default function Result({ images, frameConfig, onBack, finalImage, setFinalImage }: ResultProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const isA = frameConfig.type === 'A';

  useEffect(() => {
    if (images.length === 0 || !canvasRef.current) return;
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    buildFrame(canvasRef.current, images, isA, msg).then((url) => {
      setFinalImage(url);
      setLoading(false);
    });
  }, [images, isA, setFinalImage]);

  const download = () => {
    if (!finalImage) return;
    const a = document.createElement('a');
    a.href = finalImage;
    a.download = `cherry-blossom-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="result-screen screen-layout fade-in">
      <h2 className="title-text result-title">짠! 벚꽃 네컷 완성 🌸</h2>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <div className={`preview-wrap ${isA ? 'type-a' : 'type-b'}`}>
        {loading ? (
          <p className="loading-text">🌸 프레임 합성 중...</p>
        ) : (
          <img src={finalImage!} alt="벚꽃 네컷" className="result-img" />
        )}
      </div>

      <div className="action-buttons">
        <button className="btn-secondary" onClick={onBack}>
          <RefreshCcw size={18} /> 다시 찍기
        </button>
        <button className="btn-primary" onClick={download} disabled={loading}>
          <Download size={18} /> 저장하기
        </button>
      </div>
    </div>
  );
}

// ── Canvas assembly ──────────────────────────────────────────────────────────
async function buildFrame(
  canvas: HTMLCanvasElement,
  srcs: string[],
  isA: boolean,
  msg: string,
) {
  const ctx = canvas.getContext('2d')!;

  // ── Layout (300 DPI print dimensions) ─────────────────────────────────────
  // PAD = gap between cells and outer border
  // TEXT = bottom text strip height
  const PAD  = 14;
  const TEXT = 90;

  let CANVAS_W: number, CANVAS_H: number,
      CELL_W:  number,  CELL_H:  number,
      COLS:    number,  ROWS:    number;

  if (isA) {
    // A型: 2×6 in = 600×1800 px, 1 column × 4 rows
    // CELL_W = 600 - 14*2        = 572
    // CELL_H = (1800-90-14*5)/4  = (1710-70)/4 = 410
    CANVAS_W = 600;  CANVAS_H = 1800;
    COLS = 1;        ROWS = 4;
    CELL_W = CANVAS_W - PAD * 2;
    CELL_H = Math.floor((CANVAS_H - TEXT - PAD * (ROWS + 1)) / ROWS);
  } else {
    // B型: 4×6 in = 1200×1800 px, 2 columns × 2 rows
    // CELL_W = (1200 - 14*3) / 2 = 579
    // CELL_H = (1800 - 90 - 14*3) / 2 = 834
    CANVAS_W = 1200; CANVAS_H = 1800;
    COLS = 2;        ROWS = 2;
    CELL_W = Math.floor((CANVAS_W - PAD * (COLS + 1)) / COLS);
    CELL_H = Math.floor((CANVAS_H - TEXT - PAD * (ROWS + 1)) / ROWS);
  }

  canvas.width  = CANVAS_W;
  canvas.height = CANVAS_H;

  // ── Background ────────────────────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0,   '#FFDCE0');
  grad.addColorStop(0.5, '#FFC8D3');
  grad.addColorStop(1,   '#FFDCE0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Load images ───────────────────────────────────────────────────────────
  const imgs = await Promise.all(
    srcs.map((src) =>
      new Promise<HTMLImageElement>((res) => {
        const i = new Image();
        i.src = src;
        i.onload = () => res(i);
      })
    )
  );

  // ── Draw photo cells ──────────────────────────────────────────────────────
  imgs.forEach((img, idx) => {
    if (!img) return;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x   = PAD + col * (CELL_W + PAD);
    const y   = PAD + row * (CELL_H + PAD);

    // White cell background with subtle shadow
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.12)';
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.restore();

    // Center-crop image into cell
    const iAR = img.width  / img.height;
    const cAR = CELL_W / CELL_H;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (iAR > cAR) {
      sw = img.height * cAR;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / cAR;
      sy = (img.height - sh) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, CELL_W, CELL_H);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, x, y, CELL_W, CELL_H);
    ctx.restore();
  });

  // ── Text strip ────────────────────────────────────────────────────────────
  const stripY = CANVAS_H - TEXT;

  const tGrad = ctx.createLinearGradient(0, stripY, 0, CANVAS_H);
  tGrad.addColorStop(0, 'rgba(255,175,190,0.85)');
  tGrad.addColorStop(1, 'rgba(255,150,170,0.98)');
  ctx.fillStyle = tGrad;
  ctx.fillRect(0, stripY, CANVAS_W, TEXT);

  // Decorative blossoms
  ctx.font = '26px serif';
  ctx.fillText('🌸', PAD + 8, stripY + 36);
  ctx.fillText('🌸', CANVAS_W - PAD - 36, stripY + 36);

  // Message text
  ctx.fillStyle    = '#5C2D40';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const lines  = msg.split('\n');
  const fSize  = isA ? 28 : 36;
  const lineH  = fSize * 1.5;
  const totalH = lines.length * lineH;
  const startY = stripY + (TEXT - totalH) / 2 + lineH / 2;

  ctx.font = `700 ${fSize}px "Jua", "Apple SD Gothic Neo", sans-serif`;
  lines.forEach((line, i) => {
    ctx.fillText(line.trim(), CANVAS_W / 2, startY + i * lineH);
  });

  return canvas.toDataURL('image/png', 0.95);
}
