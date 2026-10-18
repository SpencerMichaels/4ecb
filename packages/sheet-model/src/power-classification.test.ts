import { describe, expect, it } from "vitest";

import {
  classifyPower,
  powerActionLabel,
  powerActionRank,
} from "./power-classification";

describe("classifyPower", () => {
  it("labels attack powers by usage, never by their attack power type", () => {
    const power = classifyPower({
      usage: "Encounter",
      powerType: "Attack",
      actionType: "Standard Action",
      level: "7",
    });
    expect(power.compactLabel).toBe("Encounter 7");
    expect(power.typeLabel).toBe("Encounter power");
    expect(power.tone).toBe("encounter");
  });

  it("treats class-feature powers with an action as ordinary powers", () => {
    const power = classifyPower({
      usage: "At-Will",
      powerType: "Feature",
      actionType: "Minor Action",
    });
    expect(power.feature).toBe(false);
    expect(power.compactLabel).toBe("At-Will");
    expect(power.typeLabel).toBe("At-Will power");
    expect(power.tone).toBe("at-will");
  });

  it("classifies action-less rules references as features", () => {
    const sanction = classifyPower({
      usage: "At-Will",
      powerType: "Feature",
      rulesItem: "Many new paladin powers…",
    });
    expect(sanction).toMatchObject({
      feature: true,
      usage: undefined,
      tone: "feature",
      typeLabel: "Feature",
      compactLabel: "Feature",
    });
    expect(
      classifyPower({ usage: "At-Will", powerType: "Feature" }).feature,
    ).toBe(true);
  });

  it("keeps action-less companion stat blocks as powers of their usage", () => {
    expect(classifyPower({ usage: "At-Will" }).compactLabel).toBe("At-Will");
  });

  it("gives utility powers their own type and tone", () => {
    const power = classifyPower({
      usage: "Daily (Special)",
      powerType: "Utility",
      actionType: "Minor Action",
      level: "2",
    });
    expect(power.compactLabel).toBe("Daily Utility 2");
    expect(power.typeLabel).toBe("Daily Utility power (Special)");
    expect(power.tone).toBe("utility");
    expect(power.usage).toBe("daily");
  });

  it("falls back to a neutral power without an authored usage", () => {
    expect(classifyPower({ level: "3" })).toMatchObject({
      tone: "neutral",
      compactLabel: "Power 3",
      typeLabel: "Power",
    });
  });
});

describe("powerActionLabel", () => {
  it.each([
    ["No Action", "No Action"],
    [" no action ", "No Action"],
    ["No Action (special)", "No Action (special)"],
    ["Standard Action", "Standard"],
    ["Free Action", "Free"],
    ["Immediate Reaction", "Immediate Reaction"],
    [undefined, undefined],
    ["", undefined],
  ])("formats the action label %s as %s", (source, expected) => {
    expect(powerActionLabel(source)).toBe(expected);
  });
  it("normalizes authored casing and keeps Free and No Action distinct", () => {
    expect(powerActionLabel("Standard action")).toBe("Standard");
    expect(powerActionLabel("Minor Action")).toBe("Minor");
    expect(powerActionLabel("Immediate interrupt")).toBe("Immediate Interrupt");
    expect(powerActionLabel("Opportunity Action")).toBe("Opportunity");
    expect(powerActionLabel("Free action")).toBe("Free");
    expect(powerActionLabel("No action")).toBe("No Action");
    expect(powerActionLabel(" ")).toBeUndefined();
  });

  it("orders Free before No Action", () => {
    const actions = [
      "Immediate Reaction",
      "No Action",
      "Free Action",
      "Minor Action",
      "Move Action",
      "Standard Action",
    ];
    expect(
      [...actions].sort((a, b) => powerActionRank(a) - powerActionRank(b)),
    ).toEqual([
      "Standard Action",
      "Move Action",
      "Minor Action",
      "Free Action",
      "No Action",
      "Immediate Reaction",
    ]);
  });
});
