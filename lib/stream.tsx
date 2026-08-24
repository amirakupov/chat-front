"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { API } from "./api";
import { EV_NAMES, eventPayload, type StreamEvent } from "./events";
import { useSession } from "./session";

export type LogEntry = { at: number; event: string; data: unknown };
type Listener = (ev: StreamEvent) => void;

type StreamValue = {
  status: "idle" | "connecting" | "open" | "closed";
  log: LogEntry[];
  subscribe: (l: Listener) => () => void;
  reconnect: () => void;
};

const Ctx = createContext<StreamValue | null>(null);
const LOG_LIMIT = 200;

export function StreamProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [status, setStatus] = useState<StreamValue["status"]>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [attempt, setAttempt] = useState(0);
  const listeners = useRef(new Set<Listener>());

  const subscribe = useCallback((l: Listener) => {
    listeners.current.add(l);
    // the braces matter: Set.delete returns a boolean, and a cleanup function must return void
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  // The status here mirrors an external system — the EventSource connection — into React,
  // which is precisely what an effect is for. The lint rule objects to the two synchronous
  // transitions ("idle" when nobody is signed in, "connecting" the moment the socket opens);
  // both cost one extra render when the identity changes and are what the screens read to
  // show a live indicator.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");

    // EventSource cannot set an Authorization header — which is exactly why the backend
    // accepts the cookie. withCredentials is what sends it cross-port.
    const es = new EventSource(`${API}/api/chat/stream`, { withCredentials: true });

    es.onopen = () => setStatus("open");
    es.onerror = () => setStatus("closed");

    const handlers = EV_NAMES.map((name) => {
      const handler = (raw: Event) => {
        // a data-less event is EventSource reporting a dropped connection under the same name
        // the backend uses for a failed reply; es.onerror already turned that into a status
        const data = eventPayload(raw);
        if (data === undefined) return;
        setLog((l) => [{ at: Date.now(), event: name, data }, ...l].slice(0, LOG_LIMIT));
        const ev = { event: name, data } as StreamEvent;
        listeners.current.forEach((l) => l(ev));
      };
      es.addEventListener(name, handler);
      return { name, handler };
    });

    return () => {
      handlers.forEach(({ name, handler }) => es.removeEventListener(name, handler));
      es.close();
      setStatus("closed");
    };
  }, [user, attempt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Ctx.Provider value={{ status, log, subscribe, reconnect: () => setAttempt((a) => a + 1) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStream(): StreamValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("useStream outside StreamProvider");
  return value;
}
