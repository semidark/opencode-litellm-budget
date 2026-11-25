import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

test("Desktop ignores late refreshes after switching sessions", async () => {
  const effects: (() => void)[] = []
  let cleanup: () => void = () => {}
  let view: any
  let session: any = { id: "first", directory: "/first", server: { id: "local", builtin: true } }
  const requests: { directory: string; resolve: (value: any) => void }[] = []
  const solid = {
    createSignal(initial: any) {
      let value = initial
      return [() => value, (next: any) => { value = typeof next === "function" ? next(value) : next }]
    },
    createEffect(fn: () => void) { effects.push(fn); fn() },
    onCleanup(fn: () => void) { cleanup = fn },
  }
  const module = { exports: {} as any }
  runInNewContext(readFileSync(import.meta.dir + "/gui-experimental.cjs", "utf8"), {
    module,
    get document() { return globalThis.document },
    setInterval, clearInterval,
    require: (name: string) => name === "solid-js" ? solid : name === "@opencode/plugin/rpc" ? { Rpc: { define: (v: any) => v } } : { Plugin: { define: (v: any) => v }, Slot: {} },
  })
  const plugin = module.exports.default
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
  const [separator, svg, text, trailingSeparator] = button.children
  expect(separator.textContent).toBe("·")
  expect(separator.attributes["aria-hidden"]).toBe("true")
  expect(trailingSeparator.textContent).toBe("·")
  expect(trailingSeparator.attributes["aria-hidden"]).toBe("true")
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
  await new Promise((resolve) => setImmediate(resolve))
  requests[1].resolve(data(75))
  await new Promise((resolve) => setImmediate(resolve))
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
  await new Promise((resolve) => setImmediate(resolve))
  effects[1]()
  expect(text.textContent).toBe("Budget 150% · stale")
  expect(Number(progress.attributes["stroke-dashoffset"])).toBeCloseTo(0)
  button.onclick()
  expect(dialog.children.children[1].children.map((node: any) => node.textContent).slice(-2)).toEqual(["Last refresh", "unavailable"])
  requests[4].resolve({ status: "fresh", error: null, budget: { spend: 5, limit: null, resetAt: null, period: null, updatedAt: 1 } })
  await new Promise((resolve) => setImmediate(resolve))
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
