// electron/main/ipc/index.ts
import { registerSystemHandlers } from './system.js';

export function registerIPCHandlers() {
  registerSystemHandlers();
}
