import { describe, expect, it } from "vitest";
import { toLocalCalendarDate } from "@/lib/utils/calendar-date";
import {
  areFilterStatesEqual,
  normalizeFilterState,
} from "@/lib/utils/filter-state";

describe("filter state helpers", () => {
  it("removes empty and nullish values while preserving meaningful falsy values", () => {
    expect(
      normalizeFilterState({
        empty: "",
        nullable: null,
        missing: undefined,
        count: 0,
        enabled: false,
        query: "repairs",
      })
    ).toEqual({ count: 0, enabled: false, query: "repairs" });
  });

  it("compares canonical filter states", () => {
    expect(areFilterStatesEqual({ status: "open", query: "" }, { status: "open" })).toBe(true);
  });

  it("formats the local calendar day without a UTC conversion", () => {
    expect(toLocalCalendarDate(new Date(2026, 6, 19, 23, 30))).toBe("2026-07-19");
  });
});
