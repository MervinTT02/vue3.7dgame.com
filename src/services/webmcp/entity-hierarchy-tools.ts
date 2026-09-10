import type { WebMcpTool } from "./model-context";

type JsonRecord = Record<string, unknown>;

export type NodeParentSnapshot = {
  parentNodeId: string | null;
  parentName: string;
  index: number;
};

export type NodeParentTarget = {
  parentNodeId: string | null;
  parentName: string;
};

export type NodeReparentPreview = {
  entityId: number;
  nodeId: string;
  nodeName: string;
  currentParent: NodeParentSnapshot;
  proposedParent: NodeParentTarget;
  changed: boolean;
};

export type NodeReparentCompletion = {
  nodeId: string;
  nodeName: string;
  parent: NodeParentSnapshot;
  noChange: boolean;
};

export type EntityHierarchyToolOptions = {
  getEntityId: () => number | null;
  stageNodeReparent: (
    nodeId: string,
    parentNodeId: string | null
  ) => Promise<NodeReparentPreview>;
  confirmNodeReparent: (preview: NodeReparentPreview) => Promise<boolean>;
  completeNodeReparent: (
    preview: NodeReparentPreview
  ) => Promise<NodeReparentCompletion>;
};

type NodeReparentDraft = {
  preview: NodeReparentPreview;
  expiresAt: number;
};

const DRAFT_TTL_MS = 5 * 60 * 1000;
const MAX_DRAFTS = 20;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseNodeId = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} 不能为空`);
  }
  return value.trim();
};

const parseParentNodeId = (value: unknown) => {
  if (value === null) return null;
  return parseNodeId(value, "parentNodeId");
};

const generateDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `node-reparent-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

export const createEntityHierarchyTools = (
  options: EntityHierarchyToolOptions
): WebMcpTool[] => {
  const drafts = new Map<string, NodeReparentDraft>();

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
      name: "xrugc_stage_node_reparent",
      title: "预览 XRUGC 节点层级移动",
      description:
        "准备把一个已有节点追加到另一个节点下。parentNodeId 传 null 表示移回实体根层级。只生成五分钟有效的预览并选中节点，不改变或保存层级。",
      inputSchema: {
        type: "object",
        properties: {
          nodeId: { type: "string", minLength: 1 },
          parentNodeId: {
            anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
          },
        },
        required: ["nodeId", "parentNodeId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input) {
        if (!isRecord(input)) throw new TypeError("工具参数必须是对象");
        const nodeId = parseNodeId(input.nodeId, "nodeId");
        const parentNodeId = parseParentNodeId(input.parentNodeId);
        const preview = await options.stageNodeReparent(nodeId, parentNodeId);
        if (!preview.changed) {
          return { status: "no_change", draftId: null, preview };
        }

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
      name: "xrugc_complete_node_reparent",
      title: "确认并保存 XRUGC 节点层级",
      description:
        "提交 xrugc_stage_node_reparent 创建的草稿。用户确认且节点父级与顺序未发生并发变化后，使用编辑器真实层级移动命令并保存实体。节点本地变换值保持不变。",
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
        const draftId = parseNodeId(input.draftId, "draftId");

        removeExpiredDrafts();
        const draft = drafts.get(draftId);
        if (!draft) {
          return {
            status: "expired_or_missing",
            draftId,
            message: "节点层级草稿不存在或已经过期，请重新预览",
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

        const confirmed = await options.confirmNodeReparent(draft.preview);
        if (!confirmed) {
          drafts.delete(draftId);
          return { status: "cancelled", draftId };
        }

        try {
          const completion = await options.completeNodeReparent(draft.preview);
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
