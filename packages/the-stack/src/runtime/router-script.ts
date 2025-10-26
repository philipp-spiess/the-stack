const RAW_ROUTER_CLIENT_SOURCE = String.raw`(() => {
  const STACK_PARAM = "_stack";
  const CURRENT_PARAM = "_stack_current";
  const LINK_ATTR = "data-stack-link";
  const BOUNDARY_SELECTOR = "[data-stack-id]";
  const ROUTER_FLAG = "__theStackRouterInitialized";

  if (window[ROUTER_FLAG]) {
    return;
  }
  window[ROUTER_FLAG] = true;

  const state = {
    controller: null,
    currentRoutePath: null,
  };

  function collectStack(includeHtml = true) {
    return Array.from(document.querySelectorAll(BOUNDARY_SELECTOR)).map(
      (node) => ({
        id: node.getAttribute("data-stack-id") || "",
        version: node.getAttribute("data-stack-version") || "0",
        html: includeHtml ? node.innerHTML : undefined,
        retain: false,
      }),
    );
  }

  function deriveRoutePathFromStack(stack) {
    if (!stack.length) {
      return null;
    }
    const last = stack[stack.length - 1];
    if (!last || typeof last.id !== "string") {
      return null;
    }
    return last.id.startsWith("route:") ? last.id.slice("route:".length) : null;
  }

  function snapshotFromDom() {
    const stack = collectStack(true).map((entry) => ({
      ...entry,
      retain: false,
    }));
    const routePath = deriveRoutePathFromStack(stack);
    state.currentRoutePath = routePath;
    return {
      url: window.location.pathname + window.location.search + window.location.hash,
      stack,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      routePath,
    };
  }

  function createBoundaryElement(entry) {
    const el = document.createElement("div");
    el.style.display = "contents";
    el.setAttribute("data-stack-id", entry.id);
    el.setAttribute("data-stack-version", entry.version ?? "0");
    el.innerHTML = entry.html || "";
    return el;
  }

  function hardNavigate(url) {
    window.location.href = url || window.location.href;
  }

  function applyStackPayload(payload) {
    if (!payload || !Array.isArray(payload.stack)) {
      return;
    }

    const desired = payload.stack;
    const getNodes = () =>
      Array.from(document.querySelectorAll(BOUNDARY_SELECTOR));

    // Remove surplus boundaries if the new stack is shorter.
    let currentNodes = getNodes();
    if (currentNodes.length > desired.length) {
      for (let i = currentNodes.length - 1; i >= desired.length; i -= 1) {
        currentNodes[i].remove();
      }
      currentNodes = getNodes();
    }

    for (let i = 0; i < desired.length; i += 1) {
      const info = desired[i];
      currentNodes = getNodes();
      const existing = currentNodes[i];

      if (info.retain) {
        if (!existing || existing.getAttribute("data-stack-id") !== info.id) {
          hardNavigate(payload.url);
          return;
        }
        continue;
      }

      if (!info.html) {
        hardNavigate(payload.url);
        return;
      }

      const replacement = createBoundaryElement(info);
      if (existing) {
        existing.replaceWith(replacement);
      } else {
        const parents = getNodes();
        const parent = i === 0 ? document.body : parents[i - 1];
        if (parent) {
          parent.appendChild(replacement);
        } else {
          document.body.appendChild(replacement);
        }
      }
    }

    state.currentRoutePath = payload.routePath || deriveRoutePathFromStack(collectStack(false));
  }

  function persistScroll() {
    const currentState =
      history.state && typeof history.state === "object"
        ? { ...history.state }
        : snapshotFromDom();
    currentState.scrollX = window.scrollX;
    currentState.scrollY = window.scrollY;
    history.replaceState(currentState, document.title, window.location.href);
  }

  async function navigate(url, options = {}) {
    const target = new URL(url, window.location.origin);
    if (target.origin !== window.location.origin) {
      window.location.href = target.href;
      return;
    }

    const currentUrl =
      window.location.pathname + window.location.search + window.location.hash;
    const targetUrl = target.pathname + target.search + target.hash;
    if (targetUrl === currentUrl) {
      return;
    }

    persistScroll();

    const requestUrl = new URL(target.href);
    requestUrl.searchParams.set(STACK_PARAM, "1");
    const currentRoutePath = state.currentRoutePath || deriveRoutePathFromStack(collectStack(false));
    if (currentRoutePath) {
      requestUrl.searchParams.set(CURRENT_PARAM, currentRoutePath);
    }

    if (state.controller) {
      state.controller.abort();
    }
    const controller = new AbortController();
    state.controller = controller;

    try {
      const response = await fetch(requestUrl.href, {
        headers: {
          Accept: "application/json",
          "X-The-Stack": "router",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const payload = await response.json();
      payload.url = targetUrl;

      applyStackPayload(payload);

      const snapshot = snapshotFromDom();
      snapshot.url = targetUrl;

      if (options.replace) {
        history.replaceState(snapshot, document.title, targetUrl);
      } else {
        history.pushState(snapshot, document.title, targetUrl);
      }

      window.scrollTo(0, 0);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      window.location.href = target.href;
    } finally {
      state.controller = null;
    }
  }

  function handleClick(event) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    const target =
      event.target instanceof Element
        ? event.target.closest('a[' + LINK_ATTR + ']')
        : null;
    if (!target) {
      return;
    }

    const href = target.getAttribute("href");
    if (
      !href ||
      (target.getAttribute("target") && target.getAttribute("target") !== "_self")
    ) {
      return;
    }

    event.preventDefault();
    navigate(href, { replace: target.dataset.stackReplace === "true" });
  }

  function handlePopState(event) {
    const nextState = event.state;
    if (!nextState || !Array.isArray(nextState.stack)) {
      navigate(window.location.href, { replace: true });
      return;
    }

    applyStackPayload(nextState);
    if (
      typeof nextState.scrollX === "number" ||
      typeof nextState.scrollY === "number"
    ) {
      window.scrollTo(nextState.scrollX || 0, nextState.scrollY || 0);
    }
  }

  const initialSnapshot = snapshotFromDom();
  history.replaceState(initialSnapshot, document.title, window.location.href);

  document.addEventListener("click", handleClick);
  window.addEventListener("popstate", handlePopState);
})();`;

export const routerClientSource = RAW_ROUTER_CLIENT_SOURCE.replace(
  /<\/script>/g,
  "<\\/script>",
);
