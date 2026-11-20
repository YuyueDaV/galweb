<script setup lang="ts">
withDefaults(defineProps<{ initial?: boolean }>(), { initial: false })
</script>

<template>
  <div
    class="app-loading"
    :class="{ 'is-initial': initial }"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <div class="loading-panel">
      <span class="loading-scene" aria-hidden="true">
        <span class="loading-shadow"></span>
        <svg class="loading-orange" viewBox="0 0 80 86" fill="none" focusable="false">
          <path class="loading-stem" d="M40 27c-2-7 0-12 3-16" />
          <path class="loading-leaf" d="M41 22C39 10 49 6 62 8c-2 13-11 18-21 14Z" />
          <path
            class="loading-body"
            d="M40 28C21 20 9 33 10 51c1 18 12 28 30 28s29-10 30-28C71 33 59 20 40 28Z"
          />
          <path class="loading-highlight" d="M24 36c-5 3-8 8-8 14" />
          <g class="loading-peel">
            <circle cx="57" cy="59" r="1.4" />
            <circle cx="60" cy="54" r="1" />
            <circle cx="52" cy="64" r="1" />
          </g>
          <path class="loading-smile" d="M33 54c4 4 10 4 14 0" />
        </svg>
      </span>
      <span class="loading-copy">
        <span class="loading-label"
          >{{ initial ? '正在加载故事' : '正在翻开下一页'
          }}<span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span
        ></span>
        <small>让喜欢，慢慢回响。</small>
      </span>
    </div>
  </div>
</template>

<style scoped>
.app-loading {
  --loading-hop-height: -22px;
  position: fixed;
  inset: 0;
  z-index: 2000;
  pointer-events: none;
}
.loading-panel {
  display: grid;
  place-content: center;
  justify-items: center;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  gap: 18px;
  padding: 24px;
  background:
    radial-gradient(ellipse at center, color-mix(in srgb, var(--orange) 9%, transparent), transparent 66%),
    var(--bg);
  color: var(--ink);
  text-align: center;
  /* Let the current page show through if the next render never becomes ready. */
  animation:
    loading-reveal 160ms ease-out both,
    loading-uncover 1ms step-start 10s forwards;
}
.is-initial .loading-panel {
  animation-delay: 220ms, 10s;
}
.app-loading-leave-active {
  transition: opacity 180ms ease-out;
}
.app-loading-leave-active .loading-panel {
  animation-play-state: paused;
}
.app-loading-leave-to {
  opacity: 0;
}
.loading-scene {
  position: relative;
  width: 96px;
  height: 110px;
}
.loading-orange {
  position: absolute;
  inset: 0;
  width: 96px;
  height: 103px;
  transform-origin: 50% 80%;
  animation: orange-hop 1100ms ease-in-out infinite;
}
.loading-body {
  fill: var(--orange);
}
.loading-stem {
  stroke: var(--green);
  stroke-width: 3;
  stroke-linecap: round;
}
.loading-leaf {
  fill: var(--green);
  transform-origin: 41px 22px;
  animation: leaf-sway 1100ms ease-in-out infinite;
}
.loading-highlight {
  stroke: #fffaf4;
  stroke-opacity: 0.55;
  stroke-width: 4;
  stroke-linecap: round;
}
.loading-peel {
  fill: #743416;
  opacity: 0.22;
}
.loading-smile {
  stroke: #753b24;
  stroke-width: 2;
  stroke-linecap: round;
}
.loading-shadow {
  position: absolute;
  bottom: 5px;
  left: 24px;
  width: 48px;
  height: 8px;
  border-radius: 50%;
  background: var(--orange);
  opacity: 0.2;
  animation: shadow-pulse 1100ms ease-in-out infinite;
}
.loading-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.loading-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font: 500 18px/1.5 var(--sans);
  white-space: nowrap;
}
.loading-copy small {
  color: var(--subtle);
  font: 400 13px/1.5 var(--sans);
}
.loading-dots {
  display: inline-flex;
  gap: 3px;
}
.loading-dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--orange);
  animation: dot-pulse 1100ms ease-in-out infinite;
}
.loading-dots i:nth-child(2) {
  animation-delay: 150ms;
}
.loading-dots i:nth-child(3) {
  animation-delay: 300ms;
}
@keyframes orange-hop {
  0%,
  100% {
    transform: translateY(0) scale(1.04, 0.96);
  }
  42% {
    transform: translateY(var(--loading-hop-height, -12px)) scale(0.97, 1.03) rotate(-5deg);
  }
  72% {
    transform: translateY(0) scale(1.06, 0.94) rotate(2deg);
  }
  85% {
    transform: translateY(-3px) scale(1, 1);
  }
}
@keyframes leaf-sway {
  0%,
  100% {
    transform: rotate(0);
  }
  42% {
    transform: rotate(13deg);
  }
  72% {
    transform: rotate(-8deg);
  }
}
@keyframes shadow-pulse {
  0%,
  72%,
  100% {
    transform: scaleX(1);
    opacity: 0.22;
  }
  42% {
    transform: scaleX(0.65);
    opacity: 0.12;
  }
}
@keyframes dot-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
@keyframes loading-reveal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes loading-uncover {
  to {
    visibility: hidden;
  }
}
@media (min-width: 900px) {
  .loading-scene {
    width: 112px;
    height: 128px;
  }
  .loading-orange {
    width: 112px;
    height: 120px;
  }
  .loading-shadow {
    left: 28px;
    width: 56px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-loading-leave-active {
    transition: none;
  }
  .loading-orange,
  .loading-leaf,
  .loading-shadow,
  .loading-dots i {
    animation: none;
  }
  .loading-panel {
    animation-duration: 1ms, 1ms;
    animation-timing-function: step-start, step-start;
  }
}
@media (scripting: none) {
  .app-loading {
    display: none;
  }
}
</style>
