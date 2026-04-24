<template>
    <div
        class="main"
        :style="{ opacity: props.opacity, top: modelY + 'px', left: modelX + 'px' }"
        v-touch:swipe.left="(e) => handleSelect('left', e)"
        v-touch:swipe.right="(e) => handleSelect('right', e)"
        v-touch:swipe.up="(e) => handleSelect('up', e)"
        v-touch:swipe.down="(e) => handleSelect('down', e)"
        v-touch:longtap="(e) => handleSelect('longtap', e)"
        v-touch:tap="(e) => handleSelect('tap', e)"
        @dblclick="(e) => handleSelect('dblclick', e)"
    >
        <slot></slot>
    </div>
</template>
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
    opacity: {
        type: Number,
        default: 0.5
    },
    x: {
        type: Number,
        default: 0
    },
    y: {
        type: Number,
        default: 0
    },
    isCoustomLongTap: {
        type: Boolean,
        default: false
    }
});

const emits = defineEmits(["swipe", "swipe.left", "swipe.right", "swipe.up", "swipe.down", "update:x", "update:y", "longtap", "tap", "dblclick"]);

const modelX = computed({
    get() {
        return props.x;
    },
    set(v: number) {
        emits("update:x", v);
    }
});

const modelY = computed({
    get() {
        return props.y;
    },
    set(v: number) {
        emits("update:y", v);
    }
});
let clientX: number | undefined = undefined;
let clientY: number | undefined = undefined;
const handleSelect = (v: string, e?: any) => {
    if (v == "left") {
        console.log("left");
        emits("swipe.left", e);
    } else if (v == "right") {
        console.log("right");
        emits("swipe.right", e);
    } else if (v == "up") {
        emits("swipe.up", e);
    } else if (v == "down") {
        emits("swipe.down", e);
    } else if (v == "longtap") {
        console.log("longtap");
        if (props.isCoustomLongTap) {
            emits("longtap", e);
            return;
        }
        const bg = document.createElement("div");
        bg.style.position = "fixed";
        bg.style.top = "0px";
        bg.style.left = "0px";
        bg.style.width = "100vw";
        bg.style.height = "100vh";
        bg.style.zIndex = "999999999";
        bg.addEventListener("mousemove", (e) => {
            if (clientX == undefined || clientY == undefined) {
                clientX = e.clientX;
                clientY = e.clientY;
                return;
            }
            modelX.value += e.clientX - clientX;
            modelY.value += e.clientY - clientY;
            clientX = e.clientX;
            clientY = e.clientY;
        });
        bg.addEventListener("mouseup", () => {
            clientX = undefined;
            clientY = undefined;
            document.body.removeChild(bg);
        });
        document.body.appendChild(bg);
        return;
    } else if (v == "tap") {
        emits("tap", e);
    } else if (v == "dblclick") {
        emits("dblclick", e);
    }
};
</script>
<style scoped>
.main {
    position: fixed;
}
</style>
