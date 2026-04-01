import { useState } from 'react';
import Intro from './components/Intro';
import FrameSelection from './components/FrameSelection';
import CameraCapture from './components/CameraCapture';
import Result from './components/Result';
import './App.css';

export type ScreenState = 'intro' | 'selection' | 'camera' | 'result';
export type FrameConfig = { type: 'A' | 'B'; cols: number; rows: number; totalShots: number };

function App() {
  const [screen, setScreen] = useState<ScreenState>('intro');
  const [selectedFrame, setSelectedFrame] = useState<FrameConfig | null>(null);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [finalImage, setFinalImage] = useState<string | null>(null);

  const handleFrameSelect = (frame: FrameConfig) => {
    setSelectedFrame(frame);
    setScreen('camera');
  };

  const handleCaptureComplete = (images: string[]) => {
    setCapturedImages(images);
    setScreen('result');
  };

  return (
    <div className="app-container">
      {screen === 'intro' && (
        <Intro onNext={() => setScreen('selection')} />
      )}
      {screen === 'selection' && (
        <FrameSelection onSelect={handleFrameSelect} onBack={() => setScreen('intro')} />
      )}
      {screen === 'camera' && selectedFrame && (
        <CameraCapture 
          frameConfig={selectedFrame} 
          onComplete={handleCaptureComplete} 
          onBack={() => setScreen('selection')} 
        />
      )}
      {screen === 'result' && selectedFrame && (
        <Result 
          images={capturedImages} 
          frameConfig={selectedFrame} 
          onBack={() => setScreen('camera')} 
          finalImage={finalImage}
          setFinalImage={setFinalImage}
        />
      )}

      <footer className="global-footer">
        <div className="footer-left">© 2026. 난쌤 All rights reserved.</div>
        <div className="footer-right">문의 사항은 @hello.nan_ssaem</div>
      </footer>
    </div>
  );
}

export default App;
