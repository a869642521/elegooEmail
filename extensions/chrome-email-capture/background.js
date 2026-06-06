chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let task;
  const progress = (payload) => sendCaptureProgress(sender, message?.requestId, payload);

  if (message?.type === "CAPTURE_URL") {
    task = captureUrl(message.url, { skipUrls: message.skipUrls, onProgress: progress });
  } else if (message?.type === "CAPTURE_KEYWORD") {
    task = captureKeyword(message.keyword, message.limit);
  } else {
    return false;
  }

  task
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  return true;
});

function sendCaptureProgress(sender, requestId, progress) {
  if (!requestId || !sender?.tab?.id) {
    return;
  }

  chrome.tabs
    .sendMessage(sender.tab.id, {
      type: "CAPTURE_PROGRESS",
      requestId,
      progress
    })
    .catch(() => {});
}

async function captureUrl(url, options = {}) {
  const target = new URL(url);
  const progress = typeof options.onProgress === "function" ? options.onProgress : () => {};

  if (!target.hostname.includes("emaillove.com") && !target.hostname.includes("emailinspire.com")) {
    throw new Error("This automatic capture currently supports Email Love and Email Inspire URLs only.");
  }

  if (isEmailInspireBrandPage(target)) {
    return await captureEmailInspireBrandPage(url, { skipUrls: options.skipUrls, onProgress: progress });
  }

  progress({
    stage: "opening",
    message: "正在打开邮件详情页...",
    currentUrl: url
  });
  const tab = await chrome.tabs.create({ url, active: true });

  try {
    await waitForTabComplete(tab.id);
    await delay(1800);
    progress({
      stage: "reading",
      message: "正在读取页面内容...",
      currentUrl: url
    });

    const extractor = target.hostname.includes("emailinspire.com") ? extractEmailInspirePage : extractEmailLovePage;
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractor });

    if (!result?.result?.sourceUrl) {
      throw new Error("Could not read the email page content.");
    }

    const screenshotDataUrl = target.hostname.includes("emailinspire.com")
      ? await captureElementScreenshot(tab, "#email-content").catch(() => null)
      : await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }).catch(() => null);
    progress({
      stage: "captured",
      message: "已完成当前邮件截图和内容采集。",
      currentUrl: url
    });

    return {
      ...result.result,
      screenshotDataUrl
    };
  } finally {
    if (tab.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

function isEmailInspireBrandPage(target) {
  if (!target.hostname.includes("emailinspire.com")) {
    return false;
  }

  const parts = target.pathname.split("/").filter(Boolean);
  const reserved = new Set(["emails", "brands", "industries", "pricing", "login", "signup", "legal", "faq", "contact-us"]);
  return parts.length === 1 && !reserved.has(parts[0]);
}

async function captureEmailInspireBrandPage(url, options = {}) {
  const progress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  progress({
    stage: "opening",
    message: "正在打开 Email Inspire 品牌页...",
    sourceUrl: url
  });
  const tab = await chrome.tabs.create({ url, active: true });
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 50);
  const skipUrls = new Set((Array.isArray(options.skipUrls) ? options.skipUrls : []).map((item) => String(item).replace(/#.*$/, "")));

  try {
    await waitForTabComplete(tab.id);
    await delay(2200);
    progress({
      stage: "scanning",
      message: "正在滚动品牌页，加载邮件卡片...",
      sourceUrl: url
    });

    await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrollPageForLazyContent
      }),
      14000,
      "品牌页滚动加载超时。请确认页面已经正常打开，或稍后重试。"
    );
    progress({
      stage: "collecting",
      message: "品牌页加载完成，正在收集邮件卡片链接...",
      sourceUrl: url
    });

    const [result] = await withTimeout(
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectEmailInspireBrandLinks,
        args: [limit]
      }),
      8000,
      "邮件卡片链接收集超时。请确认输入的是 Email Inspire 品牌页。"
    );
    const discoveredLinks = result?.result?.links || [];

    if (!discoveredLinks.length) {
      progress({
        stage: "failed",
        message: "没有在这个品牌页发现邮件卡片链接。",
        sourceUrl: url
      });
      throw new Error("没有在这个品牌页发现邮件卡片链接。请确认 URL 类似 https://www.emailinspire.com/insta360，并且页面里有邮件卡片。");
    }

    const links = discoveredLinks.filter((link) => !skipUrls.has(link));
    const skippedLinks = discoveredLinks.filter((link) => skipUrls.has(link));
    const captured = [];
    const failed = [];
    progress({
      stage: "discovered",
      message: `发现 ${discoveredLinks.length} 个邮件卡片，跳过已存在 ${skippedLinks.length} 个。`,
      sourceUrl: url,
      brandName: result?.result?.brandName || "",
      totalLinks: discoveredLinks.length,
      skippedExisting: skippedLinks.length,
      captureTotal: links.length,
      captured: captured.length,
      failed: failed.length
    });

    for (const [index, link] of links.entries()) {
      const batchProgress = {
        sourceUrl: url,
        brandName: result?.result?.brandName || "",
        totalLinks: discoveredLinks.length,
        skippedExisting: skippedLinks.length,
        captureTotal: links.length,
        current: index + 1
      };

      progress({
        ...batchProgress,
        stage: "capturing",
        message: `正在采集第 ${index + 1} / ${links.length} 封邮件...`,
        captured: captured.length,
        failed: failed.length,
        currentUrl: link
      });

      try {
        captured.push(
          await captureUrl(link, {
            skipUrls: options.skipUrls,
            onProgress: (detailProgress) =>
              progress({
                ...batchProgress,
                ...detailProgress,
                captured: captured.length,
                failed: failed.length,
                currentUrl: link
              })
          })
        );
        progress({
          ...batchProgress,
          stage: "captured",
          message: `已采集 ${captured.length} / ${links.length} 封邮件。`,
          captured: captured.length,
          failed: failed.length,
          currentUrl: link
        });
      } catch (error) {
        failed.push({
          url: link,
          error: error instanceof Error ? error.message : String(error)
        });
        progress({
          ...batchProgress,
          stage: "failed",
          message: `第 ${index + 1} 封采集失败，继续处理下一封。`,
          captured: captured.length,
          failed: failed.length,
          currentUrl: link
        });
      }

      await delay(900);
    }

    progress({
      stage: "complete",
      message: "品牌页采集完成，正在写入本地案例库...",
      sourceUrl: url,
      brandName: result?.result?.brandName || "",
      totalLinks: discoveredLinks.length,
      skippedExisting: skippedLinks.length,
      captureTotal: links.length,
      current: links.length,
      captured: captured.length,
      failed: failed.length
    });

    return {
      batch: true,
      sourceUrl: url,
      brandName: result?.result?.brandName || "",
      totalLinks: discoveredLinks.length,
      skippedExisting: skippedLinks.length,
      skippedLinks,
      links,
      captured,
      failed
    };
  } finally {
    if (tab.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

function withTimeout(task, timeoutMs, message) {
  return Promise.race([
    task,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

async function captureElementScreenshot(tab, selector) {
  const [metricsResult] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: getElementCaptureMetrics,
    args: [selector]
  });
  const metrics = metricsResult?.result;

  if (!metrics?.width || !metrics?.height) {
    throw new Error("Could not locate the full email creative.");
  }

  const canvas = new OffscreenCanvas(Math.round(metrics.width), Math.round(metrics.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const step = Math.max(240, Math.floor(metrics.viewportHeight * 0.72));
  const capturedRanges = [];

  for (let y = 0; y < metrics.height; y += step) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrollElementChunkIntoView,
      args: [selector, y]
    });
    await delay(450);

    const [chunkResult] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getVisibleElementChunk,
      args: [selector]
    });
    const chunk = chunkResult?.result;

    if (!chunk?.visibleHeight || capturedRanges.some((range) => Math.abs(range.y - chunk.elementVisibleTop) < 4)) {
      continue;
    }

    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const bitmap = await createImageBitmap(await (await fetch(screenshotDataUrl)).blob());
    const scale = bitmap.width / chunk.viewportWidth;
    const sourceX = Math.round(chunk.left * scale);
    const sourceY = Math.round(chunk.visibleTop * scale);
    const sourceWidth = Math.round(chunk.width * scale);
    const sourceHeight = Math.round(chunk.visibleHeight * scale);

    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      Math.round(chunk.elementVisibleTop),
      Math.round(chunk.width),
      Math.round(chunk.visibleHeight)
    );
    bitmap.close?.();
    capturedRanges.push({ y: chunk.elementVisibleTop, height: chunk.visibleHeight });
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return await blobToDataUrl(blob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

async function captureKeyword(keyword, limit = 10) {
  const normalizedKeyword = String(keyword || "").trim();

  if (!normalizedKeyword) {
    throw new Error("Please enter a keyword.");
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 30);
  const links = await discoverKeywordLinks(normalizedKeyword, safeLimit);
  const captured = [];
  const failed = [];

  for (const link of links) {
    try {
      captured.push(await captureUrl(link));
    } catch (error) {
      failed.push({
        url: link,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    await delay(1200);
  }

  return {
    keyword: normalizedKeyword,
    totalLinks: links.length,
    links,
    captured,
    failed
  };
}

async function discoverKeywordLinks(keyword, limit) {
  const searchUrls = [
    `https://emaillove.com/?s=${encodeURIComponent(keyword)}`,
    `https://emaillove.com/search?q=${encodeURIComponent(keyword)}`
  ];
  const seen = new Set();
  const links = [];
  const addLinks = (items) => {
    for (const link of items) {
      if (!seen.has(link)) {
        seen.add(link);
        links.push(link);
      }

      if (links.length >= limit) {
        break;
      }
    }
  };

  for (const searchUrl of searchUrls) {
    const tab = await chrome.tabs.create({ url: searchUrl, active: true });

    try {
      await waitForTabComplete(tab.id);
      await delay(2200);

      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectEmailLoveLinks,
        args: [keyword, limit]
      });

      addLinks(result?.result || []);
    } finally {
      if (tab.id) {
        await chrome.tabs.remove(tab.id).catch(() => {});
      }
    }

    if (links.length >= limit) {
      return links;
    }
  }

  if (links.length < limit) {
    addLinks(await discoverLinksWithSearchBox(keyword, limit - links.length));
  }

  return links;
}

async function discoverLinksWithSearchBox(keyword, limit) {
  const tab = await chrome.tabs.create({ url: "https://emaillove.com/", active: true });

  try {
    await waitForTabComplete(tab.id);
    await delay(1800);

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: searchEmailLoveUi,
      args: [keyword, limit]
    });

    return result?.result || [];
  } finally {
    if (tab.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out while opening the Email Love page."));
    }, 30000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") {
        return;
      }

      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectEmailLoveLinks(keyword, limit) {
  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  const candidates = Array.from(document.querySelectorAll("a[href]"))
    .map((anchor) => {
      try {
        const url = new URL(anchor.href, location.href);
        const label = `${anchor.textContent || ""} ${url.pathname}`.toLowerCase();

        return {
          url: url.toString().replace(/#.*$/, ""),
          label,
          score: label.includes(normalizedKeyword) ? 1 : 0
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => {
      const url = new URL(item.url);
      return url.hostname.includes("emaillove.com") && url.pathname.includes("/email-inspiration-from-");
    })
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const links = [];

  for (const item of candidates) {
    if (seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    links.push(item.url);

    if (links.length >= limit) {
      break;
    }
  }

  return links;
}

async function searchEmailLoveUi(keyword, limit) {
  const input =
    document.querySelector('input[type="search"]') ||
    document.querySelector('input[placeholder*="Search" i]') ||
    document.querySelector('input[name*="search" i]');

  if (!input) {
    return [];
  }

  input.focus();
  input.value = keyword;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: keyword }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: keyword.slice(-1) || "Enter" }));
  await new Promise((resolve) => setTimeout(resolve, 1800));

  const normalizedKeyword = String(keyword || "").trim().toLowerCase();
  const candidates = Array.from(document.querySelectorAll("a[href]"))
    .map((anchor) => {
      try {
        const url = new URL(anchor.href, location.href);
        const label = `${anchor.textContent || ""} ${url.pathname}`.toLowerCase();

        return {
          url: url.toString().replace(/#.*$/, ""),
          label,
          score: label.includes(normalizedKeyword) ? 1 : 0
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((item) => {
      const url = new URL(item.url);
      return url.hostname.includes("emaillove.com") && url.pathname.includes("/email-inspiration-from-");
    })
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const links = [];

  for (const item of candidates) {
    if (seen.has(item.url)) {
      continue;
    }

    seen.add(item.url);
    links.push(item.url);

    if (links.length >= limit) {
      break;
    }
  }

  return links;
}

function getElementCaptureMetrics(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
}

async function scrollPageForLazyContent() {
  const steps = 6;

  for (let index = 0; index < steps; index += 1) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    await new Promise((resolve) => setTimeout(resolve, 900));
  }

  window.scrollTo({ top: 0, behavior: "instant" });
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function collectEmailInspireBrandLinks(limit) {
  const parts = location.pathname.split("/").filter(Boolean);
  const brandSlug = parts[0] || "";
  const brandName = document.querySelector("h1")?.textContent?.trim() || brandSlug;
  const seen = new Set();
  const links = [];

  for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
    let url;

    try {
      url = new URL(anchor.href, location.href);
    } catch {
      continue;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);

    if (!url.hostname.includes("emailinspire.com") || pathParts[0] !== brandSlug || pathParts.length !== 2) {
      continue;
    }

    const normalized = url.toString().replace(/#.*$/, "");

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    links.push(normalized);

    if (links.length >= limit) {
      break;
    }
  }

  return { brandName, links };
}

function scrollElementChunkIntoView(selector, offsetY) {
  const element = document.querySelector(selector);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const documentTop = rect.top + window.scrollY;
  const documentLeft = rect.left + window.scrollX;

  window.scrollTo({
    top: Math.max(0, documentTop + offsetY - 24),
    left: Math.max(0, documentLeft - 24),
    behavior: "instant"
  });

  return true;
}

function getVisibleElementChunk(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const visibleTop = Math.max(rect.top, 0);
  const visibleBottom = Math.min(rect.bottom, window.innerHeight);
  const left = Math.max(rect.left, 0);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);

  return {
    left,
    width: Math.min(rect.width, window.innerWidth - left),
    visibleTop,
    visibleHeight,
    elementVisibleTop: visibleTop - rect.top,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
}

function extractEmailInspirePage() {
  const pathParts = location.pathname.split("/").filter(Boolean);
  const brandSlug = pathParts[0] || "";
  const brandName =
    document.querySelector("#email-content")?.getAttribute("data-brand-name") ||
    document.querySelector(`a[href="/${brandSlug}"]`)?.textContent?.trim() ||
    brandSlug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") ||
    "Email Inspire";
  const title = document.querySelector("h1")?.textContent?.trim() || document.title.replace(/\s*\|\s*Email Inspire$/i, "");
  const text = document.body.innerText || "";
  const match = (start, end) => {
    const startIndex = text.indexOf(start);

    if (startIndex === -1) {
      return "";
    }

    const tail = text.slice(startIndex + start.length);
    const endIndex = end ? tail.indexOf(end) : -1;
    return (endIndex === -1 ? tail : tail.slice(0, endIndex)).replace(/\s+/g, " ").trim();
  };
  const relatedImages = Array.from(document.images)
    .map((img) => img.currentSrc || img.src)
    .filter((src) => src && src.includes("preview-images"));

  return {
    sourceUrl: location.href,
    title,
    brandName,
    fromName: brandName,
    subject: match("SUBJECT", "PREVIEW TEXT") || title,
    previewText: match("PREVIEW TEXT", "RECEIVED AT"),
    coverImageUrl: null,
    imageUrls: Array.from(new Set(relatedImages)).slice(0, 80),
    capturedHtml: "",
    capturedText: text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 220)
      .join("\n")
  };
}

function extractEmailLovePage() {
  const text = document.body.innerText || "";
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const match = (regex) => text.match(regex)?.[1]?.trim() || "";
  const title = document.querySelector("h1")?.textContent?.trim() || document.title;
  const brandFromTitle = title.match(/Email Inspiration from\s+(.+)$/i)?.[1]?.trim() || "";
  const emailRoot = findEmailRoot();
  const images = Array.from(document.images)
    .map((img) => ({
      src: img.currentSrc || img.src,
      area: (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0)
    }))
    .filter((item) => item.src && item.area > 30000 && !item.src.startsWith("data:"))
    .sort((a, b) => b.area - a.area)
    .slice(0, 80)
    .map((item) => item.src);

  return {
    sourceUrl: location.href,
    title,
    brandName: brandFromTitle || match(/FROM:\s*([^\n]+)/i),
    fromName: match(/FROM:\s*([^\n]+)/i),
    subject: match(/SUBJECT:\s*([^\n]+)/i),
    previewText: lines.find((line) => !/^(FROM|SUBJECT|TO):/i.test(line) && line.length > 16) || "",
    coverImageUrl: images[0] || null,
    imageUrls: images,
    capturedHtml: normalizeHtml(emailRoot),
    capturedText: lines.slice(0, 260).join("\n")
  };
}

function findEmailRoot() {
  const candidates = Array.from(document.querySelectorAll("main, article, section, table, div"))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const text = element.textContent || "";
      const imageCount = element.querySelectorAll("img").length;
      const score = rect.width * rect.height + imageCount * 50000 + Math.min(text.length, 2000) * 120;

      return { element, score, text, imageCount };
    })
    .filter((item) => item.imageCount > 0 && item.text.length > 80)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.element || document.querySelector("main") || document.body;
}

function normalizeHtml(element) {
  const clone = element.cloneNode(true);

  clone.querySelectorAll("script, style, iframe, noscript").forEach((node) => node.remove());
  clone.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (/^on/i.test(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    }
  });

  return clone.outerHTML;
}
