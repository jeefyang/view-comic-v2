import './assets/main.css';

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';
import Vue3TouchEvents from "vue3-touch-events";

// 通用字体
import 'vfonts/Lato.css';
// 等宽字体
import 'vfonts/FiraCode.css';
import "virtual:uno.css";
// import naive from 'naive-ui'

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(Vue3TouchEvents);
// app.use(naive)
app.mount('#app');
