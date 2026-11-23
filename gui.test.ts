import { expect, mock, test } from "bun:test"

test("Desktop ignores late refreshes after switching sessions", async () => {
  const effects: (() => void)[] = []
  let cleanup: () => void = () => {}
  let view: any
  let session: any = { id: "first", directory: "/first", server: { id: "local", builtin: true } }
  const requests: { directory: string; resolve: (value: any) => void }[] = []
  mock.module("solid-js", () => ({
    createSignal(initial: any) {
      let value = initial
      return [() => value, (next: any) => { value = typeof next === "function" ? next(value) : next }]
    },
    createEffect(fn: () => void) { effects.push(fn); fn() },
    onCleanup(fn: () => void) { cleanup = fn },
  }))
  mock.module("@opencode/plugin/gui", () => ({ Plugin: { define: (value: any) => value }, Slot: {} }))
  mock.module("@opencode/plugin/rpc", () => ({ Rpc: { define: (value: any) => value } }))
  const plugin = require("./gui-experimental.cjs").default
  let dialog: any
  const ctx = {
    sessions: { current: () => session },
    client: { rpc: () => ({ get: (_input: any, options: any) => new Promise((resolve) => requests.push({ directory: options.location.directory, resolve })) }) },
    add: (_token: any, item: any) => { view = item },
    dialogs: { open: (render: any) => { dialog = render({ close: () => {} }) } },
    ui: { Dialog: (props: any) => props, Button: (props: any) => props },
  }
  plugin.setup(ctx)
  expect(view.at).toBe("session.header")
  const previousDocument = globalThis.document
  const element = () => ({ style: {} as any, attributes: {} as Record<string, string>, children: [] as any[], setAttribute(name: string, value: string) { this.attributes[name] = value }, append(...children: any[]) { this.children.push(...children) } })
  globalThis.document = { createElement: element, createElementNS: element } as any
  const input = { get session() { return session }, active: true }
  const button = view.render(input)
  const [svg, text] = button.children
  const progress = svg.children[1]
  expect(svg.style.display).toBe("none")
  expect(requests[0].directory).toBe("/first")
  button.onclick()
  expect(requests[1].directory).toBe("/first")
  expect(dialog.title).toBe("Budget")
  cleanup()
  session = { id: "second", directory: "/second", server: { id: "local", builtin: true } }
  effects[0]()
  expect(requests[2].directory).toBe("/second")
  const data = (spend: number) => ({ status: "fresh", error: null, budget: { spend, limit: 100, resetAt: null, period: null, updatedAt: 1 } })
  requests[2].resolve(data(25))
  await Promise.resolve()
  requests[1].resolve(data(75))
  await Promise.resolve()
  effects[1]()
  expect(text.textContent).toBe("Budget 25%")
  expect(svg.style.display).toBe("block")
  expect(Number(progress.attributes["stroke-dashoffset"])).toBeCloseTo(2 * Math.PI * 6.25 * 0.75)
  expect(button.hidden).toBe(false)
  button.onclick()
  expect(dialog.children.children[0].textContent).toContain("currency not verified")
  const rows = dialog.children.children[1].children
  expect(rows.map((node: any) => node.textContent)).toEqual([
    "Used", "25.00", "Limit", "100.00", "Remaining", "75.00",
    "Period", "Not reported", "Resets", "Not reported", "Updated", new Date(1).toLocaleString(),
  ])
  requests[3].resolve({ status: "stale", error: "unavailable", budget: { spend: 150, limit: 100, resetAt: null, period: null, updatedAt: 1 } })
  await Promise.resolve()
  effects[1]()
  expect(text.textContent).toBe("Budget 150% · stale")
  expect(Number(progress.attributes["stroke-dashoffset"])).toBeCloseTo(0)
  button.onclick()
  expect(dialog.children.children[1].children.map((node: any) => node.textContent).slice(-2)).toEqual(["Last refresh", "unavailable"])
  requests[4].resolve({ status: "fresh", error: null, budget: { spend: 5, limit: null, resetAt: null, period: null, updatedAt: 1 } })
  await Promise.resolve()
  effects[1]()
  expect(svg.style.display).toBe("none")
  expect(text.textContent).toContain("limit not reported")
  session = { id: "remote", directory: "/remote", server: { id: "remote", builtin: false } }
  effects[1]()
  expect(button.hidden).toBe(true)
  button.onclick()
  expect(requests).toHaveLength(5)
  cleanup()
  globalThis.document = previousDocument
})
