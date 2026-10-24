import type { FormEvent } from "react";

type ChatComposerProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ChatComposer({
  value,
  loading,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  return (
    <div className="composer-area">
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Describe the situation or ask about shelters, evacuation, or supplies…"
          aria-label="Emergency response question"
          rows={2}
          disabled={loading}
        />
        <div className="composer-footer">
          <span className="composer-hint">Enter to send · Shift + Enter for a new line</span>
          <button
            className="send-button"
            type="submit"
            disabled={!value.trim() || loading}
            aria-label="Send question"
          >
            {loading ? <span className="send-spinner" /> : <span aria-hidden="true">↑</span>}
          </button>
        </div>
      </form>
      <p className="disclaimer">
        If someone is in immediate danger, contact local emergency services.
        Confirm critical updates with official sources.
      </p>
    </div>
  );
}
