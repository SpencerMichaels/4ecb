export type IconName =
  | "ability"
  | "background"
  | "book"
  | "class"
  | "character"
  | "check"
  | "chevron"
  | "clock"
  | "content"
  | "details"
  | "feat"
  | "item"
  | "level"
  | "power"
  | "race"
  | "redo"
  | "sheet"
  | "skill"
  | "undo"
  | "warning";

const paths: Record<IconName, readonly string[]> = {
  ability: [
    "M12 3v18",
    "M3 12h18",
    "m5-5 8 10",
    "m8-10-8 10",
    "M12 3 9 7l-9 5-9-5z",
  ],
  background: ["M3 19 9 9l4 5 3-4 5 9z", "M15.5 6.5h.01"],
  book: [
    "M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z",
    "M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z",
  ],
  class: ["M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6z"],
  character: [
    "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M4.5 21a7.5 7.5 0 0 1 15 0",
  ],
  check: ["m5 12 4 4L19 6"],
  chevron: ["m9 18 6-6-6-6"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  content: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"],
  details: ["M6 3h9l3 3v15H6z", "M9 9h6", "M9 13h6", "M9 17h4"],
  feat: [
    "m12 3 2.2 5.2L20 6l-2.2 5.2L21 14l-5.5.5L15 20l-3-4.5L9 20l-.5-5.5L3 14l3.2-2.8L4 6l5.8 2.2z",
  ],
  item: ["M6 8h12l1 13H5z", "M9 8V6a3 3 0 0 1 6 0v2"],
  level: ["m5 17 7-7 7 7", "m5 11 7-7 7 7"],
  power: ["m13 2-8 12h6l-1 8 9-13h-6z"],
  race: [
    "M5 21c.8-4.3 3.1-6.5 7-6.5s6.2 2.2 7 6.5",
    "M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  ],
  redo: ["M20 7h-7a7 7 0 0 0-7 7v3", "m16 3 4 4-4 4"],
  sheet: ["M6 3h9l3 3v15H6z", "M15 3v4h4", "M9 12h6", "M9 16h6"],
  skill: ["m5 12 4 4L19 6", "M4 4h16v16H4z"],
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
