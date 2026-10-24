type ChatHeaderProps = {
  onNewChat: () => void;
};

export function ChatHeader({ onNewChat }: ChatHeaderProps) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="/"
        onClick={(event) => {
          event.preventDefault();
          onNewChat();
        }}
        aria-label="Signal Bridge home"
      >
        <span className="brand-mark" aria-hidden="true">+</span>
        <span>Signal Bridge</span>
      </a>

      <div className="header-actions">
        <span className="service-status">
          <span className="status-dot" />
          Emergency information
        </span>
        <button className="new-chat-button" onClick={onNewChat} type="button">
          New chat
        </button>
      </div>
    </header>
  );
}
