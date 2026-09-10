<template>
  <div class="script">
    <el-container>
      <el-main>
        <el-card class="box-card">
          <el-container v-if="!disabled">
            <div class="script-tabs-wrapper">
              <div v-if="verse" class="script-tabs-actions">
                <el-select
                  v-model="selectedLoadedMetaId"
                  class="script-loaded-metas-select"
                  size="small"
                  :placeholder="
                    $t('verse.view.script.loadedEntitiesPlaceholder')
                  "
                  :disabled="loadedMetaOptions.length === 0"
                  popper-class="script-loaded-metas-popper"
                  @change="handleLoadedMetaChange"
                >
                  <el-option
                    v-for="metaOption in loadedMetaOptions"
                    :key="metaOption.id"
                    :label="metaOption.name"
                    :value="metaOption.id"
                  ></el-option>
                </el-select>
                <el-button
                  type="primary"
                  size="small"
                  @click="goBackToSceneEditor"
                >
                  {{ $t("route.project.sceneEditor") }}
                </el-button>
                <el-button
                  v-if="saveable"
                  type="primary"
                  size="small"
                  @click="save"
                >
                  <font-awesome-icon
                    class="icon"
                    icon="save"
                  ></font-awesome-icon>
                  {{ $t("verse.view.script.save") }}
                </el-button>
              </div>
              <el-tabs
                v-model="activeName"
                class="script-main-tabs"
                type="card"
                style="width: 100%"
              >
                <el-tab-pane
                  :label="$t('verse.view.script.edit')"
                  name="blockly"
                >
                  <el-main class="blockly-editor-main">
                    <div
                      v-if="editorContentLoading"
                      class="script-editor-loading-indicator"
                    >
                      <el-icon class="script-editor-loading-spinner is-loading">
                        <Loading></Loading>
                      </el-icon>
                    </div>
                    <iframe
                      :key="editorFrameKey"
                      style="width: 100%; height: 100%; padding: 0; margin: 0"
                      class="blockly-editor-frame"
                      scrolling="no"
                      id="editor"
                      ref="editor"
                      :src="src"
                    ></iframe>
                  </el-main>
                </el-tab-pane>
                <el-tab-pane
                  :label="$t('verse.view.script.code')"
                  name="script"
                >
                  <el-card v-if="activeName === 'script'" class="box-card">
                    <div v-highlight>
                      <el-tabs v-model="languageName">
                        <el-tab-pane label="Lua" name="lua">
                          <template #label>
                            <span style="display: flex; align-items: center">
                              <img
                                src="/lua.png"
                                style="width: 25px; margin-right: 5px"
                                alt=""
                              />
                              <span>Lua</span>
                            </span>
                          </template>
                          <div class="code-container">
                            <el-button
                              class="copy-button"
                              text
                              @click="copyCode(LuaCode)"
                              ><el-icon class="icon">
                                <CopyDocument></CopyDocument> </el-icon
                              >{{ $t("copy.title") }}</el-button
                            >
                            <pre>
                  <code class="lua">{{ LuaCode }}</code>
                </pre>
                          </div>
                        </el-tab-pane>
                        <el-tab-pane label="JavaScript" name="javascript">
                          <template #label>
                            <span style="display: flex; align-items: center">
                              <img
                                src="/javascript.png"
                                style="width: 25px; margin-right: 5px"
                                alt=""
                              />
                              <span>JavaScript</span>
                            </span>
                          </template>
                          <div class="code-container">
                            <el-button
                              class="copy-button"
                              text
                              @click="copyCode(JavaScriptCode)"
                              ><el-icon class="icon">
                                <CopyDocument></CopyDocument> </el-icon
                              >{{ $t("copy.title") }}</el-button
                            >
                            <pre>
                  <code class="javascript">{{ JavaScriptCode }}</code>
                </pre>
                          </div>
                        </el-tab-pane>
                      </el-tabs>
                    </div>
                  </el-card>
                </el-tab-pane>
              </el-tabs>
            </div>
          </el-container>
          <div v-if="disabled" class="runArea">
            <div class="scene-fullscreen-controls">
              <el-button
                class="scene-exit-btn"
                size="small"
                type="primary"
                @click="stopScriptPreview"
              >
                {{ $t("common.back") }}
              </el-button>
              <el-button
                class="scene-fullscreen-btn"
                size="small"
                type="primary"
                plain
                @click="toggleSceneFullscreen"
              >
                <font-awesome-icon
                  :icon="['fas', isSceneFullscreen ? 'compress' : 'expand']"
                ></font-awesome-icon>
              </el-button>
            </div>
            <ScenePlayer
              v-if="verseMetasWithJsCodeData"
              ref="scenePlayer"
              :verse="verseMetasWithJsCodeData"
              :is-scene-fullscreen="isSceneFullscreen"
            >
            </ScenePlayer>
          </div>
        </el-card>
        <ScriptDraftDialog
          :model-value="versionDialogVisible"
          :versions="draftVersions"
          :auto-save-enabled="autoSaveEnabled"
          :auto-save-interval-seconds="autoSaveIntervalSeconds"
          @update:model-value="versionDialogVisible = $event"
          @update:auto-save-enabled="autoSaveEnabled = $event"
          @update:auto-save-interval-seconds="autoSaveIntervalSeconds = $event"
          @clear-history="clearDraftHistory"
          @restore="restoreDraftVersion"
        ></ScriptDraftDialog>
        <UnityPreviewDialog
          ref="unityPreviewDialog"
          v-model="unityPreviewVisible"
          :frame-visible="unityPreviewFrameVisible"
          :frame-key="unityPreviewFrameKey"
          :src="unityPreviewSrc"
          @closed="handleUnityPreviewClosed"
          @frame-load="handleUnityPreviewLoad"
        ></UnityPreviewDialog>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
// @ts-nocheck
import { logger } from "@/utils/logger";
import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  watch,
  nextTick,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getVerse,
  putVerseCode,
  type meta,
  type VerseData,
  type VerseMetasWithJsCode,
} from "@/api/v1/verse";
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from "element-plus";
import { takePhoto } from "@/api/v1/verse";
import { Message } from "@/components/Dialog";
import pako from "pako";
import ScenePlayer from "./ScenePlayer.vue";
import * as THREE from "three";
import {
  useScriptEditorBase,
  type EditorPostPayload,
  type ScriptSaveTrigger,
} from "@/composables/useScriptEditorBase";
import { buildScriptRuntime } from "@/composables/useScriptRuntime";
import { CopyDocument, Loading } from "@element-plus/icons-vue";
import ScriptDraftDialog from "@/components/ScriptDraftDialog.vue";
import {
  useEditorVersionToolbar,
  type EditorToolbarStatus,
} from "@/composables/useEditorVersionToolbar";
import { useUserStore } from "@/store/modules/user";
import { translateRouteTitle } from "@/utils/i18n";
import UnityPreviewDialog from "@/components/UnityPreviewDialog.vue";
import { useUnityPreviewBridge } from "@/composables/useUnityPreviewBridge";
import {
  normalizeUnityPreviewVerseLua,
  readUnityPreviewMetaJavaScriptCode,
} from "@/utils/unityPreviewLua";
import {
  cloneForUnityPreview,
  normalizeUnityPreviewData,
  normalizeUnityPreviewMetas,
  UNITY_PREVIEW_VERSE_EXPAND,
} from "@/utils/unityPreviewPayload";
import {
  registerVerseScriptWebMcpTools,
  type VerseScriptReplaceCompletion,
  type VerseScriptReplacePreview,
  type VerseScriptSnapshot,
} from "@/services/webmcp/verse-script-tools";
import {
  registerScriptBlockWebMcpTools,
  type ScriptBlockBatchCompletion,
  type ScriptBlockBatchPreview,
} from "@/services/webmcp/script-block-tools";
import { useScriptPreviewController } from "@/composables/useScriptPreviewController";
import { registerScriptPreviewWebMcpTools } from "@/services/webmcp/script-preview-tools";

// ---------- Verse 专有状态 ----------
const loading = ref(false);
const verse = ref<VerseData>();
const verseMetasWithJsCodeData = ref<VerseMetasWithJsCode>();
const verseMetasWithLuaCodeData = ref<VerseMetasWithJsCode>();
const route = useRoute();
const router = useRouter();
const id = computed(() => parseInt(route.query.id as string));
const metasJavaScriptCode = ref("");
// map 用于记录每个 meta_id 在场景中对应的实体列表
let map = new Map<string, Array<{ uuid: string; title: string }>>();
let webMcpLifecycle: AbortController | null = null;
let scriptBlockWebMcpLifecycle: AbortController | null = null;
let scriptPreviewWebMcpLifecycle: AbortController | null = null;
const pendingWebMcpRequests = new Map<
  string,
  {
    resolve: (payload: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: number;
  }
>();

const { t } = useI18n();
const userStore = useUserStore();

const sceneEditorLink = computed(() => {
  const editorLabel = t("route.project.sceneEditor");
  const titleText = verse.value?.name
    ? `${editorLabel}【${verse.value.name}】`
    : editorLabel;
  return `/verse/scene?id=${id.value}&title=${encodeURIComponent(titleText)}`;
});

type LoadedMetaOption = {
  id: number;
  name: string;
};

const selectedLoadedMetaId = ref<number | null>(null);
const loadedMetaOptions = computed<LoadedMetaOption[]>(() => {
  const metas = Array.isArray(verse.value?.metas) ? verse.value!.metas : [];
  if (metas.length === 0) return [];

  const options: LoadedMetaOption[] = [];
  const seen = new Set<number>();

  metas.forEach((meta) => {
    const metaId = Number(meta?.id);
    if (!Number.isFinite(metaId) || seen.has(metaId)) return;
    seen.add(metaId);
    options.push({
      id: metaId,
      name:
        (meta.title && String(meta.title).trim()) ||
        (meta.name && String(meta.name).trim()) ||
        `${t("verse.listPage.entityFallback")}${metaId}`,
    });
  });

  return options;
});

const goBackToSceneEditor = async () => {
  const canLeave = await resolveUnsavedChangesBeforeLeave({
    showDiscardInfo: false,
  });
  if (!canLeave) return;
  router.push(sceneEditorLink.value);
};

const goToLoadedMetaEditor = async (metaId: number, metaName?: string) => {
  const canLeave = await resolveUnsavedChangesBeforeLeave({
    showDiscardInfo: false,
  });
  if (!canLeave) return;

  const sceneRoute = router
    .getRoutes()
    .find((route) => route.path === "/meta/scene");
  const sceneEditorTitle =
    sceneRoute && typeof sceneRoute.meta?.title === "string"
      ? translateRouteTitle(sceneRoute.meta.title)
      : t("route.meta.sceneEditor");
  const fallbackName = `${t("verse.listPage.entityFallback")}${metaId}`;
  const title = encodeURIComponent(
    `${sceneEditorTitle}【${metaName || fallbackName}】`
  );

  router.push({
    path: "/meta/scene",
    query: { id: metaId, title },
  });
};

const handleLoadedMetaChange = async (metaId: number) => {
  const selected = loadedMetaOptions.value.find(
    (metaOption) => metaOption.id === metaId
  );
  await goToLoadedMetaEditor(metaId, selected?.name);
};

const saveable = computed(() => Boolean(verse.value?.editable));

type ScenePlayerInstance = InstanceType<typeof ScenePlayer>;
const scenePlayer = ref<ScenePlayerInstance>();

// ---------- Verse 专有类型 ----------
type VerseEntityNode = {
  parameters?: { uuid?: string; title?: string; meta_id?: string | number };
  children?: {
    modules?: VerseEntityNode[];
    entities?: VerseEntityNode[];
  };
};

type VerseMetaEventItem = { title: string; uuid: string };
type VerseMeta = {
  id: number | string;
  name?: string;
  title?: string;
  events?: {
    inputs?: VerseMetaEventItem[];
    outputs?: VerseMetaEventItem[];
  };
};

// ---------- initEditor（Verse 版）----------
const initEditor = (overrideData?: unknown) => {
  if (!verse.value) return;
  if (!isReady()) return;

  try {
    let blocklyData = verse.value.verseCode?.blockly || "{}";
    blocklyData = decompressBlockly(blocklyData);
    const data =
      overrideData ?? unsavedBlocklyData.value ?? JSON.parse(blocklyData);
    postMessage("INIT", {
      token: null,
      config: {
        style: ["base", "verse"],
        parameters: {
          index: verse.value!.id,
          resource: resource.value,
        },
        data,
        userInfo: {
          id: userStore.userInfo?.id || null,
          role: userStore.getRole(),
        },
      },
    });
  } catch (error) {
    logger.error("Fail to decompress or parse data:", error);
  }
};

// ---------- postScript（Verse 版：保存 + 发布流程）----------
const postScript = async (
  message: EditorPostPayload,
  context: { trigger: ScriptSaveTrigger }
) => {
  if (verse.value === null) {
    ElMessage.error(t("verse.view.script.error1"));
    return;
  }
  if (!verse.value!.editable) {
    ElMessage.error(t("verse.view.script.error2"));
    return;
  }

  let blocklyData = JSON.stringify(message.data);
  if (blocklyData.length > 1024 * 2) {
    const uint8Array = pako.deflate(blocklyData);
    const base64Str = btoa(String.fromCharCode.apply(null, uint8Array));
    blocklyData = `compressed:${base64Str}`;
  }

  await putVerseCode(verse.value!.id, {
    blockly: blocklyData,
    js: message.js,
    lua: message.lua,
  });

  if (context.trigger === "manual") {
    Message.success(t("verse.view.script.success"));
    ElMessageBox.confirm(
      t("verse.view.sceneEditor.saveAndPublishConfirm"),
      t("verse.view.sceneEditor.publishScene"),
      {
        showClose: true,
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        confirmButtonText: t("verse.view.sceneEditor.confirm"),
        cancelButtonText: t("verse.view.sceneEditor.cancel"),
        type: "warning",
      }
    )
      .then(async () => {
        await takePhoto(id.value);
        ElMessage.success(t("verse.view.sceneEditor.publishSuccess"));
      })
      .catch(() => {
        ElMessage.info(t("verse.view.sceneEditor.publishCanceled"));
      });
  }
};

const draftStorageKey = computed(() =>
  Number.isFinite(id.value) ? `script-draft:verse:${id.value}` : null
);

// ---------- 共享编辑器 composable ----------
const {
  activeName,
  languageName,
  LuaCode,
  JavaScriptCode,
  disabled,
  isSceneFullscreen,
  isFullscreen,
  unsavedBlocklyData,
  resolveUnsavedChangesBeforeLeave,
  hasUnsavedChanges,
  draftVersions,
  versionDialogVisible,
  autoSaveEnabled,
  autoSaveIntervalSeconds,
  isSaving,
  lastSaveTrigger,
  lastSavedAt,
  editorFrameKey,
  editor,
  src,
  editorContentReady,
  toggleSceneFullscreen,
  postMessage,
  save,
  openVersionDialog,
  clearDraftHistory,
  restoreDraftVersion,
  reloadEditorFrame,
  decompressBlockly,
  isReady,
  copyCode,
} = useScriptEditorBase({
  luaLocalVar: "verse",
  i18nKeys: {
    error1: "verse.view.script.error1",
    error3: "verse.view.script.error3",
    info: "verse.view.script.info",
    leaveMessage1: "verse.view.script.leave.message1",
    leaveMessage2: "verse.view.script.leave.message2",
    leaveConfirm: "verse.view.script.leave.confirm",
    leaveCancel: "verse.view.script.leave.cancel",
    leaveError: "verse.view.script.leave.error",
    leaveInfo: "verse.view.script.leave.info",
  },
  onPost: postScript,
  onReady: initEditor,
  getDraftStorageKey: () => draftStorageKey.value,
  canSave: () => Boolean(verse.value?.editable),
  onRestoreDraft: () => reloadEditorFrame(),
});

const toolbarOwner = "verse-script-editor";
const { registerToolbar, updateToolbarStatus, unregisterToolbar } =
  useEditorVersionToolbar();
const toolbarStatus = computed<EditorToolbarStatus>(() => {
  if (isSaving.value) return "saving";
  if (hasUnsavedChanges.value) return "dirty";
  if (lastSaveTrigger.value === "auto" && lastSavedAt.value) {
    return "autosaved";
  }
  return "saved";
});
const editorContentLoading = computed(
  () => loading.value || !editorContentReady.value
);

const requireSuccessfulWebMcpResponse = (response: Record<string, unknown>) => {
  if (response.ok !== true) {
    throw new Error(
      typeof response.error === "string"
        ? response.error
        : "Blockly 编辑器操作失败"
    );
  }
  return response;
};

const requestBlocklyEditor = (
  action: string,
  data: Record<string, unknown> = {},
  timeoutMs = 15000
) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const requestId = postMessage("REQUEST", { action, ...data });
    if (!requestId) {
      reject(new Error("Blockly 编辑器尚未准备完成"));
      return;
    }
    const timer = window.setTimeout(() => {
      pendingWebMcpRequests.delete(requestId);
      reject(new Error(`Blockly 编辑器请求超时：${action}`));
    }, timeoutMs);
    pendingWebMcpRequests.set(requestId, { resolve, reject, timer });
  });

const handleWebMcpEditorMessage = (event: MessageEvent) => {
  if (event.source !== editor.value?.contentWindow) return;
  const message = event.data;
  if (message?.type !== "RESPONSE" || typeof message.requestId !== "string") {
    return;
  }
  const pending = pendingWebMcpRequests.get(message.requestId);
  if (!pending) return;
  window.clearTimeout(pending.timer);
  pendingWebMcpRequests.delete(message.requestId);
  pending.resolve((message.payload ?? {}) as Record<string, unknown>);
};

const formatVerseScriptReplaceConfirmation = (
  preview: VerseScriptReplacePreview
) =>
  [
    `确认替换场景“${preview.sceneTitle}”的 Blockly 脚本吗？`,
    `块数量：${preview.current.blockCount} → ${preview.proposed.blockCount}`,
    `顶层流程：${preview.current.topLevelBlockCount} → ${preview.proposed.topLevelBlockCount}`,
    `变量数量：${preview.current.variableCount} → ${preview.proposed.variableCount}`,
    `JavaScript：${preview.current.generatedJavaScriptBytes} → ${preview.proposed.generatedJavaScriptBytes} 字节`,
    `Lua：${preview.current.generatedLuaBytes} → ${preview.proposed.generatedLuaBytes} 字节`,
    "候选工作区已经过 Blockly 反序列化、块规则和双语言代码生成校验",
    "确认后将更新可见工作区并保存脚本；平台仍会单独询问是否发布场景",
  ].join("\n");

const registerVerseScriptTools = () => {
  webMcpLifecycle?.abort();
  webMcpLifecycle = registerVerseScriptWebMcpTools({
    getContext: () => ({
      sceneId: Number.isFinite(id.value) ? id.value : null,
      sceneTitle: verse.value?.name ?? "未命名场景",
      editable: Boolean(verse.value?.editable),
      ready: editorContentReady.value,
      dirty: hasUnsavedChanges.value,
      saving: isSaving.value,
    }),
    getVerseScript: async ({ includeWorkspace, includeGeneratedCode }) => {
      if (!verse.value || !Number.isFinite(verse.value.id)) {
        throw new Error("场景脚本尚未加载完成");
      }
      const response = requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor("webmcp-get-scene-script", {
          includeWorkspace,
          includeGeneratedCode,
        })
      );
      return {
        sceneId: verse.value.id,
        sceneTitle: verse.value.name,
        workspaceVersion: String(response.workspaceVersion),
        summary: response.summary,
        valid: Boolean(response.valid),
        issue: response.issue,
        workspace: response.workspace,
        generatedCode: response.generatedCode,
      } as VerseScriptSnapshot;
    },
    validateVerseScript: async (focusIssue) => {
      if (!verse.value || !Number.isFinite(verse.value.id)) {
        throw new Error("场景脚本尚未加载完成");
      }
      const response = requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor("webmcp-validate-scene-script", {
          focusIssue,
        })
      );
      return {
        sceneId: verse.value.id,
        sceneTitle: verse.value.name,
        workspaceVersion: String(response.workspaceVersion),
        summary: response.summary,
        valid: Boolean(response.valid),
        issue: response.issue,
      } as VerseScriptSnapshot;
    },
    stageVerseScriptReplace: async (workspace) => {
      if (!verse.value || !Number.isFinite(verse.value.id)) {
        throw new Error("场景脚本尚未加载完成");
      }
      if (!verse.value.editable) {
        throw new Error("当前账号没有修改此场景脚本的权限");
      }
      if (!editorContentReady.value) {
        throw new Error("Blockly 工作区尚未准备完成");
      }
      if (isSaving.value) throw new Error("脚本正在保存，请稍后重试");
      if (hasUnsavedChanges.value) {
        throw new Error("当前脚本存在未保存修改，请先保存后再创建替换预览");
      }

      const response = requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor(
          "webmcp-stage-scene-script-replace",
          { workspace },
          30000
        )
      );
      return {
        sceneId: verse.value.id,
        sceneTitle: verse.value.name,
        workspaceVersion: String(response.workspaceVersion),
        current: response.current,
        proposed: response.proposed,
        proposedWorkspace: response.proposedWorkspace,
        changed: Boolean(response.changed),
      } as VerseScriptReplacePreview;
    },
    confirmVerseScriptReplace: async (preview) => {
      try {
        await ElMessageBox.confirm(
          formatVerseScriptReplaceConfirmation(preview),
          "WebMCP Blockly 场景脚本替换",
          {
            confirmButtonText: t("verse.view.script.save"),
            cancelButtonText: t("verse.view.script.leave.cancel"),
            distinguishCancelAndClose: true,
            closeOnClickModal: false,
            closeOnPressEscape: true,
            showCancelButton: true,
            customClass: "script-save-confirm-box",
          }
        );
        return true;
      } catch {
        return false;
      }
    },
    completeVerseScriptReplace: async (preview) => {
      if (!verse.value || verse.value.id !== preview.sceneId) {
        throw new Error("当前场景已经切换，请重新创建脚本预览");
      }
      if (!verse.value.editable) {
        throw new Error("当前账号没有修改此场景脚本的权限");
      }
      if (isSaving.value) throw new Error("脚本正在保存，请稍后重试");

      const response = requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor(
          "webmcp-complete-scene-script-replace",
          {
            workspaceVersion: preview.workspaceVersion,
            workspace: preview.proposedWorkspace,
          },
          30000
        )
      );
      if (!response.noChange) {
        await save("manual", { suppressNoChangeInfo: true });
      }
      return {
        noChange: Boolean(response.noChange),
        sceneId: verse.value.id,
        workspaceVersion: String(response.workspaceVersion),
        summary: response.summary,
      } as VerseScriptReplaceCompletion;
    },
    onRegistrationError: (toolName, error) => {
      logger.warn(`WebMCP tool registration failed: ${toolName}`, error);
    },
  });
};

const formatScriptBlockBatchConfirmation = (preview: ScriptBlockBatchPreview) =>
  [
    `确认修改场景“${preview.ownerTitle}”的 Blockly 积木吗？`,
    `批量操作：${preview.operationCount} 项`,
    `块数量：${preview.current.blockCount} → ${preview.proposed.blockCount}`,
    `顶层流程：${preview.current.topLevelBlockCount} → ${preview.proposed.topLevelBlockCount}`,
    `JavaScript：${preview.current.generatedJavaScriptBytes} → ${preview.proposed.generatedJavaScriptBytes} 字节`,
    `Lua：${preview.current.generatedLuaBytes} → ${preview.proposed.generatedLuaBytes} 字节`,
    "全部操作已在临时 Blockly 工作区执行并通过真实代码生成校验",
    "确认后将更新可见工作区并保存脚本；平台仍会单独询问是否发布场景",
  ].join("\n");

const registerScriptBlockTools = () => {
  scriptBlockWebMcpLifecycle?.abort();
  scriptBlockWebMcpLifecycle = registerScriptBlockWebMcpTools({
    getContext: () => ({
      ownerKind: "scene",
      ownerId: Number.isFinite(id.value) ? id.value : null,
      ownerTitle: verse.value?.name ?? "未命名场景",
      editable: Boolean(verse.value?.editable),
      ready: editorContentReady.value,
      dirty: hasUnsavedChanges.value,
      saving: isSaving.value,
    }),
    getBlockCatalog: async (filters) =>
      requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor("webmcp-get-script-block-catalog", filters)
      ),
    getBlockStructure: async (filters) =>
      requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor("webmcp-get-script-block-structure", filters)
      ),
    stageBlockBatch: async (operations) => {
      if (!verse.value || !Number.isFinite(verse.value.id)) {
        throw new Error("场景脚本尚未加载完成");
      }
      if (!verse.value.editable) {
        throw new Error("当前账号没有修改此场景脚本的权限");
      }
      if (!editorContentReady.value) {
        throw new Error("Blockly 工作区尚未准备完成");
      }
      if (isSaving.value) throw new Error("脚本正在保存，请稍后重试");
      if (hasUnsavedChanges.value) {
        throw new Error("当前脚本存在未保存修改，请先保存后再创建积木预览");
      }
      const response = requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor(
          "webmcp-stage-script-block-batch",
          { operations },
          30000
        )
      );
      return {
        ownerKind: "scene",
        ownerId: verse.value.id,
        ownerTitle: verse.value.name,
        workspaceVersion: String(response.workspaceVersion),
        current: response.current,
        proposed: response.proposed,
        proposedWorkspace: response.proposedWorkspace,
        changed: Boolean(response.changed),
        operationCount: Number(response.operationCount),
        results: response.results,
      } as ScriptBlockBatchPreview;
    },
    confirmBlockBatch: async (preview) => {
      try {
        await ElMessageBox.confirm(
          formatScriptBlockBatchConfirmation(preview),
          "WebMCP Blockly 积木批量修改",
          {
            confirmButtonText: t("verse.view.script.save"),
            cancelButtonText: t("verse.view.script.leave.cancel"),
            distinguishCancelAndClose: true,
            closeOnClickModal: false,
            closeOnPressEscape: true,
            showCancelButton: true,
            customClass: "script-save-confirm-box",
          }
        );
        return true;
      } catch {
        return false;
      }
    },
    completeBlockBatch: async (preview) => {
      if (!verse.value || verse.value.id !== preview.ownerId) {
        throw new Error("当前场景已经切换，请重新创建积木预览");
      }
      if (!verse.value.editable) {
        throw new Error("当前账号没有修改此场景脚本的权限");
      }
      if (isSaving.value) throw new Error("脚本正在保存，请稍后重试");
      const response = requireSuccessfulWebMcpResponse(
        await requestBlocklyEditor(
          "webmcp-complete-script-block-batch",
          {
            workspaceVersion: preview.workspaceVersion,
            workspace: preview.proposedWorkspace,
          },
          30000
        )
      );
      if (!response.noChange) {
        await save("manual", { suppressNoChangeInfo: true });
      }
      return {
        noChange: Boolean(response.noChange),
        ownerKind: "scene",
        ownerId: verse.value.id,
        workspaceVersion: String(response.workspaceVersion),
        summary: response.summary,
      } as ScriptBlockBatchCompletion;
    },
    onRegistrationError: (toolName, error) => {
      logger.warn(`WebMCP tool registration failed: ${toolName}`, error);
    },
  });
};

onMounted(() => {
  registerToolbar(toolbarOwner, {
    status: toolbarStatus.value,
    onOpen: openVersionDialog,
  });
  window.addEventListener("message", handleWebMcpEditorMessage);
  registerVerseScriptTools();
  registerScriptBlockTools();
});

watch(toolbarStatus, (status) => {
  updateToolbarStatus(toolbarOwner, status);
});

onBeforeUnmount(() => {
  webMcpLifecycle?.abort();
  webMcpLifecycle = null;
  scriptBlockWebMcpLifecycle?.abort();
  scriptBlockWebMcpLifecycle = null;
  window.removeEventListener("message", handleWebMcpEditorMessage);
  for (const pending of pendingWebMcpRequests.values()) {
    window.clearTimeout(pending.timer);
    pending.reject(new Error("场景脚本页面已经关闭"));
  }
  pendingWebMcpRequests.clear();
  unregisterToolbar(toolbarOwner);
});

// ---------- resource computed（Verse 专有：构建事件 inputs/outputs）----------
const resource = computed(() => {
  const inputs: Array<{ title: string; index: string; uuid: string }> = [];
  const outputs: Array<{ title: string; index: string; uuid: string }> = [];
  const metas = (verse.value?.metas || []) as VerseMeta[];
  metas.forEach((meta) => {
    const events = meta.events || {};
    const inputsList = events.inputs || [];
    const outputsList = events.outputs || [];
    const instances: Array<{ uuid: string; title: string }> =
      map.get(meta.id.toString()) || [];
    const effectiveInstances = instances.length
      ? instances
      : [
          {
            uuid: meta.id?.toString() || "",
            title: meta.name || meta.title || "meta",
          },
        ];
    effectiveInstances.forEach((instance) => {
      outputsList.forEach((input) => {
        inputs.push({
          title: `${instance.title}:${input.title}`,
          index: instance.uuid,
          uuid: input.uuid,
        });
      });
      inputsList.forEach((output) => {
        outputs.push({
          title: `${instance.title}:${output.title}`,
          index: instance.uuid,
          uuid: output.uuid,
        });
      });
    });
  });
  return { events: { inputs, outputs } };
});

// ---------- Verse 专有：handlePolygen（只返回 playAnimation）----------
const handlePolygen = (uuid: string) => {
  if (!scenePlayer.value) {
    logger.error("ScenePlayer未初始化");
    return null;
  }
  const modelUuid = uuid.toString();
  const getModel = (uuid: string, retries = 3) => {
    const source = scenePlayer.value?.sources.get(uuid) as
      | { type: string; data: unknown }
      | undefined;
    if (source && source.type === "model") {
      return source.data as THREE.Object3D;
    }
    if (retries > 0) {
      logger.log(`模型未找到，剩余重试次数: ${retries}`);
      setTimeout(() => getModel(uuid, retries - 1), 100);
    }
    return null;
  };
  const model = getModel(modelUuid);
  logger.log("查找模型:", {
    requestedUuid: modelUuid,
    availableModels: Array.from(scenePlayer.value.sources.keys()),
    modelExists: scenePlayer.value.sources.has(modelUuid),
    foundModel: model,
  });
  if (!model) {
    logger.error(`找不到UUID为 ${modelUuid} 的模型`);
    return null;
  }
  return {
    playAnimation: (animationName: string, options?: { loop?: boolean }) => {
      logger.log("播放动画:", { uuid: modelUuid, animationName, model });
      return scenePlayer.value?.playAnimation(modelUuid, animationName, options);
    },
  };
};

const ensureUnityPreviewRuntimeData = async () => {
  if (verseMetasWithLuaCodeData.value) return;
  if (!Number.isFinite(id.value)) return;

  const response = await getVerse(id.value, UNITY_PREVIEW_VERSE_EXPAND, "lua");
  verseMetasWithLuaCodeData.value =
    response.data as unknown as VerseMetasWithJsCode;
};

const buildUnityPreviewPayload = () => {
  const runtimeData =
    verseMetasWithLuaCodeData.value ?? verseMetasWithJsCodeData.value;

  return {
    protocolVersion: 1,
    source: "xrugc-web-script-page",
    sceneType: "verse",
    scene: {
      id: verse.value?.id ?? id.value,
      uuid: verse.value?.uuid ?? null,
      name: verse.value?.name ?? "",
      description: verse.value?.description ?? "",
      data: normalizeUnityPreviewData(
        runtimeData?.data ?? verse.value?.data ?? null
      ),
    },
    resources: cloneForUnityPreview(runtimeData?.resources ?? []),
    metas: normalizeUnityPreviewMetas(runtimeData?.metas ?? []),
    script: {
      blockly: cloneForUnityPreview(unsavedBlocklyData.value),
      lua: normalizeUnityPreviewVerseLua(LuaCode.value),
      javascript: JavaScriptCode.value,
      metasJavaScript: metasJavaScriptCode.value,
    },
  };
};

const unityPreview = useUnityPreviewBridge({
  ensureRuntimeData: ensureUnityPreviewRuntimeData,
  buildPayload: buildUnityPreviewPayload,
  canOpen: () => (verse.value ? true : "场景数据尚未加载完成"),
  notifyError: (message) => ElMessage.error(message),
});
const unityPreviewDialog = unityPreview.dialogRef;
const unityPreviewVisible = unityPreview.visible;
const unityPreviewFrameVisible = unityPreview.frameVisible;
const unityPreviewFrameKey = unityPreview.frameKey;
const unityPreviewSrc = unityPreview.src;
const handleUnityPreviewLoad = unityPreview.handleLoad;
const handleUnityPreviewClosed = unityPreview.handleClosed;

// ---------- Verse 专有：run ----------
type PreviewVerseEntityNode = VerseEntityNode & {
  parameters?: VerseEntityNode["parameters"] & { uuid?: string | number };
};

const getVersePreviewResourceState = () => {
  const expectedIds: string[] = [];
  let expectedCount = 0;
  const visit = (entities: PreviewVerseEntityNode[]) => {
    for (const entity of entities) {
      expectedCount += 1;
      if (entity.parameters?.uuid != null) {
        expectedIds.push(String(entity.parameters.uuid));
      }
      visit((entity.children?.entities ?? []) as PreviewVerseEntityNode[]);
    }
  };
  for (const metaItem of verseMetasWithJsCodeData.value?.metas ?? []) {
    const data = metaItem.data as {
      children?: { entities?: PreviewVerseEntityNode[] };
    };
    visit(data?.children?.entities ?? []);
  }
  return {
    expectedCount,
    expectedIds,
    loadedIds: Array.from(scenePlayer.value?.sources?.keys() ?? []).map(String),
  };
};

const executeVerseScriptPreview = async (signal: AbortSignal) => {
  if (!JavaScriptCode.value.trim() && !metasJavaScriptCode.value.trim()) {
    return {
      diagnostics: [
        {
          level: "warning",
          code: "EMPTY_SCRIPT",
          message: "当前场景没有生成可执行的 JavaScript",
        },
      ],
    };
  }
  if (signal.aborted) throw signal.reason;
  window.meta = {};
  window.verse = {};
  const {
    Vector3,
    polygen,
    sound,
    helper,
    handleText,
    handleEntity,
    tween,
    task,
    animation,
    text,
    point,
    transform,
    argument,
  } = buildScriptRuntime(scenePlayer, {
    signal: (moduleUuid: string, eventUuid: string, parameter?: unknown) => {
      logger.log("触发事件:", moduleUuid, eventUuid, parameter);
    },
  });

  const event = {
    trigger: (index: unknown, eventId: string) => {
      logger.log("触发事件:", index, eventId);
    },
    signal: (moduleUuid: string, eventUuid: string, parameter?: unknown) => {
      logger.log("触发事件:", moduleUuid, eventUuid, parameter);
    },
  };
  const handleSound = buildScriptRuntime(scenePlayer).handleSound;
  const wrappedCode = `
            return async function(handlePolygen, polygen, handleSound, sound, THREE, task, tween, helper, animation, event, text, point, transform, Vector3, argument, handleText, handleEntity) {
              const meta = window.meta;
              const verse = window.verse;
              const index = ${verse.value?.id};

              ${metasJavaScriptCode.value}
              ${JavaScriptCode.value}

              if (typeof meta['@init'] === 'function') {
                await meta['@init']();
              }
              if (typeof verse['#init'] === 'function') {
                await verse['#init']();
              }
            }`;
  const wrappedFunction = new Function(wrappedCode);
  const executableFunction = wrappedFunction();
  await executableFunction(
    handlePolygen,
    polygen,
    handleSound,
    sound,
    THREE,
    task,
    tween,
    helper,
    animation,
    event,
    text,
    point,
    transform,
    Vector3,
    argument,
    handleText,
    handleEntity
  );
  if (signal.aborted) throw signal.reason;
};

let restorePreviewFullscreen = false;
const scriptPreviewController = useScriptPreviewController({
  validate: async () => {
    const response = requireSuccessfulWebMcpResponse(
      await requestBlocklyEditor("webmcp-validate-scene-script", {
        focusIssue: false,
      })
    );
    return {
      valid: Boolean(response.valid),
      workspaceVersion: String(response.workspaceVersion),
      issue: response.issue,
    };
  },
  show: async () => {
    restorePreviewFullscreen = isFullscreen.value;
    if (restorePreviewFullscreen && document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
    disabled.value = true;
    await nextTick();
    if (restorePreviewFullscreen) {
      const runArea = document.querySelector(".runArea");
      await runArea?.requestFullscreen?.();
      isSceneFullscreen.value = Boolean(document.fullscreenElement);
    }
  },
  hide: async () => {
    if (isSceneFullscreen.value && document.fullscreenElement) {
      await document.exitFullscreen?.();
    }
    restorePreviewFullscreen = false;
    isSceneFullscreen.value = false;
    disabled.value = false;
    window.meta = {};
    window.verse = {};
    await nextTick();
  },
  getResources: getVersePreviewResourceState,
  execute: executeVerseScriptPreview,
  onError: (message) => ElMessage.error(`执行代码出错: ${message}`),
});

const getVersePreviewStatus = () => ({
  ...scriptPreviewController.snapshot(),
  ownerKind: "scene" as const,
  ownerId: verse.value?.id ?? null,
  ownerTitle: verse.value?.name ?? "未命名场景",
  visible: disabled.value,
});

const stopScriptPreview = async () => {
  await scriptPreviewController.stop("user");
  return getVersePreviewStatus();
};

const _run = async () => {
  await scriptPreviewController.start(10000);
};

const registerScriptPreviewTools = () => {
  scriptPreviewWebMcpLifecycle?.abort();
  scriptPreviewWebMcpLifecycle = registerScriptPreviewWebMcpTools({
    getStatus: getVersePreviewStatus,
    startPreview: async (timeoutMs) => {
      if (!verse.value || !editorContentReady.value) {
        throw new Error("场景脚本尚未加载完成");
      }
      await scriptPreviewController.start(timeoutMs);
      return getVersePreviewStatus();
    },
    getDiagnostics: (levels, limit) =>
      scriptPreviewController.getDiagnostics(levels, limit),
    stopPreview: stopScriptPreview,
    onRegistrationError: (toolName, error) => {
      logger.warn(`WebMCP tool registration failed: ${toolName}`, error);
    },
  });
};

onMounted(registerScriptPreviewTools);

onBeforeUnmount(() => {
  scriptPreviewWebMcpLifecycle?.abort();
  scriptPreviewWebMcpLifecycle = null;
  void scriptPreviewController.stop("page_unmount");
});

// ---------- onMounted（Verse 专有：加载 verse 数据）----------
onMounted(async () => {
  try {
    loading.value = true;
    const response = await getVerse(
      id.value,
      "metas, module, share, verseCode"
    );
    const [responseLua, responseJs] = await Promise.all([
      getVerse(id.value, UNITY_PREVIEW_VERSE_EXPAND, "lua"),
      getVerse(id.value, UNITY_PREVIEW_VERSE_EXPAND, "js"),
    ]);
    verse.value = response.data;
    logger.error(verse.value);
    verseMetasWithLuaCodeData.value =
      responseLua.data as unknown as VerseMetasWithJsCode;
    verseMetasWithJsCodeData.value =
      responseJs.data as unknown as VerseMetasWithJsCode;
    metasJavaScriptCode.value = verseMetasWithJsCodeData.value.metas
      .map((meta: meta) => readUnityPreviewMetaJavaScriptCode(meta))
      .join("\n");
    logger.log("Verse", verse.value);
    logger.log("metasJavaScriptCode", metasJavaScriptCode.value);
    if (verse.value && verse.value.data) {
      const data = verse.value.data;
      (data as VerseEntityNode).children?.modules?.forEach((module) => {
        if (!module.parameters?.meta_id || !module.parameters?.uuid) return;
        const key = module.parameters.meta_id.toString();
        const entry = {
          uuid: module.parameters.uuid,
          title: module.parameters.title || "",
        };
        const arr = map.get(key) || [];
        arr.push(entry);
        map.set(key, arr);
      });
    }
    initEditor();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.icon {
  margin-right: 5px;
}

.code-container {
  position: relative;
}

.copy-button {
  position: absolute;
  top: 20px;
  right: 0;
  z-index: 1;
}

.dark-theme .hljs {
  background-color: rgb(24 24 24) !important;
}

.light-theme .hljs {
  background-color: #fafafa !important;
}

.script-tabs-wrapper {
  position: relative;
  flex: 1;
  width: 100%;
  min-width: 0;
}

.script-tabs-actions {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 10;
  display: flex;
  gap: 8px;
  align-items: center;
}

.script-loaded-metas-select {
  width: 180px;
}

.script-loaded-metas-select :deep(.el-select__wrapper) {
  align-items: center;
  min-height: 32px;
}

.script-loaded-metas-select :deep(.el-select__placeholder),
.script-loaded-metas-select :deep(.el-select__selected-item) {
  line-height: 20px;
  text-align: center;
}

:global(.script-loaded-metas-popper.el-select__popper) {
  padding: 0 !important;
}

:global(.script-loaded-metas-popper .el-select-dropdown__item) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 34px;
  text-align: left;
}

:global(.script-loaded-metas-popper) {
  --script-select-hover-bg: rgb(3 169 244 / 18%);
  --script-select-hover-ring: rgb(3 169 244 / 24%);
  --bg-hover: var(--script-select-hover-bg);
  --el-fill-color-light: var(--script-select-hover-bg);
}

:global(
  .script-loaded-metas-popper .el-select-dropdown__item.hover,
  .script-loaded-metas-popper .el-select-dropdown__item:hover,
  .script-loaded-metas-popper .el-select-dropdown__item.is-hovering,
  .script-loaded-metas-popper.el-select-dropdown
    .el-select-dropdown__item.hover,
  .script-loaded-metas-popper.el-select-dropdown
    .el-select-dropdown__item:hover,
  .script-loaded-metas-popper.el-select-dropdown
    .el-select-dropdown__item.is-hovering,
  .script-loaded-metas-popper.el-select__popper .el-select-dropdown__item.hover,
  .script-loaded-metas-popper.el-select__popper .el-select-dropdown__item:hover,
  .script-loaded-metas-popper.el-select__popper
    .el-select-dropdown__item.is-hovering
) {
  color: var(--primary-color, #03a9f4) !important;
  background-color: var(--script-select-hover-bg) !important;
  background-image: none !important;
  box-shadow: inset 0 0 0 1px var(--script-select-hover-ring) !important;
}

:global(
  .script-loaded-metas-popper.el-select__popper
    .el-select-dropdown__item.selected:not(.hover, .is-hovering, :hover),
  .script-loaded-metas-popper.el-select__popper
    .el-select-dropdown__item.is-selected:not(.hover, .is-hovering, :hover)
) {
  font-weight: 500 !important;
  color: var(--primary-color, #03a9f4) !important;
  background: transparent !important;
}

.script-tabs-wrapper :deep(.el-tabs__header) {
  position: relative;
  top: -8px;
  padding-right: 460px;
  margin: 0 !important;
  overflow: visible !important;
  border-bottom: none !important;
}

.script-tabs-wrapper :deep(.el-tabs__nav-wrap),
.script-tabs-wrapper :deep(.el-tabs__nav-scroll),
.script-tabs-wrapper :deep(.el-tabs__nav) {
  overflow: visible !important;
}

.script-tabs-wrapper :deep(.el-tabs--card > .el-tabs__header .el-tabs__nav) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.script-tabs-wrapper :deep(.el-tabs--card > .el-tabs__header .el-tabs__item) {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px !important;
  min-height: 0 !important;
  padding: 0 12px !important;
  font-size: 12px;
  line-height: 1.1;
  color: var(--text-secondary, #64748b);
  white-space: nowrap;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #d6deea) !important;
  border-radius: 8px;
  outline: none !important;
  box-shadow: none !important;
}

.script-tabs-wrapper
  :deep(.el-tabs--card > .el-tabs__header .el-tabs__item + .el-tabs__item) {
  margin-left: 8px;
}

.script-tabs-wrapper
  :deep(.el-tabs--card > .el-tabs__header .el-tabs__item.is-active) {
  color: var(--primary-color, #06a7ee);
  background: var(--bg-card, #fff);
  border: 1px solid var(--primary-color, #06a7ee) !important;
  outline: none !important;
  box-shadow: none !important;
}

.script-tabs-wrapper :deep(.el-tabs__nav-wrap::after) {
  display: none !important;
  height: 0 !important;
  content: none !important;
}

.script-tabs-wrapper :deep(.el-tabs__content) {
  padding-top: 0;
  margin-top: 0;
}

.blockly-editor-main {
  position: relative;
  height: calc(100vh - 185px);
  min-height: 520px;
  padding: 0;
  margin: 0;
  margin-top: 0;
  overflow: hidden;
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #d6deea);
  border-radius: 12px;
}

.blockly-editor-frame {
  display: block;
  background: var(--bg-card, #fff);
  border: 0;
  border-radius: inherit;
}

.script-editor-loading-indicator {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.script-editor-loading-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 22px;
  color: var(--primary-color, #06a7ee);
}

@media (width <= 768px) {
  .script-tabs-actions {
    position: static;
    justify-content: flex-end;
    margin-bottom: 8px;
  }

  .script-tabs-wrapper :deep(.el-tabs__header) {
    padding-right: 0;
  }

  .script-loaded-metas-select {
    width: 100%;
  }
}

.dark-theme :deep(.hljs) {
  background-color: rgb(24 24 24) !important;
}

.light-theme :deep(.hljs) {
  background-color: #fafafa !important;
}

.runArea {
  position: relative;
  width: 100%;
  height: 100%;
}

.scene-fullscreen-controls {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 100;
}

.scene-fullscreen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.scene-fullscreen-btn :deep(.svg-inline--fa) {
  font-size: 14px;
  line-height: 1;
}

.scene-exit-btn {
  margin-right: 8px;
}

/* 全屏时的样式 */
:fullscreen .runArea {
  height: 100vh !important;
  padding: 0;
}

:fullscreen .scene-fullscreen-btn {
  margin: 10px;
}
</style>
