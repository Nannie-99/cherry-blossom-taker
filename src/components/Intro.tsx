import { Camera } from 'lucide-react';
import './Intro.css';

interface IntroProps {
  onNext: () => void;
}

const Intro = ({ onNext }: IntroProps) => {
  return (
    <div className="screen-layout intro-screen">
      {/* Decorative falling petals just for intro background via css */}
      <div className="petals-bg">
        {Array.from({ length: 15 }).map((_, i) => (
          <div key={i} className="intro-petal" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${5 + Math.random() * 5}s`
          }}>🌸</div>
        ))}
      </div>

      <div className="intro-content glass-panel fade-in">
        <h1 className="title-text intro-title">
          우리 교실엔<br/>벌써 봄이 왔어요!
        </h1>
        <p className="intro-subtitle">손바닥으로 벚꽃을 받고, 하트를 그려보세요!</p>
        
        <button className="btn-primary start-btn" onClick={onNext}>
          <Camera size={24} />
          사진 찍으러 가기
        </button>
      </div>
    </div>
  );
};

export default Intro;
