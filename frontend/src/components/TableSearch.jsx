function TableSearch({ value, onChange, placeholder, label, resultCount }) {
  return (
    <div className="table-search" role="search" aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {value ? (
        <button
          type="button"
          className="table-search-clear"
          onClick={() => onChange("")}
          aria-label="Aramayı temizle"
        >
          ×
        </button>
      ) : null}
      <span className="table-search-count" aria-live="polite">
        {resultCount} sonuç
      </span>
    </div>
  );
}

export default TableSearch;
