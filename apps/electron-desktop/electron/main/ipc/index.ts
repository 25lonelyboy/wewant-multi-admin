// electron/main/ipc/index.ts
import { registerSystemHandlers } from "./system";

export function registerIPCHandlers() {
  registerSystemHandlers();
}
