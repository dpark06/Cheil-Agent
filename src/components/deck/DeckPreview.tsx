interface DeckSlide {
  title: string;
  explanationSummary: string;
  discussionQuestions: string[];
}

interface DeckPlan {
  deckTitle: string;
  slides: DeckSlide[];
}

export function DeckPreview({ plan }: { plan: DeckPlan }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-stone bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-black/40">Title slide</p>
        <p className="mt-1 text-sm font-medium text-samsung-blue">{plan.deckTitle}</p>
      </div>
      {plan.slides.map((slide, i) => (
        <div key={i} className="rounded-lg border border-stone bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-black/40">
            Slide {i + 2}
          </p>
          <p className="mt-1 text-sm font-medium text-samsung-blue">{slide.title}</p>
          <p className="mt-1 text-sm text-black/70">{slide.explanationSummary}</p>
          {slide.discussionQuestions.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-black/50">
              {slide.discussionQuestions.map((q, j) => (
                <li key={j}>{q}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
