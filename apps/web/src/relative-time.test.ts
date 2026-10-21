import { describe, expect, it } from "vitest";

import { exactDateTime, relativeDay } from "./relative-time";

// Local times, so the tests hold in any time zone.
const now = new Date(2026, 9, 21, 9, 30);
const at = (...parts: [number, number, number, number?]) =>
  new Date(parts[0], parts[1], parts[2], parts[3] ?? 12).toISOString();

describe("relativeDay", () => {
  it("counts calendar days, not 24-hour spans", () => {
    expect(relativeDay(at(2026, 9, 21, 0), now)).toBe("today");
    expect(relativeDay(at(2026, 9, 20, 23), now)).toBe("yesterday");
    expect(relativeDay(at(2026, 9, 19, 23), now)).toBe("2 days ago");
    expect(relativeDay(at(2026, 9, 9), now)).toBe("12 days ago");
  });

  it("switches to months and years once a calendar month has passed", () => {
    expect(relativeDay(at(2026, 8, 22), now)).toBe("29 days ago");
    expect(relativeDay(at(2026, 8, 21), now)).toBe("a month ago");
    expect(relativeDay(at(2026, 6, 1), now)).toBe("3 months ago");
    expect(relativeDay(at(2025, 9, 22), now)).toBe("11 months ago");
    expect(relativeDay(at(2025, 9, 21), now)).toBe("a year ago");
    expect(relativeDay(at(2023, 0, 1), now)).toBe("3 years ago");
  });

  it("reads a future time as today and rejects an unreadable one", () => {
    expect(relativeDay(at(2026, 9, 23), now)).toBe("today");
    expect(relativeDay("not a date", now)).toBeUndefined();
  });
});

describe("exactDateTime", () => {
  it("formats a readable timestamp and rejects an unreadable one", () => {
    expect(exactDateTime(at(2026, 9, 21))).toMatch(/2026/);
    expect(exactDateTime("")).toBeUndefined();
  });
});
