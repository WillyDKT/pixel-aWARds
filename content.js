(() => {
  const BOARD_SIZE = 250;
  const WHITE_AREA = Object.freeze({ x: 17, y: 12, width: 44, height: 59 });
  const template = globalThis.PIXEL_CHICKEN_TEMPLATE;
  const overlay = document.createElement("canvas");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position:fixed",
    "pointer-events:none",
    "z-index:2147483646",
    "display:none",
    "margin:0",
    "padding:0",
    "border:0",
    "border-radius:0",
    "box-sizing:content-box",
    "max-width:none",
    "max-height:none",
    "background:transparent"
  ].join(";");
  document.documentElement.append(overlay);

  let visible = true;
  let whiteAreaVisible = false;
  let opacity = 0.5;
  let boardCanvas = null;
  let boardViewport = null;
  let cameraFrame = null;
  let resizeObserver = null;
  let frameRequested = false;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;right:12px;bottom:12px;z-index:2147483647;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; color: #17202a; font: 13px/1.4 system-ui, sans-serif; pointer-events: none; }
    * { box-sizing: border-box; }
    .panel { width: min(252px, calc(100vw - 24px)); padding: 12px; border: 1px solid #c9d1d9; border-radius: 10px;
      background: #fff; box-shadow: 0 4px 18px #0003; pointer-events: auto; }
    .title { margin: 0 0 8px; font-size: 14px; font-weight: 700; }
    button { width: 100%; padding: 7px 10px; border: 0; border-radius: 6px;
      background: #1646b4; color: #fff; font: inherit; font-weight: 650; cursor: pointer; }
    button.mask-toggle { margin-top: 6px; border: 1px solid #c9d1d9;
      background: #f2f4f7; color: #17202a; }
    button:focus-visible, input:focus-visible { outline: 3px solid #ffbf47; outline-offset: 2px; }
    .details { margin: 9px 0; color: #344054; }
    .status { min-height: 18px; color: #a33b00; }
    label { display: block; margin-top: 8px; font-weight: 600; }
    input { width: 100%; margin: 4px 0 0; accent-color: #1646b4; }
    .hint { margin: 7px 0 0; color: #586474; font-size: 11px; }
  `;
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("aria-label", "Pixel War chicken guide");
  const title = document.createElement("h2");
  title.className = "title";
  title.textContent = "Chicken guide";
  const toggle = document.createElement("button");
  toggle.type = "button";
  const whiteAreaToggle = document.createElement("button");
  whiteAreaToggle.type = "button";
  whiteAreaToggle.className = "mask-toggle";
  const details = document.createElement("p");
  details.className = "details";
  details.textContent =
    `Board: ${BOARD_SIZE} × ${BOARD_SIZE} · origin (0,0) top-left` +
    `\nAnchor: (${template.anchor.x},${template.anchor.y}) · correction (${template.alignmentOffset.x},${template.alignmentOffset.y})` +
    `\nRendered top-left: (${template.anchor.x + template.alignmentOffset.x},${template.anchor.y + template.alignmentOffset.y}) · ${template.width} × ${template.height}` +
    `\nWhite area: (${WHITE_AREA.x},${WHITE_AREA.y})–(${WHITE_AREA.x + WHITE_AREA.width - 1},${WHITE_AREA.y + WHITE_AREA.height - 1}), inclusive`;
  details.style.whiteSpace = "pre-line";
  const status = document.createElement("div");
  status.className = "status";
  status.setAttribute("role", "status");
  const opacityLabel = document.createElement("label");
  opacityLabel.textContent = "Overlay opacity";
  const opacitySlider = document.createElement("input");
  opacitySlider.type = "range";
  opacitySlider.min = "20";
  opacitySlider.max = "80";
  opacitySlider.step = "5";
  opacitySlider.value = "50";
  opacitySlider.setAttribute("aria-label", "Overlay opacity");
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "Guide only — it never places pixels. Toggle: Alt + Shift + P";
  opacityLabel.append(opacitySlider);
  panel.append(title, toggle, whiteAreaToggle, details, status, opacityLabel, hint);
  shadow.append(style, panel);
  document.documentElement.append(host);

  function updateToggle() {
    toggle.textContent = visible ? "Hide chicken" : "Show chicken";
    toggle.setAttribute("aria-pressed", String(visible));
  }

  function updateWhiteAreaToggle() {
    whiteAreaToggle.textContent = whiteAreaVisible ? "Hide white area" : "Show white area";
    whiteAreaToggle.setAttribute("aria-pressed", String(whiteAreaVisible));
  }

  function draw() {
    frameRequested = false;
    if (overlay.parentElement !== document.documentElement) {
      document.documentElement.append(overlay);
    }
    const canvas = document.querySelector(".pixel-war__viewport canvas.pixel-war__canvas");
    const viewport = canvas?.closest(".pixel-war__viewport");
    if (!canvas || !canvas.isConnected || !viewport) {
      resizeObserver?.disconnect();
      resizeObserver = null;
      boardCanvas = null;
      boardViewport = null;
      overlay.remove();
      overlay.style.display = "none";
      status.textContent = "Waiting for the Pixel War board…";
      return;
    }

    if (canvas !== boardCanvas || viewport !== boardViewport) {
      resizeObserver?.disconnect();
      boardCanvas = canvas;
      boardViewport = viewport;
      resizeObserver = new ResizeObserver(scheduleDraw);
      resizeObserver.observe(canvas);
      resizeObserver.observe(viewport);
    }

    const rect = canvas.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height || (!visible && !whiteAreaVisible)) {
      overlay.style.display = "none";
      status.textContent = width && height ? "" : "Board is not visible.";
      return;
    }
    if (
      !cameraFrame ||
      cameraFrame.canvasWidth !== canvas.width ||
      cameraFrame.canvasHeight !== canvas.height
    ) {
      overlay.style.display = "none";
      status.textContent = "Waiting for the board camera…";
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const bitmapWidth = Math.max(1, Math.round(width * dpr));
    const bitmapHeight = Math.max(1, Math.round(height * dpr));
    if (overlay.width !== bitmapWidth) overlay.width = bitmapWidth;
    if (overlay.height !== bitmapHeight) overlay.height = bitmapHeight;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    const clipTop = Math.max(0, viewportRect.top - rect.top);
    const clipRight = Math.max(0, rect.right - viewportRect.right);
    const clipBottom = Math.max(0, rect.bottom - viewportRect.bottom);
    const clipLeft = Math.max(0, viewportRect.left - rect.left);
    overlay.style.clipPath =
      `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`;
    overlay.style.display = "block";

    const context = overlay.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const [sourceX, sourceY, sourceWidth, sourceHeight] = cameraFrame.sourceRect;
    const [destX, destY, destWidth, destHeight] = cameraFrame.destinationRect;
    const [a, b, c, d, e, f] = cameraFrame.transform;
    const scaleX = destWidth / sourceWidth;
    const scaleY = destHeight / sourceHeight;
    const offsetX = destX - sourceX * scaleX;
    const offsetY = destY - sourceY * scaleY;
    const cssScaleX = width / canvas.width;
    const cssScaleY = height / canvas.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      overlay.style.display = "none";
      status.textContent = "Invalid board camera.";
      return;
    }
    context.transform(
      cssScaleX * a * scaleX,
      cssScaleY * b * scaleX,
      cssScaleX * c * scaleY,
      cssScaleY * d * scaleY,
      cssScaleX * (a * offsetX + c * offsetY + e),
      cssScaleY * (b * offsetX + d * offsetY + f)
    );
    context.globalAlpha = 1;
    if (whiteAreaVisible) {
      context.fillStyle = "#ffffff";
      context.fillRect(WHITE_AREA.x, WHITE_AREA.y, WHITE_AREA.width, WHITE_AREA.height);
    }

    if (visible) {
      context.globalAlpha = opacity;
      for (let row = 0; row < template.height; row += 1) {
        for (let column = 0; column < template.width; column += 1) {
          const color = template.rows[row][column];
          if (color === "." || !template.palette[color]) continue;
          context.fillStyle = template.palette[color];
          context.fillRect(
            template.anchor.x + template.alignmentOffset.x + column,
            template.anchor.y + template.alignmentOffset.y + row,
            1,
            1
          );
        }
      }
    }
    context.globalAlpha = 1;
    const zoom = cameraFrame.destinationRect[2] / cameraFrame.sourceRect[2];
    const baseline = canvas.width / BOARD_SIZE;
    const [viewX, viewY, viewWidth, viewHeight] = cameraFrame.sourceRect;
    const templateX = template.anchor.x + template.alignmentOffset.x;
    const templateY = template.anchor.y + template.alignmentOffset.y;
    const templateVisible =
      templateX < viewX + viewWidth &&
      templateX + template.width > viewX &&
      templateY < viewY + viewHeight &&
      templateY + template.height > viewY;
    status.textContent =
      `Canvas zoom: ${(zoom / baseline).toFixed(2)}× · ` +
      `view ${viewX.toFixed(0)},${viewY.toFixed(0)}–` +
      `${(viewX + viewWidth).toFixed(0)},${(viewY + viewHeight).toFixed(0)}` +
      (visible && !templateVisible ? " · template off-screen" : "") +
      (whiteAreaVisible ? " · white area shown" : "");
  }

  function scheduleDraw() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(draw);
  }

  toggle.addEventListener("click", () => {
    visible = !visible;
    updateToggle();
    scheduleDraw();
  });
  whiteAreaToggle.addEventListener("click", () => {
    whiteAreaVisible = !whiteAreaVisible;
    updateWhiteAreaToggle();
    scheduleDraw();
  });
  opacitySlider.addEventListener("input", () => {
    opacity = Number(opacitySlider.value) / 100;
    scheduleDraw();
  });
  document.addEventListener("keydown", event => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "p") {
      visible = !visible;
      updateToggle();
      scheduleDraw();
    }
  });
  document.addEventListener(
    "click",
    event => {
      if (event.target.closest?.(".pixel-war__zoom-controls button")) scheduleDraw();
    },
    true
  );
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (
      message?.source !== "pixel-war-chicken-zoom-bridge" ||
      message.type !== "camera" ||
      !Array.isArray(message.sourceRect) ||
      !Array.isArray(message.destinationRect) ||
      !Array.isArray(message.transform) ||
      message.sourceRect.length !== 4 ||
      message.destinationRect.length !== 4 ||
      message.transform.length !== 6 ||
      ![
        ...message.sourceRect,
        ...message.destinationRect,
        ...message.transform,
        message.canvasWidth,
        message.canvasHeight
      ].every(Number.isFinite) ||
      message.sourceRect[2] <= 0 ||
      message.sourceRect[3] <= 0 ||
      message.destinationRect[2] <= 0 ||
      message.destinationRect[3] <= 0 ||
      message.canvasWidth <= 0 ||
      message.canvasHeight <= 0
    ) {
      return;
    }
    cameraFrame = {
      sourceRect: message.sourceRect,
      destinationRect: message.destinationRect,
      transform: message.transform,
      canvasWidth: message.canvasWidth,
      canvasHeight: message.canvasHeight
    };
    scheduleDraw();
  });

  window.addEventListener("resize", scheduleDraw);
  window.addEventListener("scroll", scheduleDraw, true);
  window.addEventListener("transitionend", scheduleDraw, true);
  window.addEventListener("animationend", scheduleDraw, true);
  window.visualViewport?.addEventListener("resize", scheduleDraw);
  window.visualViewport?.addEventListener("scroll", scheduleDraw);
  new MutationObserver(records => {
    if (records.some(record => record.target !== overlay && !host.contains(record.target))) {
      scheduleDraw();
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"]
  });

  updateToggle();
  updateWhiteAreaToggle();
  window.postMessage(
    { source: "pixel-war-chicken-guide", type: "request-camera" },
    window.location.origin
  );
  scheduleDraw();
})();
