<script setup>
defineProps({
  section: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <article class="card section-card">
    <header class="card-header">
      <div>
        <p class="card-kicker">{{ section.id }}</p>
        <h2 class="card-title">{{ section.label }}</h2>
        <p class="card-desc">{{ section.description }}</p>
      </div>
      <slot name="actions" />
    </header>

    <div class="section-card__body">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.section-card {
  gap: 16px;
  padding: 20px;
}

.card-header {
  align-items: flex-start;
}

.card-kicker {
  text-transform: uppercase;
}

.section-card__body {
  display: grid;
  gap: 12px;
}
</style>