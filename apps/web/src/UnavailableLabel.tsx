import { unavailablePresentation } from "./builder-ui";

/**
 * The one "this option can't be chosen" label, on a candidate card (its
 * subheading), a table row and a choice button: "Unavailable …" for a
 * permission reason, "Illegal: <reason>" for a rule, "Unverified: …" for
 * a prerequisite the engine can't check (`unavailablePresentation`). It is
 * the only text for the status; every reason in full is its title, and the
 * status picks the tone modifier class.
 */
export function UnavailableLabel({
  reasons,
}: {
  readonly reasons: readonly string[];
}) {
  const { label, description, status } = unavailablePresentation(reasons);
  return (
    <span
      className={`candidate-unavailable candidate-unavailable-${status}`}
      title={description}
    >
      {label}
    </span>
  );
}
