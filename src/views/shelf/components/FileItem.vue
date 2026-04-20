<template>
    <n-card content-style="padding: 0.5rem;" @click="emits('click', props.item)">
        <n-flex align="center" style="height: 100%">
            <n-flex align="center" justify="center" style="width: 5rem; height: 5rem">
                <!-- 文件夹 -->
                <n-icon v-if="props.item.isDir" :color="themeVars.warningColor" size="40">
                    <FolderFilled />
                </n-icon>
                <!-- 图片 -->
                <n-icon v-else-if="props.item.extType == 'image'" :color="themeVars.infoColor" size="40">
                    <FileImageFilled />
                </n-icon>
                <!-- 视频 -->
                <n-icon v-else-if="props.item.extType == 'video'" :color="themeVars.warningColor" size="40">
                    <ResizeVideo24Filled />
                </n-icon>
                <!-- 压缩包 -->
                <n-icon v-else-if="props.item.extType == 'zip'" :color="themeVars.infoColor" size="40">
                    <FileZipFilled />
                </n-icon>
                <!-- 文件 -->
                <n-icon v-else :color="themeVars.infoColor" size="40">
                    <FileCopyRound />
                </n-icon>
            </n-flex>

            <n-flex vertical style="flex: 1">
                <n-flex>{{ props.item.name }}</n-flex>
                <n-flex justify="space-between">
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">大小:{{ props.item.sizeStr }}</div>
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">创建:{{ props.item.createTime }}</div>
                </n-flex>
                <n-flex justify="space-between">
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">类型:{{ props.item.ext }}</div>
                    <div style="font-size: 0.7rem" :style="{ color: themeVars.borderColor }">修改:{{ props.item.updateTime }}</div>
                </n-flex>
            </n-flex>
        </n-flex>
    </n-card>
</template>
<script setup lang="ts">
import { useThemeVars } from "naive-ui";
import { FolderFilled, FileCopyRound } from "@vicons/material";
import { FileZipFilled, FileImageFilled } from "@vicons/antd";
import { ResizeVideo24Filled } from "@vicons/fluent";

const themeVars = useThemeVars();

const props = defineProps<{
    item: ViewFileType;
}>();

const emits = defineEmits<{
    (e: "click", item: ViewFileType): void;
}>();
</script>
