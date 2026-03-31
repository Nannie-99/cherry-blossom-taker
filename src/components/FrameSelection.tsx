import { Monitor, Smartphone } from 'lucide-react';
import type { FrameConfig } from '../App';
import './FrameSelection.css';

interface FrameSelectionProps {
  onSelect: (frame: FrameConfig) => void;
  onBack: () => void;
}

const FrameSelection = ({ onSelect, onBack }: FrameSelectionProps) => {
  return (
    <div className="screen-layout selection-screen fade-in">
      <h2 className="title-text selection-title">원하는 프레임을 선택하세요!</h2>

      <div className="frame-options">
        {/* Type A: Desktop (2×6 in, 1×4 vertical) */}
        <div
          className="frame-card glass-panel"
          onClick={() => onSelect({ type: 'A', cols: 1, rows: 4, totalShots: 4 })}
        >
          <div className="frame-icon"><Monitor size={48} color="#FF9AA2" /></div>
          <h3>세로네컷 A형</h3>
          <p>데스크톱 · 2×6인치 출력<br />세로로 4컷이 쌓이는 클래식 스타일</p>
          <div className="frame-preview frame-a">
            <div className="cut"></div><div className="cut"></div>
            <div className="cut"></div><div className="cut"></div>
          </div>
        </div>

        {/* Type B: Mobile (4×6 in, 2×2 grid) */}
        <div
          className="frame-card glass-panel"
          onClick={() => onSelect({ type: 'B', cols: 2, rows: 2, totalShots: 4 })}
        >
          <div className="frame-icon"><Smartphone size={48} color="#FF9AA2" /></div>
          <h3>가로네컷 B형</h3>
          <p>모바일 · 4×6인치 출력<br />2×2 그리드로 배치되는 귀여운 스타일</p>
          <div className="frame-preview frame-b">
            <div className="cut"></div><div className="cut"></div>
            <div className="cut"></div><div className="cut"></div>
          </div>
        </div>
      </div>

      <button className="back-btn" onClick={onBack}>← 뒤로가기</button>
    </div>
  );
};

export default FrameSelection;
