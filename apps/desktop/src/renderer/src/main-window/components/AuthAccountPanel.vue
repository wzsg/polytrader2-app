<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, CheckCircle2, LogIn, LogOut, Mail, RefreshCw, UserRound, X } from '@lucide/vue';
import {
  CLOUDFLARE_TURNSTILE_API_URL,
  type AuthProvider,
  type AuthState,
} from '@polytrader/shared';
import githubIconUrl from '@/assets/github-invertocat.svg';
import googleIconUrl from '@/assets/google-g.svg';
import LoadingSpinner from '@/shared/components/LoadingSpinner.vue';

const RESEND_COOLDOWN_SECONDS = 60;
const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script';
const TURNSTILE_SCRIPT_SRC = CLOUDFLARE_TURNSTILE_API_URL;
const turnstileFeatureEnabled = __TURNSTILE_ENABLED__;

const props = defineProps<{
  open: boolean;
  authState: AuthState;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const mode = ref<'sign-in' | 'sign-up'>('sign-in');
const authScreen = ref<'form' | 'registration'>('form');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const busy = ref(false);
const message = ref('');
const error = ref('');
const registrationEmail = ref('');
const registrationSubmitted = ref(false);
const resendCooldownSeconds = ref(0);
const turnstileContainer = ref<HTMLElement | null>(null);
const turnstileToken = ref('');
const turnstileError = ref('');
const turnstileLoading = ref(false);
const turnstileLoaded = ref(false);
const turnstileWidgetId = ref<string | null>(null);
let resendCooldownTimer: number | undefined;

const signedIn = computed(() => props.authState.status === 'signed-in');
const disabled = computed(
  () => !props.authState.configured || props.authState.status === 'disabled',
);
const registrationScreenVisible = computed(
  () => !disabled.value && !signedIn.value && authScreen.value === 'registration',
);
const registrationDisplayEmail = computed(
  () => registrationEmail.value || email.value || props.authState.email || '',
);
const registrationComplete = computed(() => registrationSubmitted.value);
const resendConfirmationDisabled = computed(() => busy.value || resendCooldownSeconds.value > 0);
const resendConfirmationLabel = computed(() =>
  resendCooldownSeconds.value > 0
    ? t('auth.resendConfirmationCountdown', { seconds: resendCooldownSeconds.value })
    : t('auth.resendConfirmation'),
);
const turnstileSiteKey = computed(() => import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? '');
const turnstileRequired = computed(
  () => turnstileFeatureEnabled && props.open && mode.value === 'sign-up' && !signedIn.value,
);
const turnstileReady = computed(
  () =>
    !turnstileRequired.value || (Boolean(turnstileSiteKey.value) && Boolean(turnstileToken.value)),
);
const submitDisabled = computed(() => busy.value || !turnstileReady.value);
const submitTitle = computed(() => {
  if (mode.value !== 'sign-up' || !turnstileFeatureEnabled) return undefined;
  if (!turnstileSiteKey.value) return t('auth.turnstileMissingSiteKey');
  if (!turnstileToken.value) return t('auth.turnstileRequired');
  return undefined;
});

function setResult(resultMessage: string): void {
  message.value = resultMessage;
  error.value = '';
}

function setError(resultError: string): void {
  error.value = resultError;
  message.value = '';
}

function clearResendCooldown(): void {
  if (resendCooldownTimer === undefined) return;
  window.clearInterval(resendCooldownTimer);
  resendCooldownTimer = undefined;
}

function startResendCooldown(): void {
  clearResendCooldown();
  resendCooldownSeconds.value = RESEND_COOLDOWN_SECONDS;
  resendCooldownTimer = window.setInterval(() => {
    resendCooldownSeconds.value -= 1;
    if (resendCooldownSeconds.value > 0) return;
    resendCooldownSeconds.value = 0;
    clearResendCooldown();
  }, 1000);
}

function resetTurnstileToken(): void {
  turnstileToken.value = '';
  if (!window.turnstile || !turnstileWidgetId.value) return;
  window.turnstile.reset(turnstileWidgetId.value);
}

function removeTurnstileWidget(): void {
  if (window.turnstile && turnstileWidgetId.value) {
    window.turnstile.remove?.(turnstileWidgetId.value);
  }
  turnstileWidgetId.value = null;
  turnstileToken.value = '';
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) {
    turnstileLoaded.value = true;
    return Promise.resolve();
  }

  const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(t('auth.turnstileLoadFailed'))), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener(
      'load',
      () => {
        turnstileLoaded.value = true;
        resolve();
      },
      { once: true },
    );
    script.addEventListener('error', () => reject(new Error(t('auth.turnstileLoadFailed'))), {
      once: true,
    });
    document.head.appendChild(script);
  });
}

async function renderTurnstile(): Promise<void> {
  if (!turnstileRequired.value || !turnstileSiteKey.value) {
    removeTurnstileWidget();
    return;
  }

  await nextTick();
  if (!turnstileContainer.value || turnstileWidgetId.value) return;

  turnstileLoading.value = true;
  turnstileError.value = '';
  try {
    await loadTurnstileScript();
    if (!window.turnstile || !turnstileContainer.value) return;
    turnstileWidgetId.value = window.turnstile.render(turnstileContainer.value, {
      sitekey: turnstileSiteKey.value,
      action: 'signup',
      callback: (token) => {
        turnstileToken.value = token;
        turnstileError.value = '';
      },
      'expired-callback': () => {
        turnstileToken.value = '';
      },
      'error-callback': () => {
        turnstileToken.value = '';
        turnstileError.value = t('auth.turnstileLoadFailed');
      },
    });
  } catch (err) {
    turnstileError.value = err instanceof Error ? err.message : String(err);
  } finally {
    turnstileLoading.value = false;
  }
}

async function runAction(action: () => Promise<void>): Promise<void> {
  busy.value = true;
  try {
    await action();
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    busy.value = false;
  }
}

async function submitEmail(): Promise<void> {
  await runAction(async () => {
    if (mode.value === 'sign-up' && password.value !== confirmPassword.value) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (mode.value === 'sign-up' && turnstileFeatureEnabled && !turnstileSiteKey.value) {
      setError(t('auth.turnstileMissingSiteKey'));
      return;
    }
    if (mode.value === 'sign-up' && turnstileFeatureEnabled && !turnstileToken.value) {
      setError(t('auth.turnstileRequired'));
      return;
    }

    const input = {
      email: email.value,
      password: password.value,
      captchaToken:
        mode.value === 'sign-up' && turnstileFeatureEnabled ? turnstileToken.value : undefined,
    };
    if (mode.value === 'sign-up') {
      authScreen.value = 'registration';
      registrationEmail.value = email.value;
      registrationSubmitted.value = false;
      message.value = '';
      error.value = '';
    }

    const result =
      mode.value === 'sign-up'
        ? await window.api.signUpWithEmail(input)
        : await window.api.signInWithEmail(input);
    if (!result.ok) {
      setError(result.error);
      if (mode.value === 'sign-up') resetTurnstileToken();
      return;
    }
    if (mode.value === 'sign-up') {
      registrationSubmitted.value = true;
      startResendCooldown();
      setResult(t('auth.confirmationSent'));
      return;
    }

    setResult(t('auth.signedIn'));
  });
}

async function signInWithProvider(provider: AuthProvider): Promise<void> {
  await runAction(async () => {
    const result = await window.api.signInWithProvider(provider);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResult(t('auth.browserOpened'));
  });
}

async function resendConfirmation(): Promise<void> {
  if (resendCooldownSeconds.value > 0) return;

  await runAction(async () => {
    const result = await window.api.resendSignupConfirmation(registrationDisplayEmail.value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startResendCooldown();
    setResult(t('auth.confirmationResent'));
  });
}

async function runDataSync(): Promise<void> {
  await runAction(async () => {
    const result = await window.api.runDataSync();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResult(t('dataSync.complete'));
  });
}

async function signOut(): Promise<void> {
  await runAction(async () => {
    const result = await window.api.signOut();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResult(t('auth.signedOut'));
  });
}

function backToAuthForm(): void {
  authScreen.value = 'form';
  mode.value = 'sign-in';
  message.value = '';
  error.value = '';
}

onBeforeUnmount(() => {
  clearResendCooldown();
  removeTurnstileWidget();
});

watch([() => props.open, mode, signedIn], () => {
  if (!turnstileRequired.value) {
    removeTurnstileWidget();
    return;
  }
  void renderTurnstile();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      :aria-label="t('auth.account')"
    >
      <div class="border-border bg-surface w-full max-w-md rounded-lg border shadow-xl">
        <div class="border-border flex items-center justify-between border-b px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <button
              v-if="registrationScreenVisible"
              type="button"
              class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:text-white disabled:opacity-50"
              :disabled="busy"
              :title="t('auth.backToSignIn')"
              :aria-label="t('auth.backToSignIn')"
              @click="backToAuthForm"
            >
              <ArrowLeft :size="16" />
            </button>
            <UserRound :size="20" class="text-primary-light shrink-0" />
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-white">{{ t('auth.account') }}</h2>
              <p class="text-muted truncate text-xs">
                {{ authState.email || t('auth.notSignedIn') }}
              </p>
            </div>
          </div>
          <button
            type="button"
            class="hover:bg-btn-secondary text-muted-light inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:text-white"
            :title="t('common.close')"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <X :size="16" />
          </button>
        </div>

        <div class="space-y-4 px-5 py-5">
          <div v-if="disabled" class="border-border bg-detail-bg rounded-md border px-4 py-3">
            <p class="text-sm font-medium text-white">{{ t('auth.disabled') }}</p>
            <p class="text-muted mt-1 text-sm">{{ authState.error || t('auth.configureHint') }}</p>
          </div>

          <template v-else-if="signedIn">
            <div class="border-border bg-detail-bg rounded-md border px-4 py-3">
              <p class="text-sm font-medium text-white">{{ t('auth.signedInAs') }}</p>
              <p class="text-muted mt-1 truncate text-sm">{{ authState.email }}</p>
              <p class="text-muted mt-2 text-xs">
                {{ t(`dataSync.state.${authState.dataSyncState}`) }}
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <button
                type="button"
                class="bg-primary hover:bg-primary-hover inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                :disabled="busy || authState.dataSyncState === 'syncing'"
                @click="runDataSync"
              >
                <RefreshCw
                  :size="16"
                  :class="{ 'animate-spin': busy || authState.dataSyncState === 'syncing' }"
                />
                {{ t('dataSync.runNow') }}
              </button>
              <button
                type="button"
                class="border-border text-text hover:bg-btn-secondary inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors disabled:opacity-50"
                :disabled="busy"
                @click="signOut"
              >
                <LogOut :size="16" />
                {{ t('auth.signOut') }}
              </button>
            </div>
          </template>

          <template v-else-if="registrationScreenVisible">
            <div class="flex min-h-[300px] flex-col">
              <div class="flex flex-1 flex-col items-center justify-center py-8 text-center">
                <div
                  class="border-border bg-detail-bg mb-5 flex h-16 w-16 items-center justify-center rounded-full border"
                >
                  <LoadingSpinner
                    v-if="busy && !registrationComplete"
                    :size="28"
                    :title="t('auth.creatingAccount')"
                  />
                  <CheckCircle2
                    v-else-if="registrationComplete"
                    :size="30"
                    class="text-emerald-400"
                    aria-hidden="true"
                  />
                  <Mail v-else :size="28" class="text-primary-light" aria-hidden="true" />
                </div>

                <h3 class="text-lg font-semibold text-white">
                  {{
                    registrationComplete
                      ? t('auth.confirmationRequiredTitle')
                      : t('auth.registrationTitle')
                  }}
                </h3>
                <p class="text-muted mt-2 max-w-[320px] text-sm">
                  {{
                    registrationComplete
                      ? t('auth.confirmationRequiredDescription')
                      : t('auth.registrationDescription')
                  }}
                </p>

                <button
                  v-if="registrationComplete"
                  type="button"
                  class="border-border text-text hover:bg-btn-secondary mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors disabled:opacity-50"
                  :disabled="resendConfirmationDisabled"
                  @click="resendConfirmation"
                >
                  <LoadingSpinner v-if="busy" :size="14" :title="t('auth.resendConfirmation')" />
                  <RefreshCw v-else :size="15" />
                  {{ resendConfirmationLabel }}
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="rounded-md px-3 py-2 text-sm transition-colors"
                :class="mode === 'sign-in' ? 'bg-primary text-white' : 'bg-btn-secondary text-text'"
                @click="mode = 'sign-in'"
              >
                {{ t('auth.signIn') }}
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-2 text-sm transition-colors"
                :class="mode === 'sign-up' ? 'bg-primary text-white' : 'bg-btn-secondary text-text'"
                @click="
                  mode = 'sign-up';
                  if (turnstileFeatureEnabled) void renderTurnstile();
                "
              >
                {{ t('auth.signUp') }}
              </button>
            </div>

            <form class="space-y-3" @submit.prevent="submitEmail">
              <label class="block">
                <span class="text-muted mb-1 block text-xs">{{ t('auth.email') }}</span>
                <input
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  class="border-border bg-bg text-text focus:border-primary h-9 w-full rounded-md border px-3 text-sm outline-none"
                  :placeholder="t('auth.emailPlaceholder')"
                />
              </label>
              <label class="block">
                <span class="text-muted mb-1 block text-xs">{{ t('auth.password') }}</span>
                <input
                  v-model="password"
                  type="password"
                  :autocomplete="mode === 'sign-up' ? 'new-password' : 'current-password'"
                  class="border-border bg-bg text-text focus:border-primary h-9 w-full rounded-md border px-3 text-sm outline-none"
                  :placeholder="t('auth.passwordPlaceholder')"
                />
              </label>
              <label v-if="mode === 'sign-up'" class="block">
                <span class="text-muted mb-1 block text-xs">{{ t('auth.confirmPassword') }}</span>
                <input
                  v-model="confirmPassword"
                  type="password"
                  autocomplete="new-password"
                  class="border-border bg-bg text-text focus:border-primary h-9 w-full rounded-md border px-3 text-sm outline-none"
                  :placeholder="t('auth.confirmPasswordPlaceholder')"
                />
              </label>
              <div v-if="mode === 'sign-up' && turnstileFeatureEnabled" class="space-y-2">
                <div
                  v-if="turnstileSiteKey"
                  ref="turnstileContainer"
                  class="min-h-[65px]"
                  :aria-label="t('auth.turnstileRequired')"
                ></div>
                <p v-else class="text-sm text-red-400">{{ t('auth.turnstileMissingSiteKey') }}</p>
                <div v-if="turnstileLoading" class="flex items-center gap-2">
                  <LoadingSpinner :size="16" :title="t('auth.turnstileLoading')" />
                </div>
                <p v-if="turnstileError" class="text-sm text-red-400">{{ turnstileError }}</p>
              </div>
              <button
                type="submit"
                class="bg-primary hover:bg-primary-hover inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
                :disabled="submitDisabled"
                :title="submitTitle"
              >
                <LogIn :size="16" />
                {{ mode === 'sign-up' ? t('auth.signUp') : t('auth.signIn') }}
              </button>
            </form>

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="border-border text-text hover:bg-btn-secondary inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50"
                :disabled="busy"
                @click="signInWithProvider('google')"
              >
                <img
                  :src="googleIconUrl"
                  alt=""
                  aria-hidden="true"
                  class="h-[18px] w-[18px] shrink-0 object-contain"
                />
                {{ t('auth.google') }}
              </button>
              <button
                type="button"
                class="border-border text-text hover:bg-btn-secondary inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50"
                :disabled="busy"
                @click="signInWithProvider('github')"
              >
                <img
                  :src="githubIconUrl"
                  alt=""
                  aria-hidden="true"
                  class="h-[18px] w-[18px] shrink-0 object-contain"
                />
                {{ t('auth.github') }}
              </button>
            </div>
          </template>

          <div v-if="busy && !registrationScreenVisible" class="flex items-center gap-2">
            <LoadingSpinner :size="16" :title="t('auth.processing')" />
          </div>
          <p
            v-if="message"
            class="text-sm text-emerald-400"
            :class="{ 'text-center': registrationScreenVisible }"
          >
            {{ message }}
          </p>
          <p v-if="error || authState.error" class="text-sm text-red-400">
            {{ error || authState.error }}
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
