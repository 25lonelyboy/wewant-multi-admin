<script setup lang="ts">
import { watch } from 'vue';
import { useImageVerify } from './hooks';

defineOptions({
  name: 'ReImageVerify'
});

interface Props {
  code?: string;
}

interface Emits {
  (e: 'update:code', code: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  code: ''
});

const emit = defineEmits<Emits>();

const { domRef, imgCode, setImgCode, getImgCode } = useImageVerify();

// 模板 ref 回调：setupState 代理会解包 ref，模板内无法直接对其赋 `.value`，
// 故在脚本层以闭包捕获原始 ref 后赋值（卸载时 el 为 null，归一为 undefined）
const bindCanvas = (el: unknown) => {
  domRef.value = (el ?? undefined) as HTMLCanvasElement;
};

watch(
  () => props.code,
  newValue => {
    setImgCode(newValue);
  }
);
watch(imgCode, newValue => {
  emit('update:code', newValue);
});

defineExpose({ getImgCode });
</script>

<template>
  <canvas
    :ref="bindCanvas"
    width="120"
    height="40"
    class="cursor-pointer"
    @click="getImgCode"
  />
</template>
