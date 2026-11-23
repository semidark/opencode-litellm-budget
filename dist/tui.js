// @bun
// tui.tsx
import { insert as _$insert } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";

// rpc.ts
import { Rpc } from "@opencode/plugin/rpc";
var BudgetRPC = Rpc.define({
  id: "semidark-litellm-budget",
  methods: {
    get: {
      input: { type: "object", properties: { refresh: { type: "boolean" } }, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["fresh", "stale", "unavailable"] },
          error: { anyOf: [{ type: "string" }, { type: "null" }] },
          budget: { anyOf: [{ type: "null" }, { type: "object", properties: {
            spend: { type: "number" },
            limit: { anyOf: [{ type: "number" }, { type: "null" }] },
            resetAt: { anyOf: [{ type: "string" }, { type: "null" }] },
            period: { anyOf: [{ type: "string" }, { type: "null" }] },
            updatedAt: { type: "number" }
          }, required: ["spend", "limit", "resetAt", "period", "updatedAt"], additionalProperties: false }] }
        },
        required: ["status", "budget", "error"],
        additionalProperties: false
      }
    }
  },
  events: {}
});

// display.ts
var amount = (n) => new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function summary(snapshot) {
  if (!snapshot || !snapshot.budget)
    return "Budget: unavailable";
  const { spend, limit } = snapshot.budget;
  const value = limit === null ? `${amount(spend)} used (limit not reported)` : limit === 0 ? `${amount(spend)} / 0.00` : `${Math.round(spend / limit * 100)}% used`;
  return `Budget: ${value}${snapshot.status === "stale" ? " \xB7 stale" : ""}`;
}
function details(snapshot) {
  if (!snapshot?.budget)
    return `API key budget
Unavailable${snapshot?.error ? `: ${snapshot.error}` : ""}`;
  const { spend, limit, resetAt, period, updatedAt } = snapshot.budget;
  return [
    "API key budget (currency not verified)",
    `Used: ${amount(spend)}`,
    `Limit: ${limit === null ? "No key limit reported" : amount(limit)}`,
    `Remaining: ${limit === null ? "Unknown" : amount(limit - spend)}`,
    `Period: ${period ?? "Not reported"}`,
    `Resets: ${resetAt ? new Date(resetAt).toLocaleString() : "Not reported"}`,
    `Updated: ${new Date(updatedAt).toLocaleString()}${snapshot.status === "stale" ? " (stale)" : ""}`,
    ...snapshot.error ? [`Last refresh: ${snapshot.error}`] : []
  ].join(`
`);
}

// tui.tsx
var tui_default = Plugin.define({
  id: "semidark.litellm-budget.tui",
  setup(ctx) {
    const [snapshot, setSnapshot] = createSignal();
    let disposed = false;
    let generation = 0;
    async function refresh(force = false) {
      const current = ++generation;
      try {
        const result = await ctx.client.rpc(BudgetRPC).get({
          refresh: force
        }, {
          location: ctx.location ?? ctx.data.location.default()
        });
        if (!disposed && current === generation)
          setSnapshot(result);
      } catch {
        if (!disposed && current === generation)
          setSnapshot((old) => ({
            status: old?.budget ? "stale" : "unavailable",
            budget: old?.budget ?? null,
            error: "OpenCode server unavailable"
          }));
      }
    }
    refresh();
    const timer = setInterval(() => void refresh(), 60000);
    const unregister = ctx.ui.slot({
      append: "prompt.footer.status",
      render: () => (() => {
        var _el$ = _$createElement("text");
        _$insert(_el$, () => summary(snapshot()));
        return _el$;
      })()
    });
    ctx.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "semidark.litellm-budget.details",
        title: "Key budget",
        group: "Budget",
        palette: true,
        slash: {
          name: "budget"
        },
        run: async () => {
          await refresh(true);
          await ctx.ui.dialog.alert({
            title: "Budget",
            message: details(snapshot())
          });
        }
      }]
    }));
    return () => {
      disposed = true;
      clearInterval(timer);
      unregister();
    };
  }
});
export {
  tui_default as default
};
