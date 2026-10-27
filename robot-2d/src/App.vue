<template>
  <div class="app-container">
    <SimulationCanvas />
  </div>
</template>

<script setup>
import SimulationCanvas from './components/Simulation2.vue';
</script>

<style>
body {
  margin: 0;
  background-color: #1e1e1e;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}
.app-container {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
