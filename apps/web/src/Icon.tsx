export type IconName =
  | "book"
  | "character"
  | "check"
  | "chevron"
  | "clock"
  | "content"
  | "redo"
  | "sheet"
  | "undo"
  | "warning";

const paths: Record<IconName, readonly string[]> = {
  book: [
    "M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z",
    "M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z",
  ],
  character: [
    "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M4.5 21a7.5 7.5 0 0 1 15 0",
  ],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  content: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  redo: ["M20 7h-7a7 7 0 0 0-7 7v3", "m16 3 4 4-4 4"],
  sheet: ["M6 3h9l3 3v15H6z", "M15 3v4h4", "M9 12h6", "M9 16h6"],
  undo: ["M4 7h7a7 7 0 0 1 7 7v3", "m8 3-4 4 4 4"],
  warning: ["M12 4 3 20h18z", "M12 9v5", "M12 17.5v.01"],
};

export function Icon({ name }: { readonly name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
    >
      {paths[name].map((path) => (
        <path
          d={path}
          key={path}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ))}
    </svg>
  );
}
