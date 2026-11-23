import { expect, test } from "bun:test"
import { details, summary } from "./display"

test("budget display uses a generic label while identifying the key scope", () => {
  expect(summary(undefined)).toBe("Budget: unavailable")
  const snapshot = { status: "fresh" as const, error: null, budget: { spend: 25, limit: 100, resetAt: null, period: null, updatedAt: 1 } }
  expect(summary(snapshot)).toBe("Budget: 25% used")
  expect(details(snapshot)).toContain("API key budget (currency not verified)")
})
