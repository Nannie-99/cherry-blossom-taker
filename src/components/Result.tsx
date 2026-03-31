import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCcw } from 'lucide-react';
import type { FrameConfig } from '../App';
import './Result.css';

interface ResultProps {
  images: string[];
  frameConfig: FrameConfig;
  onBack: () => void;
  finalImage: string | null;
  setFinalImage: (url: string) => void;
}

const MESSAGES = [
  "오늘 너라는 꽃이<br>활짝 피었네!",
  "너의 웃음이 교실을<br>봄으로 채우고 있어.",
  "오늘 나의 하트가<br>누군가에게 봄이 됩니다.",
  "봄바람 타고 너에게<br>전하는 작은 응원!",
  "지금 흘리는 땀방울이<br>나중에 큰 꽃이 될 거야.",
  "네가 꿈꾸는 모든 순간을<br>선생님이 응원할게.",
  "작은 하트 하나가 세상을<br>따뜻하게 만들 수 있어.",
  "벚꽃처럼 너도 참 예쁘게<br>피어날 거야."
];

const Result = ({ images, frameConfig, onBack, finalImage, setFinalImage }: ResultProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    if (!canvasRef.current || images.length === 0) return;
    
    // Pick random message
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
    const lines = msg.split('<br>');

    const processImages = async () => {
      setIsProcessing(true);
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const imgObjects = await Promise.all(
        images.map(src => {
          return new Promise<HTMLImageElement>((resolve) => {
             const img = new Image();
             img.src = src;
             img.onload = () => resolve(img);
          });
        })
      );

      // We define basic grid cell sizes depending on layout. 
      // Source image from camera is whatever `captureAreaRef` was sizes. 
      // Let's assume we want final output grid cells of 600x800 for 1x4, or 800x600 for 2x2
      
      const isA = frameConfig.type === 'A';
      const cellW = isA ? 600 : 800;
      const cellH = isA ? 800 : 600;
      const padding = 20;
      const textSpace = 180;
      
      const cols = frameConfig.cols;
      const rows = frameConfig.rows;
      
      const totalW = cols * cellW + padding * (cols + 1);
      const totalH = rows * cellH + padding * (rows + 1) + textSpace;
      
      canvas.width = totalW;
      canvas.height = totalH;

      // Draw Background Frame Color
      ctx.fillStyle = '#FFDAC1'; // Peach background
      ctx.fillRect(0, 0, totalW, totalH);

      // Draw Grid
      imgObjects.forEach((img, idx) => {
         const col = idx % cols;
         const row = Math.floor(idx / cols);
         
         const x = padding + col * (cellW + padding);
         const y = padding + row * (cellH + padding);
         
         // Fill White back
         ctx.fillStyle = 'white';
         ctx.fillRect(x, y, cellW, cellH);

         // Draw Crop: center crop the original image to cell aspect ratio
         const imgAspect = img.width / img.height;
         const cellAspect = cellW / cellH;
         
         let sW = img.width;
         let sH = img.height;
         let sX = 0;
         let sY = 0;

         if (imgAspect > cellAspect) {
             // Image is wider than cell -> Crop horizontal
             sW = img.height * cellAspect;
             sX = (img.width - sW) / 2;
         } else {
             // Image is taller -> Crop vertical
             sH = img.width / cellAspect;
             sY = (img.height - sH) / 2;
         }

         ctx.drawImage(img, sX, sY, sW, sH, x + 4, y + 4, cellW - 8, cellH - 8);
      });

      // Draw Text
      ctx.fillStyle = '#5C4d4d'; // Soft brown
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 45px "Jua", sans-serif';
      
      const textX = totalW / 2;
      const startTextY = totalH - textSpace / 2 - (lines.length > 1 ? 25 : 0);
      
      lines.forEach((line, i) => {
         ctx.fillText(line.trim(), textX, startTextY + (i * 55));
      });
      
      // Save data
      setFinalImage(canvas.toDataURL('image/png', 0.9));
      setIsProcessing(false);
    };

    processImages();
  }, [images, frameConfig, setFinalImage]);

  const handleDownload = () => {
    if (!finalImage) return;
    const a = document.createElement('a');
    a.href = finalImage;
    a.download = `cherry-blossom-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="result-screen screen-layout fade-in">
      <h2 className="title-text result-title">짠! 오늘의 벚꽃 축제 완료 🌸</h2>
      
      <div className="preview-container glass-panel">
         {/* Hidden canvas used for processing */}
         <canvas ref={canvasRef} style={{ display: 'none' }} />
         
         {isProcessing ? (
           <p className="loading-text">프레임 합성 중...</p>
         ) : (
           <img src={finalImage!} alt="Final Result" className={`final-result-img type-${frameConfig.type.toLowerCase()}`} />
         )}
      </div>

      <div className="action-buttons">
         <button className="btn-secondary" onClick={onBack}>
            <RefreshCcw size={20} />
            다시 찍기
         </button>
         <button className="btn-primary" onClick={handleDownload} disabled={isProcessing}>
            <Download size={20} />
            사진 저장
         </button>
      </div>
    </div>
  );
};

export default Result;
