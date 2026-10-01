(() => {
  const CHANNEL = "pixel-war-chicken-zoom-bridge";
  const SELECTOR = ".pixel-war__viewport canvas.pixel-war__canvas";
  const prototype = globalThis.CanvasRenderingContext2D?.prototype;
  if (!prototype) return;

  let latestCamera = null;

  function publish() {
    if (!latestCamera) return;
    window.postMessage(
      {
        source: CHANNEL,
        type: "camera",
        ...latestCamera
      },
      window.location.origin
    );
  }

  const descriptor = Object.getOwnPropertyDescriptor(prototype, "drawImage");
  if (typeof descriptor?.value === "function" && descriptor.configurable) {
    const originalDrawImage = descriptor.value;
    Object.defineProperty(prototype, "drawImage", {
      ...descriptor,
      value: function (image, ...args) {
        const result = originalDrawImage.call(this, image, ...args);
        if (
          this.canvas?.matches?.(SELECTOR) &&
          image?.width === 250 &&
          image?.height === 250 &&
          args.length === 8
        ) {
          const matrix = this.getTransform();
          latestCamera = {
            sourceRect: args.slice(0, 4),
            destinationRect: args.slice(4, 8),
            transform: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height
          };
          publish();
        }
        return result;
      }
    });
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (
      event.data?.source === "pixel-war-chicken-guide" &&
      event.data.type === "request-camera"
    ) {
      publish();
    }
  });
})();
