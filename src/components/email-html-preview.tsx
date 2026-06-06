"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export function expandDeclarativeShadowDom(html: string) {
  if (typeof window === "undefined" || !html.includes("shadowrootmode")) {
    return html;
  }

  try {
    const doc = new DOMParser().parseFromString(html, "text/html");

    doc.querySelectorAll("script").forEach((script) => script.remove());
    doc.querySelectorAll<HTMLTemplateElement>("template[shadowrootmode]").forEach((template) => {
      const nodes = Array.from(template.content.childNodes).map((node) => node.cloneNode(true));
      template.replaceWith(...nodes);
    });

    return doc.body.innerHTML || html;
  } catch {
    return html;
  }
}

export function EmailHtmlPreview({ html, title }: { html: string; title: string }) {
  const frameId = useId();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1180);
  const expandedHtml = useMemo(() => expandDeclarativeShadowDom(html), [html]);
  const srcDoc = useMemo(() => {
    const safeFrameId = JSON.stringify(frameId);

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      img { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    ${expandedHtml}
    <script>
      (() => {
        const frameId = ${safeFrameId};
        const sendHeight = () => {
          const height = Math.max(
            document.documentElement.scrollHeight || 0,
            document.body.scrollHeight || 0,
            document.documentElement.offsetHeight || 0,
            document.body.offsetHeight || 0
          );
          parent.postMessage({ type: "EMAIL_HTML_PREVIEW_HEIGHT", frameId, height }, "*");
        };
        window.addEventListener("load", sendHeight);
        if ("ResizeObserver" in window) {
          new ResizeObserver(sendHeight).observe(document.body);
        }
        [100, 400, 1000, 2000, 4000].forEach((delay) => setTimeout(sendHeight, delay));
        sendHeight();
      })();
    </script>
  </body>
</html>`;
  }, [expandedHtml, frameId]);

  useEffect(() => {
    if (frameRef.current) {
      frameRef.current.srcdoc = srcDoc;
    }
  }, [srcDoc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== "EMAIL_HTML_PREVIEW_HEIGHT" || event.data.frameId !== frameId) {
        return;
      }

      const nextHeight = Number(event.data.height);

      if (Number.isFinite(nextHeight)) {
        setHeight(Math.max(1180, Math.ceil(nextHeight)));
      }
    }

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [frameId]);

  return <iframe ref={frameRef} sandbox="allow-scripts" style={{ height }} suppressHydrationWarning title={title} />;
}
