"use client";

import { useStream } from "@/lib/stream";

export default function Debug() {
  const { status, log, reconnect } = useStream();

  return (
    <main>
      <h1>Stream log</h1>
      <section className="card">
        <div className="row">
          <span className={`status ${status}`}>GET /api/chat/stream — {status}</span>
          <button className="ghost" onClick={reconnect}>
            reconnect
          </button>
          <span className="dim">
            the heartbeat every 20 seconds arrives as an SSE comment and never reaches the log —
            that is normal; here the only sign of a live connection is the status
          </span>
        </div>
      </section>

      <section className="card">
        {log.length === 0 && <p className="dim">nothing has arrived yet</p>}
        <table className="log">
          <tbody>
            {log.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td>{new Date(e.at).toLocaleTimeString()}</td>
                <td>{e.event}</td>
                <td>
                  <pre style={{ margin: 0 }}>{JSON.stringify(e.data)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
