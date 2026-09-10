import type { WebMcpTool } from "./model-context";
import type { NodeParentSnapshot } from "./entity-hierarchy-tools";

type JsonRecord = Record<string, unknown>;

export type NodeClonePreview = {
  entityId: number;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  parent: NodeParentSnapshot;
  sourceVersion: string;
  siblingOrderVersion: string;
  directChildCount: number;
  descendantCount: number;
  proposedName: string;
};

export type NodeCloneCompletion = {
  sourceNodeId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  clonedNodeCount: number;
  parent: NodeParentSnapshot;
};

export type EntityNodeCloneToolOptions = {
  getEntityId: () => number | null;
  stageNodeClone: (nodeId: string, name?: string) => Promise<NodeClonePreview>;
  confirmNodeClone: (preview: NodeClonePreview) => Promise<boolean>;
  completeNodeClone: (
    preview: NodeClonePreview
  ) => Promise<NodeCloneCompletion>;
};

type NodeCloneDraft = {
  preview: NodeClonePreview;
  expiresAt: number;
};

const DRAFT_TTL_MS = 5 * 60 * 1000;
const MAX_DRAFTS = 20;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseId = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} 不能为空`);
  }
  return value.trim();
};

const parseOptionalName = (value: unknown) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("name 必须是字符串");
  const name = value.trim();
  if (!name) throw new TypeError("name 不能为空");
  if (name.length > 100) throw new RangeError("name 不能超过 100 个字符");
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new TypeError("name 不能包含控制字符");
  }
  return name;
};

const generateDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `node-clone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEntityNodeCloneTools = (
  options: EntityNodeCloneToolOptions
): WebMcpTool[] => {
  const drafts = new Map<string, NodeCloneDraft>();

  const removeExpiredDrafts = () => {
    const now = Date.now();
    for (const [draftId, draft] of drafts) {
      if (draft.expiresAt <= now) drafts.delete(draftId);
    }
    while (drafts.size >= MAX_DRAFTS) {
      const oldestDraftId = drafts.keys().next().value as string | undefined;
      if (!oldestDraftId) break;
      drafts.delete(oldestDraftId);
    }
  };

  return [
    {
      name: "xrugc_stage_node_clone",
      title: "预览复制 XRUGC 节点",
      description:
        "准备复制一个节点及其全部子节点，并把复制件插入原节点之后。可提供不超过 100 字的同级唯一名称；省略时自动生成副本名称。只选中源节点并生成五分钟有效的预览，不创建或保存复制件。",
      inputSchema: {
        type: "object",
        properties: {
          nodeId: { type: "string", minLength: 1 },
          name: { type: "string", minLength: 1, maxLength: 100 },
        },
        required: ["nodeId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
        const nodeId = parseId(input.nodeId, "nodeId");
        const name = parseOptionalName(input.name);
        const preview = await options.stageNodeClone(nodeId, name);

        removeExpiredDrafts();
        const draftId = generateDraftId();
        const expiresAt = Date.now() + DRAFT_TTL_MS;
        drafts.set(draftId, { preview, expiresAt });
        return {
          status: "staged",
          draftId,
          expiresAt: new Date(expiresAt).toISOString(),
          preview,
        };
      },
    },
    {
      name: "xrugc_complete_node_clone",
      title: "确认并复制 XRUGC 节点",
      description:
        "提交 xrugc_stage_node_clone 创建的草稿。只有用户明确确认、实体未切换且源子树与同级顺序未发生变化时，才使用平台原生克隆流程创建全新节点 UUID，并保存实体。",
      inputSchema: {
        type: "object",
        properties: {
          draftId: { type: "string", minLength: 1 },
        },
        required: ["draftId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
        const draftId = parseId(input.draftId, "draftId");

        removeExpiredDrafts();
        const draft = drafts.get(draftId);
        if (!draft) {
          return {
            status: "expired_or_missing",
            draftId,
            message: "节点复制草稿不存在或已经过期，请重新预览",
          };
        }
        if (options.getEntityId() !== draft.preview.entityId) {
          drafts.delete(draftId);
          return {
            status: "entity_changed",
            draftId,
            message: "当前实体已切换，请在新实体中重新预览",
          };
        }

        const confirmed = await options.confirmNodeClone(draft.preview);
        if (!confirmed) {
          drafts.delete(draftId);
          return { status: "cancelled", draftId };
        }

        try {
          const completion = await options.completeNodeClone(draft.preview);
          drafts.delete(draftId);
          return {
            status: "completed",
            draftId,
            entityId: draft.preview.entityId,
            ...completion,
          };
        } catch (error) {
          drafts.delete(draftId);
          throw error;
        }
      },
    },
  ];
};
