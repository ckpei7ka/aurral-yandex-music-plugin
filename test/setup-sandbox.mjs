/**
 * Vite calls `net use` through child_process.exec on Windows to map network
 * drives. Some sandboxes (and this project's local dev environment) forbid
 * spawning any child process, which makes that call throw EPERM before tests
 * even start. Replacing `exec` with a callback error keeps Vite on its fallback
 * path; it has no effect on plugin behavior.
 */
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

cp.exec = (_command, _options, callback) => {
  const done = typeof _options === "function" ? _options : callback;
  if (typeof done === "function") {
    process.nextTick(() => done(new Error("child_process.exec disabled by test sandbox"), "", ""));
  }
  return {
    on() {
      return this;
    },
    once() {
      return this;
    },
    kill() {
      return true;
    },
  };
};

syncBuiltinESMExports();
