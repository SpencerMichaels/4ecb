import { unavailablePresentation } from "./builder-ui";

/**
 * The one "this option can't be chosen" label, on a candidate card (its
 * subheading), a table row and a choice button: "Unavailable …" for a
 * permission reason, "Illegal: <reason>" for a rule
 * (`unavailablePresentation`). It is the only text for the status; every
 * reason in full is its title.
 */
export function UnavailableLabel({
  reasons,
}: {
  readonly reasons: readonly string[];
}) {
  const { label, description } = unavailablePresentation(reasons);
  return (
    <span className="candidate-unavailable" title={description}>
      {label}
    </span>
  );
}
