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
  position: fixed;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  z-index: 2000;
  max-width: calc(100vw - 32px);
  transform: translateX(-50%);
  pointer-events: none;
}
.loading-panel {
  display: flex;
  align-items: center;
  gap: 14px;
  box-sizing: border-box;
  padding: 12px 24px 12px 16px;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface-solid);
  color: var(--ink);
  box-shadow: 0 12px 40px #443a2120;
  animation: loading-appear 160ms ease-out both;
}
.app-loading.is-initial {
  --loading-hop-height: -22px;
  inset: 0;
  max-width: none;
  transform: none;
}
.is-initial .loading-panel {
  display: grid;
  place-content: center;
  justify-items: center;
  width: 100%;
  height: 100%;
  gap: 18px;
  padding: 24px;
  border: 0;
  border-radius: 0;
  background:
    radial-gradient(ellipse at center, color-mix(in srgb, var(--orange) 9%, transparent), transparent 66%),
    var(--bg);
  box-shadow: none;
  text-align: center;
  /* Keep the server-rendered page reachable if the client fails to start. */
  animation:
    loading-reveal 160ms ease-out 220ms both,
    loading-uncover 1ms step-start 10s forwards;
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
  flex: 0 0 64px;
  width: 64px;
  height: 76px;
}
.loading-orange {
  position: absolute;
  inset: 0;
  width: 64px;
  height: 69px;
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
  bottom: 3px;
  left: 16px;
  width: 32px;
  height: 6px;
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
  gap: 6px;
  font: 500 15px/1.5 var(--sans);
  white-space: nowrap;
}
.loading-copy small {
  color: var(--subtle);
  font: 400 12px/1.5 var(--sans);
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
:global(html[data-theme='dark']) .app-loading:not(.is-initial) .loading-panel {
  box-shadow: 0 12px 40px #0005;
}
.is-initial .loading-scene {
  width: 96px;
  height: 110px;
}
.is-initial .loading-orange {
  width: 96px;
  height: 103px;
}
.is-initial .loading-shadow {
  left: 24px;
  width: 48px;
  height: 8px;
  bottom: 5px;
}
.is-initial .loading-label {
  justify-content: center;
  font-size: 18px;
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
@keyframes loading-appear {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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
  .app-loading:not(.is-initial) {
    bottom: 32px;
  }
  .app-loading:not(.is-initial) .loading-panel {
    min-width: 300px;
    gap: 18px;
    padding: 16px 28px 16px 20px;
  }
  .loading-scene {
    flex-basis: 80px;
    width: 80px;
    height: 92px;
  }
  .loading-orange {
    width: 80px;
    height: 86px;
  }
  .loading-shadow {
    left: 20px;
    width: 40px;
    height: 7px;
    bottom: 4px;
  }
  .loading-label {
    font-size: 16px;
  }
  .loading-copy small {
    font-size: 13px;
  }
  .is-initial .loading-scene {
    width: 112px;
    height: 128px;
  }
  .is-initial .loading-orange {
    width: 112px;
    height: 120px;
  }
  .is-initial .loading-shadow {
    left: 28px;
    width: 56px;
    height: 8px;
    bottom: 5px;
  }
}
@media (max-width: 599px) {
  .app-loading:not(.is-initial) {
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  }
  .app-loading:not(.is-initial) .loading-panel {
    gap: 10px;
    padding: 10px 16px 10px 12px;
    border-radius: 20px;
  }
  .loading-label {
    font-size: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-loading-leave-active {
    transition: none;
  }
  .app-loading:not(.is-initial) .loading-panel,
  .loading-orange,
  .loading-leaf,
  .loading-shadow,
  .loading-dots i {
    animation: none;
  }
  .is-initial .loading-panel {
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
