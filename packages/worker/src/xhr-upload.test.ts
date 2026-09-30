import { afterEach, describe, expect, it, vi } from "vitest"
import { xhrUpload } from "./xhr-upload.ts"

/** Minimal XMLHttpRequest stand-in driven by the test. */
class FakeXHR {
  static last: FakeXHR
  method = ""
  url = ""
  headers: Record<string, string> = {}
  status = 0
  body: unknown
  upload: {
    onprogress:
      | ((e: {
          lengthComputable: boolean
          loaded: number
          total: number
        }) => void)
      | null
  } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  constructor() {
    FakeXHR.last = this
  }
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  send(body: unknown) {
    this.body = body
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("xhrUpload", () => {
  const target = {
    method: "PUT",
    url: "/api/v1/blobs/t",
    headers: { "Content-Type": "text/plain" },
  }

  it("PUTs the blob with headers and reports progress", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    const progress: number[] = []
    const blob = new Blob(["hi"])
    const done = xhrUpload(target, blob, (p) => progress.push(p))
    const xhr = FakeXHR.last
    expect([
      xhr.method,
      xhr.url,
      xhr.headers["Content-Type"],
      xhr.body,
    ]).toEqual(["PUT", "/api/v1/blobs/t", "text/plain", blob])
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 })
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 })
    xhr.status = 204
    xhr.onload?.()
    await expect(done).resolves.toBeUndefined()
    expect(progress).toEqual([25])
  })

  it.each([
    [
      "an error status",
      (x: FakeXHR) => {
        x.status = 413
        x.onload?.()
      },
      "Upload failed (413)",
    ],
    [
      "a network error",
      (x: FakeXHR) => x.onerror?.(),
      "Upload failed: network error",
    ],
    ["an abort", (x: FakeXHR) => x.onabort?.(), "Upload cancelled"],
  ])("rejects on %s", async (_name, act, message) => {
    vi.stubGlobal("XMLHttpRequest", FakeXHR)
    const done = xhrUpload(target, new Blob(["x"]), () => {})
    act(FakeXHR.last)
    await expect(done).rejects.toThrow(message)
  })
})
