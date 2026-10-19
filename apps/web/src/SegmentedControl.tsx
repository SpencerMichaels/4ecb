import { useId } from "react";

/**
 * One choice from a few short options, as a row as wide as its options
 * (selection is an underline). Native radios keep arrow-key behaviour.
 */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly (readonly [Value, string])[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}) {
  const name = useId();
  return (
    <fieldset className="segmented-control">
      <legend>{label}</legend>
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
            {optionLabel}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
