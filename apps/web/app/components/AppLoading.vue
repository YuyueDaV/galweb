<template>
  <div class="app-loading" role="status" aria-live="polite">
    <span class="loading-ring" aria-hidden="true"></span>正在加载故事…
  </div>
</template>
<style scoped>
.app-loading {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 1.1rem;
  border: 1px solid var(--line);
  border-radius: 2rem;
  background: var(--surface-solid);
  color: var(--ink);
  box-shadow: 0 4px 24px #0002;
  font-size: 0.8rem;
  pointer-events: none;
  animation: loading-appear 0.2s 0.2s both;
  white-space: nowrap;
}
.loading-ring {
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--line);
  border-top-color: var(--orange);
  border-radius: 50%;
  animation: loading-turn 0.8s linear infinite;
}
@keyframes loading-turn {
  to {
    transform: rotate(360deg);
  }
}
@keyframes loading-appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-loading,
  .loading-ring {
    animation: none;
  }
}
</style>
