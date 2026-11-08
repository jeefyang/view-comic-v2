<template>
    <div class="library-path-input">
        <n-dropdown
            trigger="manual"
            placement="bottom-start"
            :show="open && dirOptions.length > 0"
            :options="dirOptions"
            :style="{ minWidth: '320px', maxWidth: '92vw', maxHeight: '40vh', overflow: 'auto' }"
            @select="onSelect"
            @clickoutside="open = false"
        >
            <n-input
                :value="value"
                :placeholder="placeholder"
                :status="errorText ? 'error' : undefined"
                @update:value="onInput"
                @focus="open = true"
                @keydown.enter.prevent="open = false"
                @keydown.esc.prevent="open = false"
                clearable
            />
        </n-dropdown>
        <div class="crumbs" v-if="crumbs.length">
            <span class="crumb" v-for="(item, index) in crumbs" :key="item.path" @click="jumpTo(item.path)">
                {{ item.label }}
                <span class="crumb-sep" v-if="index < crumbs.length - 1">/</span>
            </span>
        </div>
        <div class="tip" :class="{ 'is-error': !!errorText }">
            {{ errorText || (browsing ? "读取目录中…" : tipText) }}
        </div>
    </div>
</template>

<script setup lang="ts">
import type { DropdownOption } from "naive-ui";
import { computed, ref, watch } from "vue";
import { libraryFetch } from "@/utils/jFetch";

const props = defineProps({
    value: {
        type: String,
        default: ""
    },
    placeholder: {
        type: String,
        default: "输入路径，或点开下拉选择目录"
    }
});

const emit = defineEmits<{ (e: "update:value", value: string): void }>();

const tipText = "支持相对路径（如 ../comics）与绝对路径；末尾带 / 表示进入该目录继续选";

const open = ref(false);
const browsing = ref(false);
const errorText = ref("");
/** 已读取的目录，避免每次按键都打一次接口 */
const loadedDir = ref<string | undefined>(undefined);
const children = ref<string[]>([]);
let loadSeq = 0;

/** 统一成 / 分隔：Windows 上用户习惯反斜杠，混用会让「上级/子目录」全部失效 */
const normalizePath = (raw: string) => {
    let value = (raw || "").replace(/\\/g, "/");
    value = value.replace(/\/{2,}/g, "/");
    if (/^[A-Za-z]:$/.test(value)) value += "/";
    return value;
};

const normalized = computed(() => normalizePath(props.value));

/** 拆成「正在浏览的目录（带结尾斜杠）」+「正在输入的末段」 */
const current = computed(() => {
    const value = normalized.value;
    if (value.endsWith("/")) return { dir: value, leaf: "" };
    const index = value.lastIndexOf("/");
    if (index < 0) return { dir: "", leaf: value };
    return { dir: value.slice(0, index + 1), leaf: value.slice(index + 1) };
});

const parentOf = (dir: string) => {
    const trimmed = dir.replace(/\/+$/, "");
    const index = trimmed.lastIndexOf("/");
    if (index <= 0) return "";
    return trimmed.slice(0, index + 1);
};

/** 面包屑：每一层都能点，点哪层就跳到哪层 */
const crumbs = computed(() => {
    const dir = current.value.dir;
    if (!dir) return [];
    const absolute = dir.startsWith("/");
    const parts = dir.split("/").filter(Boolean);
    const list: { label: string; path: string }[] = [];
    let acc = absolute ? "/" : "";
    parts.forEach((part) => {
        acc = `${acc}${part}/`;
        list.push({ label: part, path: acc });
    });
    return list;
});

const dirOptions = computed<DropdownOption[]>(() => {
    const { dir, leaf } = current.value;
    const options: DropdownOption[] = [];
    const parent = parentOf(dir);
    if (parent) options.push({ key: "@parent", label: `↑ 上一级：${parent}` });
    if (dir) options.push({ key: "@current", label: `✓ 选用当前目录：${dir}` });

    const keyword = leaf.toLowerCase();
    const matched = children.value
        .filter((name) => !keyword || name.toLowerCase().startsWith(keyword))
        .sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));

    if (matched.length) {
        if (options.length) options.push({ key: "@divider", type: "divider" });
        matched.forEach((name) => options.push({ key: `child:${name}`, label: `${name}/` }));
    } else if (dir && !browsing.value) {
        if (options.length) options.push({ key: "@divider", type: "divider" });
        options.push({ key: "@empty", label: "（没有可选的子文件夹）", disabled: true });
    }
    return options;
});

const load = async (dir: string) => {
    if (!dir) {
        children.value = [];
        loadedDir.value = dir;
        errorText.value = "";
        return;
    }
    if (loadedDir.value === dir) return;
    const seq = ++loadSeq;
    browsing.value = true;
    errorText.value = "";
    const res = await libraryFetch.request("folderList", { pathUrl: dir });
    // 连续输入时只认最后一次请求的结果，早到的旧响应直接丢掉
    if (seq !== loadSeq) return;
    browsing.value = false;
    if (res.code == 200) {
        children.value = res.data?.list || [];
        loadedDir.value = dir;
    } else {
        // 目录不存在 / 没权限：清掉旧选项，免得点进一个不存在的路径
        children.value = [];
        loadedDir.value = undefined;
        errorText.value = res.msg || "读取目录失败";
    }
};

watch(
    () => current.value.dir,
    (dir) => {
        void load(dir);
    },
    { immediate: true }
);

const setValue = (value: string) => {
    errorText.value = "";
    emit("update:value", normalizePath(value));
};

const onInput = (value: string) => {
    setValue(value);
    open.value = true;
};

const jumpTo = (path: string) => {
    setValue(path);
    open.value = true;
};

const onSelect = (key: string) => {
    if (key === "@parent") {
        setValue(parentOf(current.value.dir));
        open.value = true;
        return;
    }
    if (key === "@current") {
        setValue(current.value.dir.replace(/\/+$/, ""));
        open.value = false;
        return;
    }
    if (key.startsWith("child:")) {
        setValue(`${current.value.dir}${key.slice("child:".length)}/`);
        open.value = true;
    }
};
</script>

<style scoped>
.library-path-input {
    width: 100%;
}

.crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    margin-top: 4px;
    font-size: 0.78rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    opacity: 0.72;
}

.crumb {
    cursor: pointer;
    border-radius: 4px;
    padding: 0 2px;
}

.crumb:hover {
    background: rgba(127, 127, 127, 0.18);
}

.crumb-sep {
    opacity: 0.45;
}

.tip {
    margin-top: 4px;
    font-size: 0.72rem;
    line-height: 1.4;
    opacity: 0.5;
}

.tip.is-error {
    opacity: 1;
    color: #e88080;
}
</style>
