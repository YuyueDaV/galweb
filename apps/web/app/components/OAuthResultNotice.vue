<script setup lang="ts">
const route = useRoute(),
  auth = useAuth(),
  { loginOpen } = useForum()
const open = ref(false),
  title = ref(''),
  message = ref(''),
  failed = ref(false)
watch(
  () => route.query.oauth,
  async (status) => {
    if (!import.meta.client || !['login', 'bound', 'error'].includes(String(status))) return
    failed.value = status === 'error'
    title.value = status === 'bound' ? '账号绑定成功' : status === 'login' ? '登录成功' : '授权未完成'
    const supplied = route.query.oauth_message
    message.value =
      typeof supplied === 'string'
        ? supplied.slice(0, 200)
        : failed.value
          ? '请重新尝试授权。'
          : '可继续使用当前账号。'
    const query = { ...route.query }
    delete query.oauth
    delete query.oauth_message
    delete query.oauth_provider
    await navigateTo({ path: route.path, query, hash: route.hash }, { replace: true })
    if (!failed.value) await auth.refresh()
    open.value = true
  },
  { immediate: true },
)
</script>
<template>
  <ActionDialog
    v-model="open"
    :tone="failed ? 'confirm' : 'success'"
    :title="title"
    :message="message"
    :primary="failed && !auth.user.value ? '去登录' : '继续浏览'"
    secondary="关闭"
    @primary="
      () => {
        if (failed && !auth.user.value) loginOpen = true
      }
    "
  />
</template>
