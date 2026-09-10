import { afterEach, describe, expect, it, vi } from "vitest";
import { useScriptPreviewController } from "@/composables/useScriptPreviewController";

const createOptions = () => ({
  validate: vi.fn().mockResolvedValue({
    valid: true,
    workspaceVersion: "workspace-1",
  }),
  show: vi.fn().mockResolvedValue(undefined),
  hide: vi.fn().mockResolvedValue(undefined),
  getResources: vi.fn().mockReturnValue({
    expectedCount: 1,
    expectedIds: ["root"],
    loadedIds: ["root"],
  }),
  execute: vi.fn().mockResolvedValue({
    diagnostics: [
      {
        level: "warning" as const,
        code: "EMPTY_SCRIPT",
        message: "当前脚本没有可执行内容",
      },
    ],
  }),
  onError: vi.fn(),
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useScriptPreviewController", () => {
  it("validates, loads resources, executes and stops a preview", async () => {
    const options = createOptions();
    const controller = useScriptPreviewController(options);

    await expect(controller.start(3000)).resolves.toMatchObject({
      status: "running",
      workspaceVersion: "workspace-1",
      expectedResourceCount: 1,
      loadedResourceCount: 1,
      missingResourceIds: [],
      diagnosticCount: 2,
    });
    expect(options.show).toHaveBeenCalledOnce();
    expect(options.execute).toHaveBeenCalledOnce();
    expect(controller.getDiagnostics().map((item) => item.code)).toEqual([
      "EMPTY_SCRIPT",
      "PREVIEW_RUNNING",
    ]);

    await expect(controller.stop()).resolves.toMatchObject({
      status: "stopped",
      diagnosticCount: 3,
    });
    expect(options.hide).toHaveBeenCalledOnce();
  });

  it("returns structured Blockly validation diagnostics without showing", async () => {
    const options = createOptions();
    options.validate.mockResolvedValue({
      valid: false,
      workspaceVersion: "workspace-invalid",
      issue: {
        message: "事件积木缺少连接",
        blockId: "block-7",
        blockType: "scene_start",
        blockText: "场景开始",
      },
    });
    const controller = useScriptPreviewController(options);

    await expect(controller.start()).resolves.toMatchObject({
      status: "validation_failed",
      workspaceVersion: "workspace-invalid",
      diagnosticCount: 1,
    });
    expect(options.show).not.toHaveBeenCalled();
    expect(options.execute).not.toHaveBeenCalled();
    expect(controller.getDiagnostics()).toEqual([
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        blockId: "block-7",
        blockType: "scene_start",
        blockText: "场景开始",
      }),
    ]);
  });

  it("does not treat an incomplete expected-ID list as fully loaded", async () => {
    vi.useFakeTimers();
    const options = createOptions();
    options.getResources
      .mockReturnValueOnce({
        expectedCount: 2,
        expectedIds: ["known"],
        loadedIds: ["known"],
      })
      .mockReturnValue({
        expectedCount: 2,
        expectedIds: ["known"],
        loadedIds: ["known", "count-fallback"],
      });
    const controller = useScriptPreviewController(options);

    const pending = controller.start(1000);
    await vi.advanceTimersByTimeAsync(100);
    await expect(pending).resolves.toMatchObject({
      status: "running",
      expectedResourceCount: 2,
      loadedResourceCount: 2,
    });
    expect(options.getResources).toHaveBeenCalledTimes(2);
  });

  it("captures runtime errors and notifies the page", async () => {
    const options = createOptions();
    options.execute.mockRejectedValue(new Error("脚本运行失败"));
    const controller = useScriptPreviewController(options);

    await expect(controller.start()).resolves.toMatchObject({
      status: "error",
      diagnosticCount: 1,
    });
    expect(controller.getDiagnostics(["error"], 10)).toEqual([
      expect.objectContaining({
        code: "RUNTIME_ERROR",
        message: "脚本运行失败",
      }),
    ]);
    expect(options.onError).toHaveBeenCalledWith("脚本运行失败");
  });
});
