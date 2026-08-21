import { useEffect, useState } from "react";

import { readResponse } from "../api";

const KIND_LABELS = {
  task: "Görev",
  group: "Grup",
  user: "Kullanıcı",
  taskType: "Görev tipi",
  tag: "Etiket",
  activity: "Denetim izi",
};

function GlobalSearch({ onNavigate }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          limit: "5",
        });
        const response = await fetch(`/api/search?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await readResponse(response);

        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (requestError) {
        if (requestError?.name !== "AbortError") {
          setResults([]);
          setError(requestError.message || "Arama tamamlanamadı");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const openResult = (result) => {
    if (!result?.path) {
      return;
    }

    setQuery("");
    setResults([]);
    onNavigate?.(result.path);
  };

  return (
    <section className="global-search" aria-labelledby="global-search-title">
      <div className="global-search-heading">
        <div>
          <p className="eyebrow">Genel arama</p>
          <h3 id="global-search-title">LawDesk içinde ara</h3>
        </div>
        <span className="global-search-scope">
          Yalnızca görme yetkiniz olan kayıtlar
        </span>
      </div>

      <label className="global-search-field">
        <span className="sr-only">Genel arama metni</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Görev, yorum, dosya, grup, kullanıcı, etiket veya görev tipi ara..."
          maxLength={100}
          autoComplete="off"
        />
      </label>

      {trimmedQuery.length === 1 && (
        <p className="global-search-hint">Arama için bir karakter daha girin.</p>
      )}

      {trimmedQuery.length >= 2 && (
        <div className="global-search-results" aria-live="polite">
          {loading ? (
            <p className="global-search-state">Aranıyor...</p>
          ) : error ? (
            <p className="global-search-state error-message" role="alert">
              {error}
            </p>
          ) : results.length === 0 ? (
            <p className="global-search-state">Eşleşen kayıt bulunamadı.</p>
          ) : (
            <ul>
              {results.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <button type="button" onClick={() => openResult(result)}>
                    <span className="global-search-kind">
                      {KIND_LABELS[result.kind] || "Kayıt"}
                    </span>
                    <span className="global-search-result-copy">
                      <strong>{result.title}</strong>
                      {result.subtitle && <small>{result.subtitle}</small>}
                    </span>
                    <span className="global-search-open" aria-hidden="true">
                      Aç
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default GlobalSearch;
