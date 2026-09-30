import {
  type ActionInput,
  type ActionKey,
  type ActionResult,
  isProtocolError,
  type ProtocolError,
  protocolError,
  stableHash,
  type ViewData,
  type ViewKey,
  type ViewParams,
  type ViewState,
} from "@app/protocol"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import type { Bridge, BridgeStatus } from "./bridge.ts"

const BridgeContext = createContext<Bridge | null>(null)

export function BridgeProvider(props: { bridge: Bridge; children: ReactNode }) {
  return (
    <BridgeContext.Provider value={props.bridge}>
      {props.children}
    </BridgeContext.Provider>
  )
}

export function useBridge(): Bridge {
  const bridge = useContext(BridgeContext)
  if (!bridge) throw new Error("useBridge must be used inside <BridgeProvider>")
  return bridge
}

export interface UseViewOptions {
  /**
   * While new params are loading, keep returning the previous result (with
   * isFetching true) instead of a loading state — e.g. when filters change.
   */
  keepPrevious?: boolean
}

/** Subscribes to a worker view model. The only way React reads data. */
export function useView<K extends ViewKey>(
  view: K,
  params: ViewParams<K>,
  options: UseViewOptions = {}
): ViewState<ViewData<K>> {
  const bridge = useBridge()
  const paramsHash = stableHash(params)
  const paramsRef = useRef(params)
  paramsRef.current = params
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by params hash
  const handle = useMemo(
    () => bridge.view(view, paramsRef.current),
    [bridge, view, paramsHash]
  )
  const state = useSyncExternalStore(
    handle.subscribe,
    handle.getSnapshot,
    handle.getSnapshot
  )
  const previous = useRef<ViewState<ViewData<K>> | undefined>(undefined)
  if (state.data !== undefined) previous.current = state
  if (options.keepPrevious && state.status === "loading" && previous.current) {
    return { ...previous.current, isFetching: true }
  }
  return state
}

export interface ActionState<K extends ActionKey> {
  run: (input: ActionInput<K>) => Promise<ActionResult<K>>
  pending: boolean
  error: ProtocolError | undefined
  reset: () => void
}

/** Runs a worker action. `pending`/`error` are UI state only. */
export function useAction<K extends ActionKey>(action: K): ActionState<K> {
  const bridge = useBridge()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ProtocolError | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (input: ActionInput<K>) => {
      setPending(true)
      setError(undefined)
      try {
        return await bridge.run(action, input)
      } catch (cause) {
        const normalized = isProtocolError(cause)
          ? cause
          : protocolError("FAILED", "Something went wrong")
        if (mounted.current) setError(normalized)
        throw normalized
      } finally {
        if (mounted.current) setPending(false)
      }
    },
    [bridge, action]
  )
  const reset = useCallback(() => setError(undefined), [])
  return { run, pending, error, reset }
}

export function useBridgeStatus(): BridgeStatus {
  const bridge = useBridge()
  return useSyncExternalStore(
    bridge.subscribeStatus,
    bridge.getStatus,
    bridge.getStatus
  )
}
