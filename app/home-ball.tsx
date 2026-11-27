"use client";

import { useEffect, useRef } from "react";
import "./home-ball.css";

export default function HomeBall({ basePath }: { basePath: string }) {
  const container = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const element = container.current;
    const frame = iframe.current;
    if (!element || !frame) return;
    let visible = false;
    const sync = () => frame.contentWindow?.postMessage({
      type: "kyng-ball-visibility",
      visible: visible && !document.hidden,
    }, window.location.origin);
    const ready = (event: MessageEvent) => {
      if (event.source === frame.contentWindow && event.origin === window.location.origin &&
          event.data?.type === "kyng-ball-ready") sync();
    };
    // Observe the ball's area, so rendering stops even while the headline is still visible.
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(element);
    frame.addEventListener("load", sync);
    window.addEventListener("message", ready);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      visible = false;
      sync();
      observer.disconnect();
      frame.removeEventListener("load", sync);
      window.removeEventListener("message", ready);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return <div className="home-ball-stage" ref={container}>
    <iframe ref={iframe} src={`${basePath}/assets/kyng-ball.html`}
      title="Interactive KYNG CUP ball" tabIndex={-1} />
  </div>;
}
