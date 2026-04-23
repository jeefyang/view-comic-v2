<!-- src/views/ReaderView.vue -->
<template>
    <div class="reader-container">
        <waterfall :jump="jump" v-if="isInit"></waterfall>
    </div>
</template>

<script setup lang="ts">
import { useConfigStore } from "@/stores/config";
import { useViewStore } from "@/stores/view";
import { onActivated, onMounted, ref } from "vue";
import Waterfall from "./components/Waterfall.vue";

const readerEditUUid = ref("");
const readerPath = ref("");
const readerStart = ref(0);
const isInit = ref(false);

const jump = ref(0);

const configStore = useConfigStore();
const viewStore = useViewStore();

const toHome = () => {};
const init = () => {
    isInit.value=true
    if (!viewStore.curLibrary || !viewStore.curLibrary.editUUID) {
        return toHome();
    }
    console.log(viewStore.comicFileList)
    if (!viewStore.comicFileList || !viewStore.comicFileList.baseFile || viewStore.comicFileList.list.length == 0) {
        return toHome;
    }
};

const update = () => {};

onMounted(() => {
    console.log("reader");
    window.addEventListener("resize", () => {
        console.log("resize");
    });
});

onActivated(() => {
    init();
});
</script>

<style scoped>
.reader-container {
    width: 100vw;
    height: 100vh;
    position: absolute;
    top: 0;
    left: 0;
}
</style>
