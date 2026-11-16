<script setup lang="ts">
const social = useSocialLogin(),
  route = useRoute()
const busy = ref(false),
  error = ref('')
onMounted(() => {
  if (!social.loaded.value) void social.load().catch(() => {})
})
async function login(provider: 'qq' | 'discord') {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await social.start(provider, 'login', route.fullPath)
  } catch (cause) {
    error.value = (cause as Error).message
    busy.value = false
  }
}
</script>
<template>
  <section
    v-if="social.options.value.some((option) => option.enabled)"
    class="social-login-buttons"
    aria-label="其他登录方式"
  >
    <p>其他登录方式</p>
    <div>
      <button
        v-for="option in social.options.value.filter((option) => option.enabled)"
        :key="option.provider"
        type="button"
        class="button"
        :class="'social-' + option.provider"
        :disabled="busy"
        @click="login(option.provider)"
      >
        {{ option.label }} 登录
      </button>
    </div>
    <small>首次授权会自动创建账号，已有账号可在用户中心绑定。</small>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.social-login-buttons {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.social-login-buttons > p {
  font-size: 14px;
  color: var(--subtle);
  text-align: center;
}
.social-login-buttons > div {
  display: flex;
  gap: 10px;
  margin-block: 12px;
  flex-wrap: wrap;
}
.social-login-buttons .button {
  flex: 1;
  min-height: 44px;
  border-radius: 999px;
  font-size: 16px;
  white-space: nowrap;
  border: 0;
  color: #fff;
}
.social-login-buttons .social-qq {
  background: #12b7f5;
}
.social-login-buttons .social-qq:hover {
  background: #0ea5de;
}
.social-login-buttons .social-discord {
  background: #5865f2;
}
.social-login-buttons .social-discord:hover {
  background: #4752c4;
}
.social-login-buttons small {
  display: block;
  font-size: 13px;
  line-height: 1.8;
  color: var(--subtle);
  text-align: center;
}
</style>
