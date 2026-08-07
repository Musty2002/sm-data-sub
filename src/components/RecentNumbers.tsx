interface RecentNumbersProps {
  numbers: string[];
  onSelect: (phone: string) => void;
}

export function RecentNumbers({ numbers, onSelect }: RecentNumbersProps) {
  if (!numbers.length) return null;

  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground mb-1.5">Recent numbers</p>
      <div className="flex flex-wrap gap-2">
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            className="px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
