import {
  registerWebMcpTools,
  type WebMcpRegistrationOptions,
  type WebMcpTool,
} from "./model-context";
import type {
  ScriptPreviewDiagnostic,
  ScriptPreviewDiagnosticLevel,
  ScriptPreviewSnapshot,
} from "@/composables/useScriptPreviewController";

type JsonRecord = Record<string, unknown>;

export type ScriptPreviewToolSnapshot = ScriptPreviewSnapshot & {
  ownerKind: "entity" | "scene";
  ownerId: number | null;
  ownerTitle: string;
  visible: boolean;
};

export type RegisterScriptPreviewWebMcpOptions = WebMcpRegistrationOptions & {
  getStatus: () =>
    | ScriptPreviewToolSnapshot
    | Promise<ScriptPreviewToolSnapshot>;
  startPreview: (timeoutMs: number) => Promise<ScriptPreviewToolSnapshot>;
  getDiagnostics: (
    levels: ScriptPreviewDiagnosticLevel[] | undefined,
    limit: number
  ) => ScriptPreviewDiagnostic[] | Promise<ScriptPreviewDiagnostic[]>;
  stopPreview: () => Promise<ScriptPreviewToolSnapshot>;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseLimit = (value: unknown) => {
  if (value === undefined) return 50;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new RangeError("limit 必须是 1 到 100 的整数");
  }
  return Number(value);
};

const parseTimeout = (value: unknown) => {
  if (value === undefined) return 10000;
  if (
    !Number.isInteger(value) ||
    Number(value) < 1000 ||
    Number(value) > 30000
  ) {
    throw new RangeError("timeoutMs 必须是 1000 到 30000 的整数");
  }
  return Number(value);
};

const parseLevels = (
  value: unknown
): ScriptPreviewDiagnosticLevel[] | undefined => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new TypeError("levels 必须是数组");
  const allowed = new Set<ScriptPreviewDiagnosticLevel>([
    "info",
    "warning",
    "error",
  ]);
  const levels = value.map((item) => {
    if (
      typeof item !== "string" ||
      !allowed.has(item as ScriptPreviewDiagnosticLevel)
    ) {
      throw new TypeError("levels 只能包含 info、warning 或 error");
    }
    return item as ScriptPreviewDiagnosticLevel;
  });
  return [...new Set(levels)];
};

const createTools = (
  options: RegisterScriptPreviewWebMcpOptions
): WebMcpTool[] => [
  {
    name: "xrugc_get_script_preview_status",
    title: "读取 XRUGC 脚本预览状态",
    description:
      "读取当前实体或场景脚本的页面内预览状态、运行编号、工作区版本及资源加载数量；不会启动、停止或发布预览。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(input) {
      if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
      return options.getStatus();
    },
  },
  {
    name: "xrugc_start_script_preview",
    title: "启动 XRUGC 脚本预览",
    description:
      "先校验当前可见 Blockly 工作区，再在页面可见预览区加载资源并执行当前 JavaScript 初始化流程。不会保存或发布；资源或执行超时会生成结构化诊断。",
    inputSchema: {
      type: "object",
      properties: {
        timeoutMs: {
          type: "integer",
          minimum: 1000,
          maximum: 30000,
          default: 10000,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(input) {
      if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
      return options.startPreview(parseTimeout(input.timeoutMs));
    },
  },
  {
    name: "xrugc_get_script_preview_diagnostics",
    title: "读取 XRUGC 脚本预览诊断",
    description:
      "读取最近一次页面内脚本预览产生的校验错误、问题积木 ID、缺失资源、运行异常和状态事件；不会改变预览。",
    inputSchema: {
      type: "object",
      properties: {
        levels: {
          type: "array",
          items: { type: "string", enum: ["info", "warning", "error"] },
          uniqueItems: true,
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(input) {
      if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
      const diagnostics = await options.getDiagnostics(
        parseLevels(input.levels),
        parseLimit(input.limit)
      );
      return { count: diagnostics.length, diagnostics };
    },
  },
  {
    name: "xrugc_stop_script_preview",
    title: "停止 XRUGC 脚本预览",
    description:
      "停止当前页面内脚本预览、取消仍在等待的资源加载并卸载可见预览区。不会修改或发布脚本。",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(input) {
      if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
      return options.stopPreview();
    },
  },
];

export const registerScriptPreviewWebMcpTools = (
  options: RegisterScriptPreviewWebMcpOptions
) =>
  registerWebMcpTools(createTools(options), {
    document: options.document,
    onRegistrationError: options.onRegistrationError,
  });
