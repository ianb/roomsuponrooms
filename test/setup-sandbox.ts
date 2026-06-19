// Loaded via .taprc node-arg before every test file: data-driven handlers run
// in the QuickJS sandbox (Worker Loader isn't available under Node).
import { setSandbox } from "../src/core/sandbox-host.js";
import { NodeQuickJsSandbox } from "../src/server/sandbox-quickjs.js";

setSandbox(new NodeQuickJsSandbox());
