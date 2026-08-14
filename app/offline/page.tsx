"use client";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <header><a className="brand" href="../"><span className="ball-mark" aria-hidden="true"><i /></span><span>KYNG CUP</span></a><span>Offline mode</span></header>
      <section>
        <span className="connection-status"><i /> Connection lost</span>
        <h1>Stay in<br />the match<span>.</span></h1>
        <p>There is no internet connection, so live scores and tournament updates are temporarily unavailable.</p>
        <div><span>Reconnect to continue.</span><button type="button" onClick={() => window.location.reload()}>Try again ↗</button><a href="../">Return home ↗</a></div>
      </section>
      <footer><span>Results will resume automatically when you reconnect.</span><span>KYNG CUP · 2026</span></footer>
    </main>
  );
}
