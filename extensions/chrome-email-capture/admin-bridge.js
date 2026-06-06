window.postMessage(
  {
    type: "ELEGOO_EXTENSION_READY",
    version: chrome.runtime.getManifest().version
  },
  window.location.origin
);

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "CAPTURE_PROGRESS") {
    return;
  }

  window.postMessage(
    {
      type: "ELEGOO_CAPTURE_URL_PROGRESS",
      requestId: message.requestId,
      progress: message.progress
    },
    window.location.origin
  );
});

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  if (event.data?.type === "ELEGOO_EXTENSION_PING") {
    window.postMessage(
      {
        type: "ELEGOO_EXTENSION_PONG",
        version: chrome.runtime.getManifest().version
      },
      window.location.origin
    );
    return;
  }

  if (event.data?.type === "ELEGOO_CAPTURE_KEYWORD_REQUEST") {
    chrome.runtime.sendMessage(
      {
        type: "CAPTURE_KEYWORD",
        requestId: event.data.requestId,
        keyword: event.data.keyword,
        limit: event.data.limit
      },
      (response) => {
        window.postMessage(
          {
            type: "ELEGOO_CAPTURE_KEYWORD_RESPONSE",
            requestId: event.data.requestId,
            ok: Boolean(response?.ok),
            payload: response?.payload,
            error: response?.error || chrome.runtime.lastError?.message
          },
          window.location.origin
        );
      }
    );
    return;
  }

  if (event.data?.type !== "ELEGOO_CAPTURE_URL_REQUEST") {
    return;
  }

  chrome.runtime.sendMessage(
    {
      type: "CAPTURE_URL",
      requestId: event.data.requestId,
      url: event.data.url,
      skipUrls: event.data.skipUrls
    },
    (response) => {
      window.postMessage(
        {
          type: "ELEGOO_CAPTURE_URL_RESPONSE",
          requestId: event.data.requestId,
          ok: Boolean(response?.ok),
          payload: response?.payload,
          error: response?.error || chrome.runtime.lastError?.message
        },
        window.location.origin
      );
    }
  );
});
