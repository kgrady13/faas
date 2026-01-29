// @bun
// src/index.ts
class Worker {
  capabilities = [];
  addCapability(capability) {
    this.capabilities.push(capability);
    return this;
  }
  getCapabilities() {
    return [...this.capabilities];
  }
  getCapability(name) {
    return this.capabilities.find((c) => c.name === name);
  }
  hasCapability(name) {
    return this.capabilities.some((c) => c.name === name);
  }
}
function createWorker() {
  return new Worker;
}
export {
  createWorker,
  Worker
};
