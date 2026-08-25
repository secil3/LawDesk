function StateDisplay({ children, variant = "empty", compact = false }) {
  const className = `ui-state ui-state-${variant}${compact ? " compact" : ""}`;

  return (
    <div className={className} role={variant === "error" ? "alert" : "status"}>
      {variant === "loading" && <span className="spinner spinner-sm" aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

export function LoadingState({ children = "Yükleniyor...", compact = false }) {
  return <StateDisplay variant="loading" compact={compact}>{children}</StateDisplay>;
}

export function EmptyState({ children, compact = false }) {
  return <StateDisplay compact={compact}>{children}</StateDisplay>;
}

export default StateDisplay;
