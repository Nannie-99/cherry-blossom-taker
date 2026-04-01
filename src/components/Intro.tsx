import { useState, useEffect } from 'react';
import { Camera, HelpCircle, X } from 'lucide-react';
import './Intro.css';

interface IntroProps {
  onNext: () => void;
}

const Intro = ({ onNext }: IntroProps) => {
  const [showHelp, setShowHelp] = useState(false);
  const [introPetals, setIntroPetals] = useState<any[]>([]);

  useEffect(() => {
    // Generate random petal data once on mount
    const petals = Array.from({ length: 15 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
      duration: `${5 + Math.random() * 5}s`
    }));
    setIntroPetals(petals);
  }, []);

  return (
    <div className="screen-layout intro-screen">
      <div className="petals-bg">
        {introPetals.map((p) => (
          <div key={p.id} className="intro-petal" style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration
          }}>🌸</div>
        ))}
      </div>

      <div className="intro-content glass-panel fade-in">
        <div className="title-group">
          <h1 className="main-title">벚꽃 네컷</h1>
          <h2 className="sub-title">우리 교실엔<br/>벌써 봄이 왔어요!</h2>
        </div>
        
        <div className="button-group">
          <button className="btn-primary start-btn" onClick={onNext}>
            <Camera size={24} />
            사진 찍으러 가기
          </button>
          
          <button className="btn-secondary help-btn" onClick={() => setShowHelp(true)}>
            <HelpCircle size={20} />
            사용방법
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="modal-overlay fade-in" onClick={() => setShowHelp(false)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)}><X size={24} /></button>
            <h3 className="modal-title">🌸 벚꽃 네컷 사용방법</h3>
            
            <div className="modal-body">
              <section className="modal-section">
                <h4>1. 카메라 설정</h4>
                <p>브라우저 상단에서 <strong>'카메라 권한 허용'</strong>을 꼭 눌러주세요.</p>
              </section>

              <section className="modal-section">
                <h4>2. 인식 팁</h4>
                <p>얼굴과 손이 화면에 잘 보이도록 <strong>1~1.5m 정도 거리</strong>를 유지해주세요. 밝은 곳에서 인식이 더 잘 됩니다!</p>
              </section>

              <section className="modal-section">
                <h4>3. 제스처 동작</h4>
                <ul className="gesture-list">
                  <li>✌️ <strong>(V 제스처)</strong> : 머리 위에 예쁜 화환이 나타나요.</li>
                  <li>🫶 <strong>(머리 위 손하트)</strong> : 머리 위에서 하트가 뿅 나타나요.</li>
                  <li>🤗 <strong>(손 꽃받침)</strong> : 머리 주변에 나비가 찾아와 날개짓해요.</li>
                  <li>🫴 <strong>(벚꽃 잡기)</strong> : 손바닥을 펴서 떨어지는 벚꽃을 받아보세요.</li>
                </ul>
              </section>

              <section className="modal-section">
                <h4>4. 촬영 중</h4>
                <p>셔터를 누르면 <strong>10초 간격으로 총 4번</strong> 연속으로 찍힙니다. 촬영 전까지 멋진 포즈를 준비해주세요!</p>
              </section>
            </div>
            
            <button className="btn-primary modal-ok" onClick={() => setShowHelp(false)}>확인했습니다!</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Intro;
