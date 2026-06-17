import { useState, useEffect } from 'react';
import { BookOpen, Users, Wifi, Settings } from 'lucide-react';
import { AuthModal } from './AuthModal';

function RandomEye() {
  const openFrames = [
    '/eye_frames_v3/final_0.png','/eye_frames_v3/final_1.png','/eye_frames_v3/final_2.png',
    '/eye_frames_v3/final_3.png','/eye_frames_v3/final_4.png','/eye_frames_v3/final_5.png',
    '/eye_frames_v3/final_6.png',
  ];
  const frames = [...openFrames, ...openFrames.slice().reverse()];
  const frameDurations = [90,90,90,90,90,90,500, 90,90,90,90,90,90,90];

  const [pos, setPos] = useState({ top: 8, left: 5 });
  const [visible, setVisible] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    const randomPos = () => {
      const left = Math.random() < 0.5
        ? 2 + Math.random() * 13    // fascia sinistra: 2%–15%
        : 85 + Math.random() * 10;  // fascia destra: 85%–95%
      return { top: 10 + Math.random() * 75, left };
    };

    const playCycle = () => {
      setPos(randomPos());
      setFrameIndex(0);
      setVisible(true);
      let elapsed = 0;
      frames.forEach((_, i) => {
        if (i === 0) return;
        elapsed += frameDurations[i - 1];
        const t = setTimeout(() => setFrameIndex(i), elapsed);
        timers.push(t);
      });
      const totalDuration = frameDurations.reduce((a, b) => a + b, 0);
      const hideT = setTimeout(() => setVisible(false), totalDuration);
      timers.push(hideT);
    };

    const firstShow = setTimeout(playCycle, 1500);
    const interval = setInterval(playCycle, 5000);

    return () => {
      clearTimeout(firstShow);
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <img
      src={frames[frameIndex]}
      alt=""
      style={{
        position: 'absolute',
        top: `${pos.top}%`,
        left: `${pos.left}%`,
        width: '110px',
        height: 'auto',
        opacity: visible ? 0.7 : 0,
        transition: 'opacity 0.25s ease-in-out',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
}

export default function LandingPage() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div style={{ backgroundColor: '#000', minHeight: '100vh', height: '100vh', overflow: 'visible', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'serif', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {/* HEADER */}
      <header style={{ backgroundImage:"url('/header-pattern.png')", backgroundSize:'auto 100%', backgroundPosition:'center bottom', backgroundRepeat:'repeat-x', height:'130px', position:'relative' }}>
        <div style={{ position:'relative', zIndex:10, height:'100%', display:'flex', justifyContent:'flex-end', alignItems:'center', padding:'0 2rem' }}>
          <div style={{ display:'flex', gap:'1rem' }}>
            <button
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(220,220,220,0.3)')}
              onMouseOut={e => (e.currentTarget.style.background = 'rgba(180,180,180,0.15)')}
              style={{ background:'rgba(180,180,180,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:999, padding:'0.4rem 1.2rem', color:'#fff', cursor:'pointer' }}
            >Scopri di più</button>
            <button
              onClick={() => setShowAuthModal(true)}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(220,220,220,0.3)')}
              onMouseOut={e => (e.currentTarget.style.background = 'rgba(180,180,180,0.15)')}
              style={{ background:'rgba(180,180,180,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:999, padding:'0.4rem 1.2rem', color:'#fff', cursor:'pointer' }}
            >Accedi/Registrati</button>
          </div>
        </div>
      </header>

      {/* HERO + FEATURES in una sola section */}
      <section style={{ position: 'relative', height: '100vh', maxHeight: '100vh', backgroundColor: '#000', overflow: 'hidden' }}>

        {/* Logo sfondo */}
        <img
          src="/hollowgate-logo.png"
          alt=""
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', height: '65%', width: 'auto', objectFit: 'contain', opacity: 0.7, filter: 'brightness(1.8) contrast(1.1)', zIndex: 0, pointerEvents: 'none' }}
        />

        {/* Occhi animati casuali */}
        <RandomEye />

        {/* Contenuto: testo in cima, card in fondo */}
        <div style={{ position: 'relative', zIndex: 10, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '2rem' }}>

          {/* Testo hero in cima */}
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', paddingTop: '1rem' }}>
            <img src="/title-main.png" alt="Varca la Soglia" style={{ maxWidth:'45%', height:'auto', objectFit:'contain' }} />
            <img src="/title-sub.png" alt="Il Virtual Tabletop per le tue avventure horror" style={{ maxWidth:'55%', height:'auto', objectFit:'contain' }} />
          </div>

          {/* Card features in fondo */}
          <div style={{ display: 'flex', gap: '1.5rem', width: '100%', maxWidth: 1200 }}>
            {[
              { icon: <BookOpen size={28} />, title: 'Gestisci Campagne', desc: 'Organizza avventure, elementi di gioco e scenari in un unico posto.' },
              { icon: <Users size={28} />, title: 'Crea Personaggi unici', desc: 'Schede con abilità, equipaggiamento e storia.' },
              { icon: <Wifi size={28} />, title: 'Gioca Online', desc: 'Sessioni in tempo reale con il tuo gruppo ovunque.' },
              { icon: <Settings size={28} />, title: 'Regolamenti integrati', desc: 'Regolamenti GDR disponibili o personalizzabili.' },
            ].map((f, i) => (
              <div
                key={i}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(42,42,42,0.9)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(26,26,26,0.85)')}
                style={{ backgroundColor: 'rgba(26,26,26,0.85)', border: '1px solid #333', borderRadius: 12, padding: '1.25rem', flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '1rem', transition: 'background 0.2s' }}
              >
                <div style={{ color: '#888', flexShrink: 0, marginTop: 2 }}>{f.icon}</div>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff', marginBottom: '0.4rem' }}>{f.title}</div>
                  <div style={{ color: '#666', fontSize: '0.875rem' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ backgroundImage:"url('/footer-pattern.png')", backgroundSize:'auto 100%', backgroundPosition:'center top', backgroundRepeat:'repeat-x', height:'150px', position:'relative' }}>
        <div style={{ position:'relative', zIndex:10, height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ color:'#ccc', fontSize:'0.85rem', fontWeight:'bold', textShadow:'0 1px 4px #000' }}>© 2026 Germanò Alfonso</span>
        </div>
      </footer>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
