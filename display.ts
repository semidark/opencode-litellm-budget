import type { Snapshot } from "./service"

const amount = (n: number) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
export function summary(snapshot: Snapshot | undefined): string {
  if (!snapshot || !snapshot.budget) return "Budget: unavailable"
  const { spend, limit } = snapshot.budget
  const value = limit === null ? `${amount(spend)} used (limit not reported)` : limit === 0 ? `${amount(spend)} / 0.00` : `${Math.round(spend / limit * 100)}% used`
  return `Budget: ${value}${snapshot.status === "stale" ? " · stale" : ""}`
}
export function details(snapshot: Snapshot | undefined): string {
  if (!snapshot?.budget) return `API key budget\nUnavailable${snapshot?.error ? `: ${snapshot.error}` : ""}`
  const { spend, limit, resetAt, period, updatedAt } = snapshot.budget
  return [
    "API key budget (currency not verified)",
    `Used: ${amount(spend)}`,
    `Limit: ${limit === null ? "No key limit reported" : amount(limit)}`,
    `Remaining: ${limit === null ? "Unknown" : amount(limit - spend)}`,
    `Period: ${period ?? "Not reported"}`,
    `Resets: ${resetAt ? new Date(resetAt).toLocaleString() : "Not reported"}`,
    `Updated: ${new Date(updatedAt).toLocaleString()}${snapshot.status === "stale" ? " (stale)" : ""}`,
    ...(snapshot.error ? [`Last refresh: ${snapshot.error}`] : []),
  ].join("\n")
}
