import { describe, expect, it, vi } from "vitest";
import { registerScriptPreviewWebMcpTools } from "@/services/webmcp/script-preview-tools";

const snapshot = {
  ownerKind: "entity" as const,
  ownerId: 35,
  ownerTitle: "中国空间站",
  visible: true,
  status: "running" as const,
  runId: "preview-1",
  startedAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:01.000Z",
  workspaceVersion: "workspace-1",
  expectedResourceCount: 9,
  loadedResourceCount: 9,
  missingResourceIds: [],
  diagnosticCount: 1,
};

const diagnostics = [
  {
    timestamp: "2026-08-31T00:00:01.000Z",
    level: "info" as const,
    code: "PREVIEW_RUNNING",
    message: "当前脚本已在页面预览区完成初始化",
  },
];

const register = () => {
  const registered: Array<{
    name: string;
    execute: (input: unknown) => unknown;
  }> = [];
  const options = {
    document: {
      modelContext: {
        registerTool: (tool: {
          name: string;
          execute: (input: unknown) => unknown;
        }) => registered.push(tool),
      },
    } as unknown as Document,
    getStatus: vi.fn().mockResolvedValue(snapshot),
    startPreview: vi.fn().mockResolvedValue(snapshot),
    getDiagnostics: vi.fn().mockResolvedValue(diagnostics),
    stopPreview: vi.fn().mockResolvedValue({ ...snapshot, status: "stopped" }),
  };
  const lifecycle = registerScriptPreviewWebMcpTools(options);
  return { registered, options, lifecycle };
};

describe("script preview WebMCP tools", () => {
  it("registers the four page-scoped preview tools with one lifecycle", () => {
    const { registered, lifecycle } = register();
    expect(registered.map((tool) => tool.name)).toEqual([
      "xrugc_get_script_preview_status",
      "xrugc_start_script_preview",
      "xrugc_get_script_preview_diagnostics",
      "xrugc_stop_script_preview",
    ]);
    lifecycle?.abort();
  });

  it("starts with the default or explicitly requested timeout", async () => {
    const { registered, options } = register();
    await expect(registered[1].execute({})).resolves.toEqual(snapshot);
    await expect(registered[1].execute({ timeoutMs: 2500 })).resolves.toEqual(
      snapshot
    );
    expect(options.startPreview).toHaveBeenNthCalledWith(1, 10000);
    expect(options.startPreview).toHaveBeenNthCalledWith(2, 2500);
  });

  it("filters diagnostics and stops the visible preview", async () => {
    const { registered, options } = register();
    await expect(
      registered[2].execute({ levels: ["error", "warning", "error"], limit: 8 })
    ).resolves.toEqual({ count: 1, diagnostics });
    expect(options.getDiagnostics).toHaveBeenCalledWith(
      ["error", "warning"],
      8
    );

    await expect(registered[3].execute({})).resolves.toMatchObject({
      status: "stopped",
    });
    expect(options.stopPreview).toHaveBeenCalledOnce();
  });

  it("rejects invalid timeout and diagnostics filters", async () => {
    const { registered } = register();
    await expect(registered[1].execute({ timeoutMs: 999 })).rejects.toThrow(
      "1000 到 30000"
    );
    await expect(registered[2].execute({ levels: ["fatal"] })).rejects.toThrow(
      "info、warning 或 error"
    );
    await expect(registered[2].execute({ limit: 101 })).rejects.toThrow(
      "1 到 100"
    );
  });
});
