import { unavailablePresentation } from "./builder-ui";

/**
 * The one "this option can't be chosen" label: a candidate card's
 * subheading (`layout="card"`, a rule reason as its own paragraph) and a
 * table row's or choice button's note (`layout="inline"`). A permission
 * reason is merged into the label; the full reason is always its
 * accessible description.
 */
export function UnavailableLabel({
  reasons,
  layout,
}: {
  readonly reasons: readonly string[];
  readonly layout: "card" | "inline";
}) {
  const { label, reason, description } = unavailablePresentation(reasons);
  const badge = (
    <span className="candidate-unavailable" title={description}>
      {label}
    </span>
  );
  if (layout === "card")
    return (
      <>
        {badge}
        {reason === undefined ? null : (
          <p className="candidate-reason">{reason}</p>
        )}
      </>
    );
  return (
    <span className="unavailable-note">
      {badge}
      {reason === undefined ? null : <small>{reason}</small>}
    </span>
  );
}
