import { Wifi, Phone, Zap, Tv, BookOpen, Globe, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const services = [
  { icon: Phone, label: 'Airtime', path: '/airtime', color: 'text-emerald-500' },
  { icon: Wifi, label: 'Data', path: '/data', color: 'text-purple-500' },
  { icon: Zap, label: 'Electricity', path: '/electricity', color: 'text-amber-500' },
  { icon: Tv, label: 'TV Sub', path: '/tv', color: 'text-primary' },
  { icon: BookOpen, label: 'Exam Pin', path: '/exam-pin', color: 'text-indigo-500' },
  { icon: Globe, label: 'Internet', path: '/data', color: 'text-secondary' },
];

export function ServicesGrid() {
  const navigate = useNavigate();

  return (
    <div className="px-4 md:px-6 py-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-foreground">All Services</h3>
        <button
          onClick={() => navigate('/services')}
          className="text-xs font-semibold text-primary flex items-center gap-0.5"
        >
          See All <ChevronRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {services.map(({ icon: Icon, label, path, color }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className="bg-card border border-border/60 rounded-xl shadow-sm flex flex-col items-center justify-center py-3.5 gap-1.5 hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            <Icon className={`w-6 h-6 ${color}`} strokeWidth={2.2} />
            <span className="text-[11px] font-semibold text-foreground">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}