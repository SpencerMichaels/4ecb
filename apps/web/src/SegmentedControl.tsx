import { useId } from "react";

/**
 * One choice from a few short options, as a row as wide as its options
 * (selection is an underline). Native radios keep arrow-key behaviour.
 * `labelHidden` keeps the label as the group's accessible name only, for a
 * toolbar whose options say enough on their own.
 */
export function SegmentedControl<Value extends string>({
  label,
  labelHidden = false,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly labelHidden?: boolean;
  readonly options: readonly (readonly [Value, string])[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented-control">
      <legend {...(labelHidden ? { className: "visually-hidden" } : {})}>
        {label}
      </legend>
      <div className="segmented-control-options">
        {options.map(([option, optionLabel]) => (
          <label key={option}>
            <input
              className="visually-hidden"
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
            />
            <span className="segmented-control-text" data-text={optionLabel}>
              {optionLabel}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
