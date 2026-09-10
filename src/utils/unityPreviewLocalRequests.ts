const isLoopback = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1";

export function normalizeLocalPreviewRequest(input: string, origin: string) {
  const local = new URL(origin);
  if (local.protocol !== "http:" || !isLoopback(local.hostname)) return input;
  try {
    const url = new URL(input, origin);
    if (
      isLoopback(url.hostname) &&
      url.port === local.port &&
      url.pathname === "/__xrugc_proxy__"
    ) {
      return local.origin + url.pathname + url.search + url.hash;
    }
  } catch {
    /* Preserve requests that are not URLs. */
  }
  return input;
}

/** Older Unity builds hard-code HTTPS and 127.0.0.1 for local asset requests. */
export function installLocalPreviewRequestGuard(frame: HTMLIFrameElement) {
  if (!import.meta.env.DEV || !isLoopback(window.location.hostname)) return;
  const url = new URL(frame.src, window.location.href);
  if (url.origin !== window.location.origin) return;
  const target = frame.contentWindow as (Window & typeof globalThis) | null;
  if (!target) return;
  const normalize = (input: string) =>
    normalizeLocalPreviewRequest(input, url.origin);
  const fetch = target.fetch.bind(target);
  target.fetch = (input, init) => {
    if (typeof input === "string") return fetch(normalize(input), init);
    if (input instanceof target.URL) return fetch(normalize(input.href), init);
    if (input instanceof target.Request) {
      const next = normalize(input.url);
      if (next !== input.url)
        return fetch(new target.Request(next, input), init);
    }
    return fetch(input, init);
  };
  const open = target.XMLHttpRequest.prototype.open;
  target.XMLHttpRequest.prototype.open = function (
    method: string,
    input: string | URL,
    async = true,
    username?: string | null,
    password?: string | null
  ) {
    return open.call(
      this,
      method,
      normalize(String(input)),
      async,
      username,
      password
    );
  };
}
