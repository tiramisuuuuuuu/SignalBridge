type WelcomeScreenProps = {
  onSelectPrompt: (prompt: string) => void;
};

const suggestions = [
  {
    symbol: "!",
    title: "Emergency guidance",
    prompt: "What should I do during an emergency?",
  },
  {
    symbol: "⌖",
    title: "Find a shelter",
    prompt: "How can I find an open emergency shelter?",
  },
  {
    symbol: "✓",
    title: "Prepare essentials",
    prompt: "What should I pack in an emergency go-bag?",
  },
];

export function WelcomeScreen({ onSelectPrompt }: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-mark" aria-hidden="true">+</div>
      <p className="eyebrow">EMERGENCY RESPONSE ASSISTANT</p>
      <h1>
        What do you
        <br />
        <span>need help with?</span>
      </h1>
      <p className="welcome-description">
        Get practical guidance and find emergency resources. Start with a
        question below or describe what is happening.
      </p>

      <div className="suggestion-grid">
        {suggestions.map((item) => (
          <button
            className="suggestion-card"
            key={item.title}
            type="button"
            onClick={() => onSelectPrompt(item.prompt)}
          >
            <span className="suggestion-symbol" aria-hidden="true">{item.symbol}</span>
            <span className="suggestion-title">{item.title}</span>
            <span className="suggestion-prompt">{item.prompt}</span>
            <span className="suggestion-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>
    </div>
  );
}
