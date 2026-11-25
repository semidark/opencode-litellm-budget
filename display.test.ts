import { expect, test } from "bun:test"
import { details, summary } from "./display"

test("budget display uses a generic label while identifying the key scope", () => {
  expect(summary(undefined)).toBe("Bgt: unavailable")
  const snapshot = { status: "fresh" as const, error: null, budget: { spend: 25, limit: 100, resetAt: null, period: null, updatedAt: 1 } }
  expect(summary(snapshot)).toBe("Bgt: 25%")
  expect(summary({ ...snapshot, status: "stale" })).toBe("Bgt: 25% · stale")
  expect(summary({ ...snapshot, budget: { ...snapshot.budget, limit: null } })).toBe("Bgt: 25.00 used (limit unknown)")
  expect(summary({ ...snapshot, budget: { ...snapshot.budget, limit: 0 } })).toBe("Bgt: 25.00 / 0.00")
  expect(details(snapshot)).toContain("API key budget (currency not verified)")
})
