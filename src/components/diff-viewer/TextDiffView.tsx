interface Change {
  value: string;
  added?: boolean;
  removed?: boolean;
}

export function TextDiffView({ changes }: { changes: Change[] }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {changes.map((c, i) => {
        if (c.added) {
          return (
            <span key={i} className="bg-celadon/50 text-black">
              {c.value}
            </span>
          );
        }
        if (c.removed) {
          return (
            <span key={i} className="bg-pulse/15 text-pulse line-through">
              {c.value}
            </span>
          );
        }
        return (
          <span key={i} className="text-black/80">
            {c.value}
          </span>
        );
      })}
    </p>
  );
}
