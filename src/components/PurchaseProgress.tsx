import { useEffect, useState } from 'react';
import { Check, Loader } from 'lucide-react';

const steps = ['Request Sent', 'Processing', 'Confirming Delivery'];

/** Visual tracker shown while a purchase is in flight. */
export function PurchaseProgress({ active }: { active: boolean }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) { setStage(0); return; }
    setStage(1);
    const t = setTimeout(() => setStage(2), 4000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start">
        {steps.map((label, i) => {
          const done = i < stage;
          const current = i === stage;
          return (
            <div key={label} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div className={`absolute top-4 right-1/2 w-full h-0.5 -z-0 ${i <= stage ? 'bg-success' : 'bg-border'}`} />
              )}
              <div
                className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  done
                    ? 'bg-success border-success text-success-foreground'
                    : current
                    ? 'bg-card border-primary'
                    : 'bg-muted border-border'
                }`}
              >
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : (
                  <span className={`w-3 h-3 rounded-full ${current ? 'border-2 border-primary' : 'bg-muted-foreground/40'}`} />
                )}
              </div>
              <span className={`mt-1.5 text-[11px] text-center ${done || current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/10">
        <Loader className="w-7 h-7 text-primary animate-spin shrink-0" />
        <div>
          <p className="font-bold text-foreground">Processing your purchase...</p>
          <p className="text-xs text-muted-foreground">Please keep the app open. This usually takes a few seconds.</p>
        </div>
      </div>
    </div>
  );
}
