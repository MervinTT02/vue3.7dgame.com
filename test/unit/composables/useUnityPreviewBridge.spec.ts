import { createApp } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUnityPreviewBridge } from "@/composables/useUnityPreviewBridge";
vi.mock("@/environment", () => ({
  default: {
    unityPreview: "http://localhost:3006/embed.html",
    api: "http://localhost:3001/dev-api",
  },
}));
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function setup() {
  let bridge!: ReturnType<typeof useUnityPreviewBridge>;
  const payload = vi.fn(async () => ({}));
  const app = createApp({
    setup() {
      bridge = useUnityPreviewBridge({
        buildPayload: payload,
        notifyError: vi.fn(),
      });
      return () => null;
    },
  });
  const element = document.createElement("div");
  app.mount(element);
  cleanups.push(() => app.unmount());
  bridge.dialogRef.value = {
    isFrameSource: (source: unknown) => source === window,
    postMessage: vi.fn(),
  } as unknown as NonNullable<typeof bridge.dialogRef.value>;
  const message = (
    code: string,
    origin = "http://localhost:3006",
    type = "unity-web-preview-error"
  ) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        origin,
        data: { type, code, message: "secret-token" },
      })
    );
  return { bridge, message, payload };
}
describe("Unity preview diagnostics", () => {
  it("accepts only current frame origin and reports sanitized failure", async () => {
    const { bridge, message } = setup();
    await bridge.open();
    message("UNITY_LOAD_FAILED", "https://untrusted.invalid");
    expect(bridge.failure.value).toBeNull();
    message("UNITY_LOAD_FAILED");
    expect(bridge.failure.value).toEqual({
      code: "UNITY_LOAD_FAILED",
      stage: "runtime_load",
    });
    expect(JSON.stringify(bridge.failure.value)).not.toContain("secret-token");
    bridge.close();
    expect(bridge.failure.value).toBeNull();
    message("SCENE_FORWARD_FAILED");
    expect(bridge.failure.value).toBeNull();
  });
  it("handles rejected asynchronous payload instead of leaving preview loading", async () => {
    const { bridge, message, payload } = setup();
    await bridge.open();
    payload.mockRejectedValue(new Error("private-url"));
    message("", "http://localhost:3006", "unity-web-preview-ready");
    await vi.waitFor(() =>
      expect(bridge.failure.value?.code).toBe("SCENE_PAYLOAD_FAILED")
    );
  });
});
