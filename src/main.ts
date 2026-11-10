import './assets/main.css';
// 统一滚动条外观（必须在 main.css 之后，才能盖住全局默认样式）
import './assets/scrollbar.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import Vue3TouchEvents from "vue3-touch-events";

// 通用字体：naive-ui 的 v-sans 使用 Lato；项目没有使用 v-mono，不再引入 FiraCode
import 'vfonts/Lato.css';
import "virtual:uno.css";

// import { initDebug } from "./myDebug";
// import naive from 'naive-ui'

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(Vue3TouchEvents);
// app.use(naive)
app.mount('#app');
// initDebug();
