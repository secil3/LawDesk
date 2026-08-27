import lawDeskIconDark from "../assets/brand/lawdesk-app-icon.png";
import lawDeskIconLight from "../assets/brand/lawdesk-icon-light.png";
import lawDeskIconReversed from "../assets/brand/lawdesk-icon-reversed.png";

function BrandLogo({ subtitle, compact = false, variant = "auto", className = "" }) {
  return (
    <span className={`lawdesk-brand ${compact ? "is-compact" : ""} is-${variant} ${className}`.trim()}>
      <span className="lawdesk-brand-icon-wrap" aria-hidden="true">
        <img
          className="lawdesk-brand-icon is-light"
          src={lawDeskIconLight}
          alt=""
        />
        <img
          className="lawdesk-brand-icon is-dark"
          src={lawDeskIconDark}
          alt=""
        />
        <img
          className="lawdesk-brand-icon is-reversed"
          src={lawDeskIconReversed}
          alt=""
        />
      </span>
      <span className="lawdesk-brand-copy">
        <span className="lawdesk-brand-wordmark" aria-label="LawDesk">
          <span className="lawdesk-brand-law">Law</span>
          <span className="lawdesk-brand-desk">Desk</span>
        </span>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </span>
  );
}

export default BrandLogo;
