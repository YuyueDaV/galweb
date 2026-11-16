<script setup lang="ts">
import type { SocialBinding, SocialProvider } from '~/composables/useSocialLogin'
const auth = useAuth(),
  social = useSocialLogin()
const bindings = ref<SocialBinding[]>([]),
  busy = ref(false),
  error = ref(''),
  message = ref('')
const confirmation = ref(false),
  removing = ref<SocialBinding | null>(null)
const email = ref(''),
  password = ref(''),
  confirmPassword = ref(''),
  code = ref(''),
  challengeId = ref(''),
  cooldown = ref(0)
let revision = 0,
  timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(() => {
    if (cooldown.value > 0) cooldown.value--
  }, 1000)
})
onBeforeUnmount(() => {
  revision++
  clearInterval(timer)
})
watch(
  () => auth.user.value?.id,
  async (id) => {
    if (!import.meta.client) return
    const current = ++revision
    bindings.value = []
    error.value = ''
    message.value = ''
    challengeId.value = ''
    code.value = ''
    password.value = ''
    confirmPassword.value = ''
    email.value = ''
    cooldown.value = 0
    confirmation.value = false
    removing.value = null
    if (!id) return
    try {
      const rows = await auth.request<SocialBinding[]>('/auth/oauth/bindings')
      if (current === revision && auth.user.value?.id === id) bindings.value = rows
    } catch (cause) {
      if (current === revision) error.value = (cause as Error).message
    }
  },
  { immediate: true },
)
watch(email, () => {
  challengeId.value = ''
  code.value = ''
})
async function bind(provider: SocialProvider) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await social.start(provider, 'bind', '/account')
  } catch (cause) {
    error.value = (cause as Error).message
    busy.value = false
  }
}
function confirmUnlink(binding: SocialBinding) {
  removing.value = binding
  confirmation.value = true
}
async function unlink() {
  if (busy.value || !removing.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const result = await auth.request<{ message: string }>(
      `/auth/oauth/${removing.value.provider}`,
      {},
      'DELETE',
    )
    message.value = result.message
    bindings.value = await auth.request<SocialBinding[]>('/auth/oauth/bindings')
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function sendCode() {
  if (busy.value || cooldown.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const data = await auth.request<{ challengeId: string; retryAfter: number; message: string }>(
      '/auth/registration-code',
      { email: email.value },
    )
    challengeId.value = data.challengeId
    cooldown.value = data.retryAfter
    message.value = data.message
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function complete() {
  if (busy.value) return
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致。'
    return
  }
  busy.value = true
  try {
    await auth.completeCredentials({
      email: email.value,
      challengeId: challengeId.value,
      code: code.value,
      password: password.value,
      confirmPassword: confirmPassword.value,
    })
    password.value = ''
    confirmPassword.value = ''
    message.value = '邮箱和密码已设置，可使用邮箱或用户名登录。'
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <section class="profile-card social-account-settings" aria-labelledby="social-account-title">
    <div class="profile-card-heading"><h2 id="social-account-title">登录方式与账号绑定</h2></div>
    <div class="social-settings-body">
      <p>已绑定的登录方式会进入同一个账号，书单、提名和收藏统一保留。</p>
      <div v-for="binding in bindings" :key="binding.provider" class="social-binding-row">
        <div>
          <strong>{{ binding.label }}</strong
          ><span>{{
            binding.bound
              ? '已绑定' + (binding.displayName ? ' · ' + binding.displayName : '')
              : binding.enabled
                ? '未绑定'
                : '暂未开放'
          }}</span>
        </div>
        <button
          v-if="binding.bound"
          type="button"
          class="button secondary"
          :disabled="busy"
          @click="confirmUnlink(binding)"
        >
          解绑 {{ binding.label }}
        </button>
        <button
          v-else
          type="button"
          class="button secondary"
          :disabled="busy || !binding.enabled"
          @click="bind(binding.provider)"
        >
          绑定 {{ binding.label }}
        </button>
      </div>
      <form
        v-if="auth.user.value && !auth.user.value.email"
        class="social-credentials"
        @submit.prevent="complete"
      >
        <h3>补充邮箱与密码</h3>
        <p>设置后可找回账号，也能通过邮箱或用户名登录。</p>
        <fieldset class="plain-fieldset" :disabled="busy">
          <label class="community-field"
            >邮箱<input v-model="email" type="email" required maxlength="254" autocomplete="email"
          /></label>
          <div class="social-code">
            <label class="community-field"
              >邮箱验证码<input
                v-model="code"
                required
                pattern="[0-9]{6}"
                maxlength="6"
                inputmode="numeric"
                autocomplete="one-time-code" /></label
            ><button
              type="button"
              class="button secondary"
              :disabled="!email || cooldown > 0"
              @click="sendCode"
            >
              {{ cooldown ? `${cooldown} 秒后重发` : '发送验证码' }}
            </button>
          </div>
          <label class="community-field"
            >设置密码<input
              v-model="password"
              type="password"
              required
              minlength="12"
              maxlength="128"
              autocomplete="new-password"
          /></label>
          <label class="community-field"
            >确认密码<input
              v-model="confirmPassword"
              type="password"
              required
              minlength="12"
              maxlength="128"
              autocomplete="new-password"
          /></label>
          <button type="submit" class="button primary" :disabled="!challengeId">保存邮箱和密码</button>
        </fieldset>
      </form>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="message" class="form-success" role="status">{{ message }}</p>
    </div>
    <ActionDialog
      v-model="confirmation"
      tone="confirm"
      :title="`解绑 ${removing?.label || ''}？`"
      message="解绑后将无法通过此方式登录。至少需要保留一种可用的登录或账号恢复方式。"
      primary="确认解绑"
      secondary="保留绑定"
      @primary="unlink"
    />
  </section>
</template>
<style scoped>
.social-account-settings {
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  min-width: 0;
}
.profile-card-heading {
  padding: 20px 24px;
  border-bottom: 1px solid var(--line);
}
.profile-card-heading h2 {
  font-size: 20px;
  font-weight: 500;
}
.social-credentials .community-field {
  font-size: 15px;
}
.social-credentials input {
  font-size: 16px;
  min-height: 48px;
  border-radius: 16px;
}
.social-account-settings {
  margin-top: 24px;
}
.social-settings-body {
  padding: 24px;
}
.social-settings-body > p,
.social-credentials > p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--subtle);
}
.social-binding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-block: 16px;
  border-bottom: 1px solid var(--line);
}
.social-binding-row > div {
  min-width: 0;
}
.social-binding-row strong {
  font-size: 16px;
}
.social-binding-row span {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  color: var(--subtle);
  overflow-wrap: anywhere;
}
.social-binding-row .button {
  flex-shrink: 0;
  min-height: 44px;
  border-radius: 999px;
  font-size: 14px;
}
.social-credentials {
  margin-top: 24px;
}
.social-credentials h3 {
  font-size: 20px;
}
.social-credentials fieldset {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.social-code {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.social-code > label {
  flex: 1;
  min-width: 0;
}
.social-code .button {
  min-height: 48px;
  margin-bottom: 0;
}
.social-settings-body .form-error,
.social-settings-body .form-success {
  margin-top: 16px;
}
@media (max-width: 599px) {
  .social-settings-body {
    padding: 16px;
  }
  .social-code {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
