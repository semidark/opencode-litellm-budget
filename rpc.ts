import { Rpc } from "@opencode/plugin/rpc"

export const BudgetRPC = Rpc.define({
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
            spend: { type: "number" }, limit: { anyOf: [{ type: "number" }, { type: "null" }] },
            resetAt: { anyOf: [{ type: "string" }, { type: "null" }] }, period: { anyOf: [{ type: "string" }, { type: "null" }] },
            updatedAt: { type: "number" },
          }, required: ["spend", "limit", "resetAt", "period", "updatedAt"], additionalProperties: false }] },
        },
        required: ["status", "budget", "error"], additionalProperties: false,
      },
    },
  },
  events: {},
})
