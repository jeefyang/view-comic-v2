<template>
    <n-modal :show="modelShow" class="tap-zone-editor" :mask-closable="false" @update:show="onUpdateShow">
        <n-card class="editor-card" :bordered="false" size="small" role="dialog">
            <template #header>
                <div class="editor-header">
                    <span>编辑点击区域</span>
                    <span class="editor-tip">拖动方块移动；选中后用四角 / 四边控制点改大小，都会自动吸附</span>
                </div>
            </template>

            <div class="preset-bar">
                <n-select
                    class="preset-select"
                    size="small"
                    :value="null"
                    :options="presetOptions"
                    placeholder="套用预设布局…"
                    @update:value="applyPreset"
                />
                <span class="editor-tip">套用后仍是草稿，点保存才生效</span>
            </div>

            <div class="layout-bar">
                <n-input
                    v-model:value="layoutName"
                    class="layout-input"
                    size="small"
                    :maxlength="40"
                    placeholder="布局名称，同名覆盖"
                    @keyup.enter="onUploadLayout"
                />
                <n-button size="small" tertiary :loading="layoutsBusy" :disabled="!layoutName.trim()" @click="onUploadLayout">
                    上传当前布局
                </n-button>
            </div>
            <div v-if="layoutNameList.length" class="layout-list">
                <div v-for="name in layoutNameList" :key="name" class="layout-row">
                    <span class="layout-name">{{ name }}</span>
                    <n-flex :size="6">
                        <n-button size="tiny" tertiary @click="onApplyLayout(name)">应用</n-button>
                        <n-button size="tiny" tertiary @click="onRemoveLayout(name)">删除</n-button>
                    </n-flex>
                </div>
            </div>
            <div v-if="layoutHint" class="editor-tip">{{ layoutHint }}</div>
            <div v-if="layoutsError" class="editor-tip is-error">{{ layoutsError }}</div>

            <div ref="previewRef" class="preview">
                <div
                    v-for="zone in draft"
                    :key="zone.id"
                    class="zone"
                    :class="{ 'is-selected': zone.id === selectedId }"
                    :style="zoneStyle(zone)"
                    @pointerdown.stop="startMove($event, zone)"
                >
                    <span class="zone-label">{{ zoneLabel(zone) }}</span>
                    <template v-if="zone.id === selectedId">
                        <div
                            v-for="handle in HANDLES"
                            :key="handle.key"
                            class="zone-handle"
                            :class="`zone-handle--${handle.key}`"
                            @pointerdown.stop="startResize($event, zone, handle)"
                        ></div>
                    </template>
                </div>
            </div>

            <n-flex vertical :size="10" style="margin-top: 12px">
                <n-flex align="center" :size="8">
                    <n-select
                        class="action-select"
                        size="small"
                        :value="selectedZone?.action"
                        :options="actionOptions"
                        :disabled="!selectedZone"
                        placeholder="选择一个区域"
                        @update:value="setAction"
                    />
                    <n-button size="small" tertiary :disabled="!selectedZone" @click="removeSelected">删除</n-button>
                </n-flex>
                <n-flex v-if="selectedZone?.action === 'setFitMode'" align="center" :size="8">
                    <span class="editor-tip">切换到</span>
                    <n-select
                        class="action-select"
                        size="small"
                        :value="selectedZone?.fitMode ?? 'fit'"
                        :options="fitModeSelectOptions"
                        @update:value="setZoneFitMode"
                    />
                </n-flex>
                <n-flex align="center" :size="8" justify="space-between">
                    <n-button size="small" tertiary @click="addZone">新增区域</n-button>
                    <n-flex :size="8">
                        <n-button size="small" tertiary @click="resetDraft">重置默认</n-button>
                        <n-button size="small" @click="onUpdateShow(false)">取消</n-button>
                        <n-button size="small" type="primary" @click="save">保存</n-button>
                    </n-flex>
                </n-flex>
            </n-flex>
        </n-card>
    </n-modal>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import { tapActions, tapActionLabel, type TapActionKey } from "@/views/reader/tapZones/actions";
import {
    applyTapZonePreset,
    createTapZone,
    cloneTapZones,
    loadTapZonePresets,
    resetTapZones,
    saveTapZones,
    tapZones,
    tapZonePresets
} from "@/views/reader/tapZones/useTapZones";
import type { TapZone } from "@/views/reader/tapZones/types";
import {
    applyLayout,
    layoutNameList,
    layoutsBusy,
    layoutsError,
    loadLayouts,
    removeLayout,
    saveLayoutAs
} from "@/views/reader/tapZones/layouts";
import { fitModeOptions } from "@/views/reader/modes/fitStrategies";
import type { FitModeType } from "@/views/reader/readerSettings";

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ "update:show": [show: boolean] }>();

const modelShow = computed({
    get: () => props.show,
    set: (value: boolean) => emit("update:show", value)
});

const previewRef = ref<HTMLElement>();
const draft = ref<TapZone[]>(cloneTapZones(tapZones.value));
const selectedId = ref<string>("");

const selectedZone = computed(() => draft.value.find(zone => zone.id === selectedId.value));

const actionOptions = tapActions.map(item => ({ label: item.label, value: item.key }));

const fitModeSelectOptions = fitModeOptions.map(item => ({ label: item.label, value: item.value }));

const presetOptions = computed(() => tapZonePresets.value.map(item => ({ label: item.name, value: item.id })));

const applyPreset = (id: string) => {
    draft.value = applyTapZonePreset(id);
    selectedId.value = draft.value[0]?.id ?? "";
};

onMounted(() => {
    void loadTapZonePresets();
    void loadLayouts();
});

/** 上传 / 应用 / 删除云端布局的唯一名称 */
const layoutName = ref("");
const layoutHint = ref("");

const onUploadLayout = async () => {
    const name = layoutName.value.trim();
    if (!name) {
        return;
    }
    layoutHint.value = "";
    if (await saveLayoutAs(name, draft.value)) {
        // 上传的就是编辑器里现在看到的区域，本机也一并落成同一份，避免两边不一致
        saveTapZones(cloneTapZones(draft.value));
        layoutHint.value = `已上传「${name}」`;
        layoutName.value = "";
    }
};

const onApplyLayout = (name: string) => {
    layoutHint.value = "";
    if (applyLayout(name)) {
        draft.value = cloneTapZones(tapZones.value);
        selectedId.value = draft.value[0]?.id ?? "";
        layoutHint.value = `已应用「${name}」`;
    }
};

const onRemoveLayout = async (name: string) => {
    layoutHint.value = "";
    if (await removeLayout(name)) {
        layoutHint.value = `已删除「${name}」`;
    }
};

/** 区域上显示的短标签，「切换适配方式」带上具体目标模式 */
const zoneLabel = (zone: TapZone) => {
    if (zone.action !== "setFitMode") {
        return tapActionLabel(zone.action);
    }
    const label = fitModeOptions.find(item => item.value === (zone.fitMode ?? "fit"))?.label ?? "自适应";
    return `适配 · ${label}`;
};

watch(
    () => props.show,
    value => {
        if (value) {
            draft.value = cloneTapZones(tapZones.value);
            selectedId.value = draft.value[0]?.id ?? "";
            layoutHint.value = "";
            void loadLayouts();
        }
    }
);

const onUpdateShow = (value: boolean) => {
    modelShow.value = value;
};

const zoneStyle = (zone: TapZone) => ({
    left: `${zone.rect.x * 100}%`,
    top: `${zone.rect.y * 100}%`,
    width: `${zone.rect.width * 100}%`,
    height: `${zone.rect.height * 100}%`
});

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface ResizeHandle {
    key: string;
    left?: boolean;
    right?: boolean;
    top?: boolean;
    bottom?: boolean;
}

/** 八个方向的控制点：四角改宽高，四边单独改一个维度 */
const HANDLES: ResizeHandle[] = [
    { key: "nw", left: true, top: true },
    { key: "n", top: true },
    { key: "ne", right: true, top: true },
    { key: "w", left: true },
    { key: "e", right: true },
    { key: "sw", left: true, bottom: true },
    { key: "s", bottom: true },
    { key: "se", right: true, bottom: true }
];

const MIN_SIZE = 0.05;

interface DragState {
    mode: "move" | "resize";
    id: string;
    startX: number;
    startY: number;
    origin: TapZone["rect"];
    boxWidth: number;
    boxHeight: number;
    edges?: ResizeHandle;
}

let drag: DragState | null = null;

const stopDrag = () => {
    if (!drag) {
        return;
    }
    drag = null;
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
};

/** 吸附阈值：2% 以内自动吸到整分线或相邻区域边缘 */
const SNAP = 0.02;

const snapTo = (value: number, targets: number[]) => {
    let best = value;
    let bestDist = SNAP;
    for (const target of targets) {
        const dist = Math.abs(value - target);
        if (dist < bestDist) {
            bestDist = dist;
            best = target;
        }
    }
    return best;
};

/** 移动时左右（或上下）两条边都可能吸，取调整量更小的那条 */
const snapStart = (start: number, size: number, targets: number[]) => {
    const snappedStart = snapTo(start, targets);
    const snappedEnd = snapTo(start + size, targets) - size;
    return Math.abs(snappedStart - start) <= Math.abs(snappedEnd - start) ? snappedStart : snappedEnd;
};

const snappingTargets = () => {
    const xs = [0, 0.25, 0.5, 0.75, 1];
    const ys = [0, 0.25, 0.5, 0.75, 1];
    const currentId = drag?.id;
    for (const item of draft.value) {
        if (item.id === currentId) {
            continue;
        }
        xs.push(item.rect.x, item.rect.x + item.rect.width);
        ys.push(item.rect.y, item.rect.y + item.rect.height);
    }
    return { xs, ys };
};

const onDragMove = (e: PointerEvent) => {
    if (!drag) {
        return;
    }
    const zone = draft.value.find(item => item.id === drag!.id);
    if (!zone) {
        return;
    }
    const dx = (e.clientX - drag.startX) / Math.max(1, drag.boxWidth);
    const dy = (e.clientY - drag.startY) / Math.max(1, drag.boxHeight);
    const { xs, ys } = snappingTargets();

    if (drag.mode === "move") {
        const rawX = drag.origin.x + dx;
        const rawY = drag.origin.y + dy;
        const snappedX = snapStart(rawX, zone.rect.width, xs);
        const snappedY = snapStart(rawY, zone.rect.height, ys);
        zone.rect = {
            ...zone.rect,
            x: clamp01(Math.min(snappedX, 1 - zone.rect.width)),
            y: clamp01(Math.min(snappedY, 1 - zone.rect.height))
        };
        return;
    }

    const rightEdge = drag.origin.x + drag.origin.width;
    const bottomEdge = drag.origin.y + drag.origin.height;
    let x = drag.origin.x;
    let y = drag.origin.y;
    let width = drag.origin.width;
    let height = drag.origin.height;
    const edges = drag.edges ?? { key: "se", right: true, bottom: true };

    // 横向：左边被拖动时改 x 与 width，右边被拖动时只改 width
    if (edges.left) {
        const target = snapTo(drag.origin.x + dx, xs);
        const nextX = Math.min(Math.max(0, target), rightEdge - MIN_SIZE);
        x = nextX;
        width = rightEdge - nextX;
    } else if (edges.right) {
        const target = snapTo(rightEdge + dx, xs);
        width = Math.min(Math.max(MIN_SIZE, target - drag.origin.x), 1 - drag.origin.x);
    }

    // 纵向同理
    if (edges.top) {
        const target = snapTo(drag.origin.y + dy, ys);
        const nextY = Math.min(Math.max(0, target), bottomEdge - MIN_SIZE);
        y = nextY;
        height = bottomEdge - nextY;
    } else if (edges.bottom) {
        const target = snapTo(bottomEdge + dy, ys);
        height = Math.min(Math.max(MIN_SIZE, target - drag.origin.y), 1 - drag.origin.y);
    }

    zone.rect = { x, y, width, height };
};

const beginDrag = (e: PointerEvent, zone: TapZone, mode: DragState["mode"], edges?: ResizeHandle) => {
    const box = previewRef.value?.getBoundingClientRect();
    if (!box) {
        return;
    }
    selectedId.value = zone.id;
    drag = {
        mode,
        id: zone.id,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...zone.rect },
        boxWidth: box.width,
        boxHeight: box.height,
        edges
    };
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
};

const startMove = (e: PointerEvent, zone: TapZone) => {
    e.preventDefault();
    beginDrag(e, zone, "move");
};

const startResize = (e: PointerEvent, zone: TapZone, handle: ResizeHandle) => {
    e.preventDefault();
    beginDrag(e, zone, "resize", handle);
};

const setAction = (value: TapActionKey) => {
    const zone = selectedZone.value;
    if (!zone) {
        return;
    }
    zone.action = value;
    if (value === "setFitMode") {
        zone.fitMode = zone.fitMode ?? "fit";
    } else {
        delete zone.fitMode;
    }
};

const setZoneFitMode = (value: FitModeType) => {
    if (selectedZone.value) {
        selectedZone.value.fitMode = value;
    }
};

const removeSelected = () => {
    const index = draft.value.findIndex(zone => zone.id === selectedId.value);
    if (index < 0) {
        return;
    }
    draft.value.splice(index, 1);
    selectedId.value = draft.value[Math.min(index, draft.value.length - 1)]?.id ?? "";
};

const addZone = () => {
    const zone = createTapZone();
    draft.value.push(zone);
    selectedId.value = zone.id;
};

const resetDraft = async () => {
    draft.value = cloneTapZones(await resetTapZones());
    selectedId.value = draft.value[0]?.id ?? "";
};

const save = () => {
    saveTapZones(draft.value);
    onUpdateShow(false);
};
</script>

<style lang="scss" scoped>
.editor-card {
    width: min(520px, 92vw);
}

.editor-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.editor-tip {
    font-size: 12px;
    opacity: 0.55;
}

.preset-bar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    margin-bottom: 8px;
}

.preset-select {
    width: 100%;
}

.layout-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.layout-input {
    flex: 1 1 auto;
}

.layout-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 120px;
    margin-bottom: 10px;
    padding: 6px 8px;
    overflow: auto;
    border-radius: var(--border-radius);
    background-color: rgba(127, 127, 127, 0.1);
}

.layout-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.layout-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.is-error {
    color: var(--error-color);
    opacity: 1;
}

.preview {
    position: relative;
    width: 100%;
    height: 300px;
    overflow: hidden;
    background-color: rgba(127, 127, 127, 0.12);
    border-radius: var(--border-radius);
    touch-action: none;
    background-image: linear-gradient(to right, rgba(127, 127, 127, 0.18) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(127, 127, 127, 0.18) 1px, transparent 1px);
    background-size: 10% 10%;
}

.zone {
    position: absolute;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    box-sizing: border-box;
    background-color: rgba(64, 158, 255, 0.16);
    border: 1px dashed rgba(64, 158, 255, 0.9);
    cursor: move;
    user-select: none;
    touch-action: none;

    &.is-selected {
        background-color: rgba(64, 158, 255, 0.3);
        border-style: solid;
        z-index: 1;
    }
}

.zone-label {
    padding: 2px 4px;
    font-size: 11px;
    color: var(--text-color-1);
    white-space: nowrap;
    pointer-events: none;
}

/* 控制点放在区域内部，不会被预览区的 overflow 裁掉，也更好用手指点中 */
.zone-handle {
    position: absolute;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: none;
    z-index: 2;

    &::after {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 2px;
        background-color: var(--primary-color);
    }

    &--nw {
        left: 0;
        top: 0;
        cursor: nwse-resize;
    }

    &--n {
        left: 50%;
        top: 0;
        transform: translateX(-50%);
        cursor: ns-resize;

        &::after {
            width: 12px;
            height: 5px;
        }
    }

    &--ne {
        right: 0;
        top: 0;
        cursor: nesw-resize;
    }

    &--w {
        left: 0;
        top: 50%;
        transform: translateY(-50%);
        cursor: ew-resize;

        &::after {
            width: 5px;
            height: 12px;
        }
    }

    &--e {
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        cursor: ew-resize;

        &::after {
            width: 5px;
            height: 12px;
        }
    }

    &--sw {
        left: 0;
        bottom: 0;
        cursor: nesw-resize;
    }

    &--s {
        left: 50%;
        bottom: 0;
        transform: translateX(-50%);
        cursor: ns-resize;

        &::after {
            width: 12px;
            height: 5px;
        }
    }

    &--se {
        right: 0;
        bottom: 0;
        cursor: nwse-resize;
    }
}

.action-select {
    min-width: 180px;
}
</style>
