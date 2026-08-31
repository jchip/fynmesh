/**
 * Shared React hooks for the FynBus demo (FYM-18).
 *
 * Shows both FynBus patterns between FynApps:
 * - pub/sub: emit/on over a shared topic (own emits are filtered by the bus)
 * - request/response: request() a topic that another app handle()s
 *
 * NOTE: The React hooks (useState, useEffect) must be passed in by
 * the consuming app to avoid version conflicts between apps using
 * different React versions (same pattern as react-hooks.ts).
 */

import type { FynBus, FynBusMeta } from "@fynmesh/kernel";

// Minimal runtime shape needed by the hooks
interface MinimalRuntime {
  bus?: FynBus;
  fynApp?: { name: string };
}

/** Topic shared by the pub/sub chat demo */
export const DEMO_CHAT_TOPIC = "demo-chat";

/** Topic for the request/response demo (fynapp-1 registers the handler) */
export const GET_STATUS_TOPIC = "get-status";

export interface BusChatMessage {
  text: string;
  /** Sender FynApp name, stamped by the platform (meta.source) */
  source: string;
  /** Local receive time for display */
  at: string;
}

/**
 * Hook for the FynBus pub/sub chat demo.
 *
 * Subscribes to the chat topic and collects received messages. FynBus
 * filters an app's own emits by default, so each app only sees messages
 * from OTHER apps - no hand-rolled source checks needed.
 *
 * @param useState - React.useState hook from the consuming app's React version
 * @param useEffect - React.useEffect hook from the consuming app's React version
 * @param runtime - The FynUnitRuntime (runtime.bus may be undefined)
 * @param topic - Bus topic to chat on (default "demo-chat")
 */
export function useFynBusChat(
  useState: any,
  useEffect: any,
  runtime: MinimalRuntime | undefined,
  topic: string = DEMO_CHAT_TOPIC
): {
  messages: BusChatMessage[];
  sendMessage: (text: string) => boolean;
  busAvailable: boolean;
} {
  const [messages, setMessages] = useState([] as BusChatMessage[]);
  const busAvailable = Boolean(runtime?.bus);

  useEffect(() => {
    const bus = runtime?.bus;
    if (!bus) {
      console.debug(
        `\u{1F68C} ${runtime?.fynApp?.name}: runtime.bus not available, FynBus chat disabled`
      );
      return;
    }

    const unsubscribe = bus.on(topic, (payload: any, meta: FynBusMeta) => {
      const text =
        typeof payload === "string" ? payload : String(payload?.text ?? "");
      setMessages((prev: BusChatMessage[]) => [
        ...prev,
        { text, source: meta.source, at: new Date().toLocaleTimeString() },
      ]);
      console.debug(
        `\u{1F68C} ${runtime?.fynApp?.name}: received "${topic}" from ${meta.source}:`,
        payload
      );
    });

    return unsubscribe;
  }, [runtime, topic]);

  const sendMessage = (text: string): boolean => {
    const bus = runtime?.bus;
    const trimmed = text.trim();
    if (!bus || !trimmed) {
      return false;
    }
    bus.emit(topic, { text: trimmed });
    return true;
  };

  return { messages, sendMessage, busAvailable };
}

/**
 * Hook for the FynBus request/response demo.
 *
 * sendRequest() calls bus.request(topic) and tracks the lifecycle so the
 * app can render pending/response/error states.
 *
 * @param useState - React.useState hook from the consuming app's React version
 * @param runtime - The FynUnitRuntime (runtime.bus may be undefined)
 * @param topic - Bus topic to request (default "get-status")
 */
export function useFynBusRequest(
  useState: any,
  runtime: MinimalRuntime | undefined,
  topic: string = GET_STATUS_TOPIC
) {
  const [requestState, setRequestState] = useState("idle" as
    | "idle"
    | "pending"
    | "done"
    | "error");
  const [response, setResponse] = useState(null as unknown);

  const sendRequest = async () => {
    const bus = runtime?.bus;
    if (!bus) {
      setRequestState("error");
      setResponse("runtime.bus not available");
      return;
    }
    setRequestState("pending");
    try {
      const result = await bus.request(topic);
      setResponse(result);
      setRequestState("done");
    } catch (error) {
      setResponse((error as Error).message);
      setRequestState("error");
    }
  };

  return {
    requestState,
    response,
    sendRequest,
    busAvailable: Boolean(runtime?.bus),
  };
}
