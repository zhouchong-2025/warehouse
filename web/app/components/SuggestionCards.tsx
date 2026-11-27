"use client";

type Suggestion = {
  text: string;
  query: string;
  reason: string;
};

type Props = {
  suggestions: Suggestion[];
  search: string;
  onApplySuggestion: (query: string) => void;
  /** "banner" = compact inline style; "full" = standalone cards with icon */
  variant?: "banner" | "full";
};

export default function SuggestionCards({
  suggestions,
  search,
  onApplySuggestion,
  variant = "banner",
}: Props) {
  if (suggestions.length === 0) return null;

  if (variant === "full") {
    return (
      <div className="max-w-xl mx-auto text-left space-y-3">
        <div className="text-2xl mb-2">💡 建议</div>
        {suggestions.map((s, i) => (
          <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
            <p className="text-[#e6edf3] text-sm leading-relaxed">{s.text}</p>
            {s.query && s.query !== search && (
              <button
                onClick={() => onApplySuggestion(s.query)}
                className="mt-3 text-xs px-2.5 py-1 rounded border border-[#1e6ef0]/30 text-[#58a6ff] hover:bg-[#1e6ef0]/10 transition-colors"
              >
                查看这组结果
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-4 max-w-3xl">
      {suggestions.map((s, i) => (
        <div key={i} className="bg-[#d29922]/5 border border-[#d29922]/20 rounded-lg p-3 mb-2">
          <p className="text-[#e6edf3] text-sm">{s.text}</p>
          {s.query && s.query !== search && (
            <button
              onClick={() => onApplySuggestion(s.query)}
              className="mt-2 text-xs px-2.5 py-1 rounded border border-[#d29922]/30 text-[#d29922] hover:bg-[#d29922]/10 transition-colors"
            >
              用这个条件重搜
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
