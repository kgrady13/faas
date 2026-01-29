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
  async fetch(request) {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    const method = request.method;
    if (method === "GET" && (path === "/" || path === "")) {
      return Response.json({
        capabilities: this.capabilities.map((c) => ({
          type: c.type,
          name: c.name,
          description: c.description
        }))
      });
    }
    const match = path.match(/^\/(skill|sync|automation)\/(.+)$/);
    if (!match) {
      return Response.json({ error: "Not found", path }, { status: 404 });
    }
    const [, type, name] = match;
    const capability = this.capabilities.find((c) => c.type === type && c.name === name);
    if (!capability) {
      return Response.json({ error: `Capability not found: ${type}/${name}` }, { status: 404 });
    }
    try {
      if (capability.type === "skill") {
        const input = method === "POST" ? await request.json() : {};
        const result = await capability.execute(input);
        return Response.json({ success: true, result });
      }
      if (capability.type === "sync") {
        await capability.sync();
        return Response.json({ success: true });
      }
      if (capability.type === "automation") {
        const event = await request.json();
        await capability.run(event);
        return Response.json({ success: true });
      }
      return Response.json({ error: "Unknown capability type" }, { status: 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message }, { status: 500 });
    }
  }
}
function createWorker() {
  return new Worker;
}
export {
  createWorker,
  Worker
};
