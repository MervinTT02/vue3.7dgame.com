export type ScriptPreviewStatus =
  | "idle"
  | "validating"
  | "loading_resources"
  | "executing"
  | "running"
  | "validation_failed"
  | "error"
  | "stopped";

export type ScriptPreviewDiagnosticLevel = "info" | "warning" | "error";

export type ScriptPreviewDiagnostic = {
  timestamp: string;
  level: ScriptPreviewDiagnosticLevel;
  code: string;
  message: string;
  blockId?: string;
  blockType?: string;
  blockText?: string;
  details?: Record<string, unknown>;
};

export type ScriptPreviewResourceState = {
  expectedCount: number;
  expectedIds: string[];
  loadedIds: string[];
};

export type ScriptPreviewValidation = {
  valid: boolean;
  workspaceVersion?: string;
  issue?: {
    message?: string;
    blockId?: string;
    blockType?: string;
    blockText?: string;
  };
};

export type ScriptPreviewExecutionResult = {
  diagnostics?: Array<
    Omit<ScriptPreviewDiagnostic, "timestamp"> & { timestamp?: string }
  >;
};

export type ScriptPreviewSnapshot = {
  status: ScriptPreviewStatus;
  runId: string | null;
  startedAt: string | null;
  updatedAt: string;
  workspaceVersion: string | null;
  expectedResourceCount: number;
  loadedResourceCount: number;
  missingResourceIds: string[];
  diagnosticCount: number;
};

type ScriptPreviewControllerOptions = {
  validate: () => Promise<ScriptPreviewValidation>;
  show: () => Promise<void> | void;
  hide: () => Promise<void> | void;
  getResources: () => ScriptPreviewResourceState;
  execute: (
    signal: AbortSignal
  ) => Promise<ScriptPreviewExecutionResult | void>;
  onError?: (message: string) => void;
};

const nowIso = () => new Date().toISOString();

const makeRunId = () =>
  `preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeTimeout = (timeoutMs: number) =>
  Math.max(1000, Math.min(30000, Math.floor(timeoutMs)));

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const wait = (delayMs: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("预览已停止"));
      return;
    }
    const timer = window.setTimeout(resolve, delayMs);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(signal.reason ?? new Error("预览已停止"));
      },
      { once: true }
    );
  });

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) {
    throw signal.reason ?? new Error("预览已停止");
  }
};

const executeBeforeDeadline = async <T>(
  action: Promise<T>,
  deadline: number,
  signal: AbortSignal
) => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("脚本预览执行超时");
  let timer: number | undefined;
  try {
    return await Promise.race([
      action,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error("脚本预览执行超时")),
          remaining
        );
        signal.addEventListener(
          "abort",
          () => reject(signal.reason ?? new Error("预览已停止")),
          { once: true }
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
};

export const useScriptPreviewController = (
  options: ScriptPreviewControllerOptions
) => {
  let status: ScriptPreviewStatus = "idle";
  let runId: string | null = null;
  let startedAt: string | null = null;
  let updatedAt = nowIso();
  let workspaceVersion: string | null = null;
  let expectedResourceCount = 0;
  let loadedResourceCount = 0;
  let missingResourceIds: string[] = [];
  let activeController: AbortController | null = null;
  let diagnostics: ScriptPreviewDiagnostic[] = [];

  const updateStatus = (nextStatus: ScriptPreviewStatus) => {
    status = nextStatus;
    updatedAt = nowIso();
  };

  const addDiagnostic = (
    diagnostic: Omit<ScriptPreviewDiagnostic, "timestamp"> & {
      timestamp?: string;
    }
  ) => {
    diagnostics.push({
      ...diagnostic,
      timestamp: diagnostic.timestamp ?? nowIso(),
    });
    if (diagnostics.length > 100) diagnostics = diagnostics.slice(-100);
    updatedAt = nowIso();
  };

  const refreshResources = () => {
    const resourceState = options.getResources();
    expectedResourceCount = Math.max(0, resourceState.expectedCount);
    const loaded = new Set(resourceState.loadedIds.map(String));
    loadedResourceCount = loaded.size;
    missingResourceIds = resourceState.expectedIds
      .map(String)
      .filter((id) => id && !loaded.has(id));
    return resourceState;
  };

  const snapshot = (): ScriptPreviewSnapshot => ({
    status,
    runId,
    startedAt,
    updatedAt,
    workspaceVersion,
    expectedResourceCount,
    loadedResourceCount,
    missingResourceIds: [...missingResourceIds],
    diagnosticCount: diagnostics.length,
  });

  const stop = async (reason = "requested") => {
    activeController?.abort(new Error("预览已停止"));
    activeController = null;
    await options.hide();
    if (status !== "idle" && status !== "stopped") {
      addDiagnostic({
        level: "info",
        code: "PREVIEW_STOPPED",
        message: "脚本预览已停止",
        details: { reason },
      });
    }
    updateStatus("stopped");
    return snapshot();
  };

  const start = async (timeoutMs = 10000) => {
    if (activeController) await stop("restart");
    diagnostics = [];
    runId = makeRunId();
    startedAt = nowIso();
    workspaceVersion = null;
    expectedResourceCount = 0;
    loadedResourceCount = 0;
    missingResourceIds = [];
    const controller = new AbortController();
    activeController = controller;
    const timeout = normalizeTimeout(timeoutMs);
    const deadline = Date.now() + timeout;

    try {
      updateStatus("validating");
      const validation = await options.validate();
      workspaceVersion = validation.workspaceVersion ?? null;
      if (!validation.valid) {
        const issue = validation.issue;
        addDiagnostic({
          level: "error",
          code: "VALIDATION_FAILED",
          message: issue?.message || "Blockly 工作区校验失败",
          blockId: issue?.blockId,
          blockType: issue?.blockType,
          blockText: issue?.blockText,
        });
        updateStatus("validation_failed");
        activeController = null;
        return snapshot();
      }

      await options.show();
      updateStatus("loading_resources");
      while (true) {
        throwIfAborted(controller.signal);
        const resources = refreshResources();
        const knownExpectedIds = new Set(
          resources.expectedIds.map(String).filter(Boolean)
        );
        const readyById =
          knownExpectedIds.size >= expectedResourceCount &&
          missingResourceIds.length === 0;
        const readyByCount =
          resources.loadedIds.length >= expectedResourceCount;
        const ready = expectedResourceCount === 0 || readyById || readyByCount;
        if (ready) break;
        if (Date.now() >= deadline) {
          addDiagnostic({
            level: "error",
            code: "RESOURCE_TIMEOUT",
            message: "预览资源未在限定时间内加载完成",
            details: {
              expectedResourceCount,
              loadedResourceCount,
              missingResourceIds: [...missingResourceIds],
              timeoutMs: timeout,
            },
          });
          updateStatus("error");
          activeController = null;
          return snapshot();
        }
        await wait(
          Math.min(100, Math.max(1, deadline - Date.now())),
          controller.signal
        );
      }

      updateStatus("executing");
      const execution = await executeBeforeDeadline(
        options.execute(controller.signal),
        deadline,
        controller.signal
      );
      for (const diagnostic of execution?.diagnostics ?? []) {
        addDiagnostic(diagnostic);
      }
      throwIfAborted(controller.signal);
      addDiagnostic({
        level: "info",
        code: "PREVIEW_RUNNING",
        message: "当前脚本已在页面预览区完成初始化",
      });
      updateStatus("running");
      return snapshot();
    } catch (error) {
      if (controller.signal.aborted) {
        updateStatus("stopped");
        return snapshot();
      }
      const message = errorMessage(error);
      addDiagnostic({
        level: "error",
        code: "RUNTIME_ERROR",
        message,
        details: {
          stack:
            error instanceof Error ? error.stack?.slice(0, 2000) : undefined,
        },
      });
      updateStatus("error");
      options.onError?.(message);
      activeController = null;
      return snapshot();
    }
  };

  const getDiagnostics = (
    levels?: ScriptPreviewDiagnosticLevel[],
    limit = 50
  ) => {
    const selected = levels?.length
      ? diagnostics.filter((item) => levels.includes(item.level))
      : diagnostics;
    return selected.slice(-Math.max(1, Math.min(100, limit)));
  };

  return { start, stop, snapshot, getDiagnostics };
};
