import { Wifi, Phone, Zap, Tv, BookOpen, Megaphone, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const services = [
  { icon: Phone, label: 'Airtime', path: '/airtime' },
  { icon: Wifi, label: 'Data', path: '/data' },
  { icon: Zap, label: 'Electricity', path: '/electricity' },
  { icon: Tv, label: 'TV Sub', path: '/tv' },
  { icon: BookOpen, label: 'Exam PIN', path: '/exam-pin' },
  { icon: Megaphone, label: 'Reseller Promo', path: '/reseller-promo' },
];

export function ServicesGrid() {
  const navigate = useNavigate();

  return (
    <div className="px-4 md:px-6 py-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-extrabold text-foreground">Services</h3>
        <button onClick={() => navigate('/services')} className="text-xs font-semibold text-secondary flex items-center">
          See All <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {services.map(({ icon: Icon, label, path }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className="relative bg-card border border-border/60 rounded-xl shadow-sm flex flex-col items-center justify-center pt-3 pb-4 gap-1.5 active:scale-95 transition"
          >
            <span
              className="w-11 h-11 rounded-full flex items-center justify-center shadow-md text-secondary-foreground"
              style={{ background: 'var(--gradient-balance)' }}
            >
              <Icon className="w-5 h-5" strokeWidth={2.3} />
            </span>
            <span className="text-[10px] font-semibold text-foreground text-center leading-tight px-1">{label}</span>
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-secondary flex items-center justify-center">
              <ChevronRight className="w-2.5 h-2.5 text-secondary-foreground" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
