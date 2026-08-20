"use client";

import { useStream } from "@/lib/stream";

export default function Debug() {
  const { status, log, reconnect } = useStream();

  return (
    <main>
      <h1>Журнал стрима</h1>
      <section className="card">
        <div className="row">
          <span className={`status ${status}`}>GET /api/chat/stream — {status}</span>
          <button className="ghost" onClick={reconnect}>
            переподключить
          </button>
          <span className="dim">
            heartbeat раз в 20 секунд приходит SSE-комментарием и в журнал не попадает — это
            нормально, признак живого соединения здесь только статус
          </span>
        </div>
      </section>

      <section className="card">
        {log.length === 0 && <p className="dim">пока ничего не приходило</p>}
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
