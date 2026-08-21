const visiblePagesFor = (currentPage, totalPages) => {
  if (totalPages <= 1) {
    return [1];
  }

  const pages = new Set([1, totalPages, currentPage]);

  [currentPage - 1, currentPage + 1].forEach((page) => {
    if (page > 1 && page < totalPages) {
      pages.add(page);
    }
  });

  const sortedPages = [...pages].sort((a, b) => a - b);
  const visiblePages = [];

  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1] > 1) {
      visiblePages.push(`ellipsis-${page}`);
    }

    visiblePages.push(page);
  });

  return visiblePages;
};

function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
  disabled = false,
  label = "Sayfalama",
}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotalPages = Math.max(0, Number(totalPages) || 0);

  if (safeTotalPages <= 1) {
    return null;
  }

  return (
    <nav className="list-pagination" aria-label={label}>
      <span className="list-pagination-summary">
        Toplam {Number(total) || 0} kayıt
      </span>

      <div className="list-pagination-controls">
        <button
          type="button"
          className="secondary-button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={disabled || safePage <= 1}
        >
          Önceki
        </button>

        {visiblePagesFor(safePage, safeTotalPages).map((item) => {
          if (typeof item === "string") {
            return (
              <span className="pagination-ellipsis" key={item} aria-hidden="true">
                ...
              </span>
            );
          }

          return (
            <button
              type="button"
              className={item === safePage ? "pagination-page active" : "pagination-page"}
              key={`page-${item}`}
              onClick={() => onPageChange(item)}
              disabled={disabled || item === safePage}
              aria-current={item === safePage ? "page" : undefined}
            >
              {item}
            </button>
          );
        })}

        <button
          type="button"
          className="secondary-button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={disabled || safePage >= safeTotalPages}
        >
          Sonraki
        </button>
      </div>
    </nav>
  );
}

export default PaginationControls;
