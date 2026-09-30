import React from 'react';
import { MapPin, Navigation, Compass, ExternalLink } from 'lucide-react';

interface SpaceLocationMapProps {
  address: string;
  commune: string;
  region: string;
  landmark?: string;
}

export const SpaceLocationMap: React.FC<SpaceLocationMapProps> = ({
  address,
  commune,
  region,
  landmark = 'Metro Bellas Artes a 150m',
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-5 sm:p-6 pb-4 flex items-center justify-between border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-rose-600" />
            <span>Ubicación y Entorno</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {address} • {commune}
          </p>
        </div>
        <span className="text-[11px] font-bold px-3 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200/80">
          {commune}, {region}
        </span>
      </div>

      <div className="relative w-full h-72 sm:h-80 bg-[#e5e9ec] overflow-hidden select-none">
        {/* SVG Styled Cartographic Background */}
        <svg className="w-full h-full object-cover" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c5dcfa" />
              <stop offset="100%" stopColor="#b4d2f8" />
            </linearGradient>
            <linearGradient id="parkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d5eddb" />
              <stop offset="100%" stopColor="#c7e7cf" />
            </linearGradient>
          </defs>

          {/* Base ground */}
          <rect width="800" height="400" fill="#f0f3f5" />

          {/* Green Parks / Urban Zones */}
          {/* Parque Forestal & Cerro Santa Lucía */}
          <path d="M 280,120 Q 380,140 480,130 Q 560,120 620,150 L 610,180 Q 480,165 370,175 Q 290,170 270,140 Z" fill="url(#parkGrad)" opacity="0.9" />
          {/* Parque Quinta Normal / Poniente */}
          <path d="M 40,110 Q 100,105 130,140 Q 120,200 60,195 Q 30,170 40,110 Z" fill="url(#parkGrad)" opacity="0.85" />
          {/* Parque O'Higgins / Sur */}
          <path d="M 220,280 Q 320,270 330,340 Q 280,380 210,360 Z" fill="url(#parkGrad)" opacity="0.75" />
          {/* Parque Inés de Suárez / Providencia */}
          <path d="M 520,230 Q 580,225 590,265 Q 540,290 510,270 Z" fill="url(#parkGrad)" opacity="0.85" />

          {/* Río Mapocho */}
          <path d="M 0,140 Q 150,150 280,135 T 480,125 T 680,115 T 800,130" fill="none" stroke="url(#riverGrad)" strokeWidth="18" strokeLinecap="round" />
          <path d="M 0,140 Q 150,150 280,135 T 480,125 T 680,115 T 800,130" fill="none" stroke="#9bc2f5" strokeWidth="2" strokeDasharray="6 4" />

          {/* Secondary Street Grid */}
          <path d="M 50,0 L 50,400 M 120,0 L 120,400 M 200,0 L 200,400 M 270,0 L 270,400 M 340,0 L 340,400 M 420,0 L 420,400 M 500,0 L 500,400 M 580,0 L 580,400 M 660,0 L 660,400 M 740,0 L 740,400" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <path d="M 0,60 L 800,60 M 0,110 L 800,110 M 0,170 L 800,170 M 0,220 L 800,220 M 0,270 L 800,270 M 0,330 L 800,330 M 0,380 L 800,380" fill="none" stroke="#ffffff" strokeWidth="2.5" />

          {/* Major Avenues (Alameda / Providencia, Santa Rosa, Vicuña Mackenna) */}
          <path d="M 0,200 L 800,200" fill="none" stroke="#ffe082" strokeWidth="8" />
          <path d="M 0,200 L 800,200" fill="none" stroke="#ffffff" strokeWidth="4" />
          <path d="M 370,0 L 370,400" fill="none" stroke="#ffe082" strokeWidth="7" />
          <path d="M 370,0 L 370,400" fill="none" stroke="#ffffff" strokeWidth="3.5" />

          {/* Autopista Central (Norte-Sur) */}
          <path d="M 180,0 L 180,400" fill="none" stroke="#ffd54f" strokeWidth="6" />

          {/* Highway 5 icon badge */}
          <rect x="110" y="78" width="18" height="18" rx="4" fill="#0284c7" />
          <text x="119" y="91" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle">5</text>

          {/* Landmarks Markers */}
          {/* Santiago Centro */}
          <text x="360" y="340" fill="#475569" fontSize="24" fontWeight="800" letterSpacing="0.5">Santiago</text>
          
          {/* Barrio Patronato */}
          <text x="430" y="100" fill="#64748b" fontSize="11" fontWeight="700">PATRONATO</text>
          
          {/* Barrio Lastarria */}
          <text x="495" y="180" fill="#64748b" fontSize="10" fontWeight="700">LASTARRIA</text>

          {/* Barrio Italia */}
          <text x="480" y="270" fill="#64748b" fontSize="10" fontWeight="700">BARRIO ITALIA</text>
        </svg>

        {/* Floating Landmarks Chips (styled exactly like the reference) */}
        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-xs border border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>Museo de la Memoria</span>
        </div>

        <div className="absolute top-24 right-8 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-xs border border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Los Descubridores</span>
        </div>

        <div className="absolute top-44 right-14 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-xs border border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Parque Inés de Suárez</span>
        </div>

        <div className="absolute bottom-16 right-16 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-xs border border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-sky-500"></span>
          <span>Mallplaza Egaña</span>
        </div>

        <div className="absolute bottom-5 right-24 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-xs border border-slate-200/80 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
          <span>Estadio Nacional Julio Martínez</span>
        </div>

        {/* Hospital Badge */}
        <div className="absolute top-6 left-28 w-6 h-6 rounded-full bg-rose-500 text-white font-bold text-xs flex items-center justify-center shadow-md">
          H
        </div>

        {/* MAIN PIN SPOTLIGHT: The Space itself with pulse and detailed pill */}
        <div className="absolute top-[38%] left-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer z-10">
          {/* Main Landmark Card Pin */}
          <div className="bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 border border-slate-700 ring-4 ring-rose-500/20 whitespace-nowrap animate-bounce-short">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
            <span>{address.split(',')[0]}</span>
            <span className="text-slate-400 font-normal">({landmark})</span>
          </div>

          {/* Pin Arrow */}
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-slate-900 drop-shadow-sm"></div>

          {/* Pin Target Dot */}
          <div className="w-3.5 h-3.5 rounded-full bg-rose-600 border-2 border-white shadow-md -mt-0.5"></div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-700 border border-slate-200/80 flex items-center gap-2 shadow-xs">
          <Navigation className="w-3.5 h-3.5 text-rose-600" />
          <span>Conectividad: Metro Línea 5 a pasos</span>
        </div>
      </div>
    </div>
  );
};
