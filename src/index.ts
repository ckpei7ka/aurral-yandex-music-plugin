import { createPlugin } from "./plugin";

/**
 * Aurral loads the bundle with `import()` and uses the default export.
 * See backend/services/plugins/plugin-api.md in the Aurral repository.
 */
const plugin = createPlugin();

export default plugin;
