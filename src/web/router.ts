import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root.js";
import { indexRoute } from "./routes/index.js";
import { gameRoute } from "./routes/game.js";
import { aboutRoute } from "./routes/about.js";
import { tosRoute } from "./routes/tos.js";
import { privacyRoute } from "./routes/privacy.js";
import { bugsRoute, bugDetailRoute } from "./routes/bugs.js";
import { adminRoute } from "./routes/admin.js";
import { adminImagesRoute } from "./routes/admin-images.js";
import { adminAgentSessionsRoute } from "./routes/admin-agent-sessions.js";
import { adminAgentSessionDetailRoute } from "./routes/admin-agent-session-detail.js";

const routeTree = rootRoute.addChildren([
  indexRoute,
  gameRoute,
  aboutRoute,
  tosRoute,
  privacyRoute,
  bugsRoute,
  bugDetailRoute,
  adminRoute,
  adminImagesRoute,
  adminAgentSessionsRoute,
  adminAgentSessionDetailRoute,
]);

export const appRouter = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof appRouter;
  }
}
