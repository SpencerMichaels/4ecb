// Full-page loading landmark shared by route chunks, the builder and the
// sheet: a centered spinner (ringing the character portrait once it's
// known) with a short status line underneath.
export function LoadingScreen({
  label,
  detail,
  className,
  routeLoading = false,
  portraitUrl,
}: {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly className?: string;
  readonly routeLoading?: boolean;
  readonly portraitUrl?: string | undefined;
}) {
  return (
    <main
      aria-busy="true"
      className={["loading-screen", className].filter(Boolean).join(" ")}
      {...(routeLoading ? { "data-route-loading": "true" } : {})}
      id="main-content"
    >
      <div className="loading-screen-body" role="status">
        {/* The frame is the same size with or without a portrait, so the
            portrait appearing mid-load doesn't move anything. */}
        <span aria-hidden="true" className="loading-spinner-frame">
          <span className="loading-spinner" />
          {portraitUrl === undefined ? null : (
            <img alt="" className="loading-portrait" src={portraitUrl} />
          )}
        </span>
        <p className="loading-screen-label">{label}</p>
        {/* Always reserve the detail line so the spinner doesn't jump when
            a later loading phase adds one. */}
        <p className="loading-screen-detail">{detail ?? " "}</p>
      </div>
    </main>
  );
}
