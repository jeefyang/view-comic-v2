/**
 * 阅读模式统一契约。
 * 任何阅读模式组件都应满足：
 *   props: { jump: number }
 *   emits: { "update:current": [index: number], action: [key: TapActionKey] }
 * 并通过 defineExpose 暴露 ReaderModeHandle。
 */
export interface ReaderModeHandle {
    /** 下一页 */
    next: () => void;
    /** 上一页 */
    prev: () => void;
    /** 跳到指定页（0 基） */
    goTo: (index: number) => void;
    /** 当前页（0 基） */
    getIndex: () => number;
}
