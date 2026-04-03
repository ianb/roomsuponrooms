import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root.js";
import { indexRoute } from "./routes/index.js";
import { gameRoute } from "./routes/game.js";
import { aboutRoute } from "./routes/about.js";
import { tosRoute } from "./routes/tos.js";
import { privacyRoute } from "./routes/privacy.js";
import { bugsRoute, bugDetailRoute } from "./routes/bugs.js";

const routeTree = rootRoute.addChildren([
  indexRoute,
  gameRoute,
  aboutRoute,
  tosRoute,
  privacyRoute,
  bugsRoute,
  bugDetailRoute,
]);

export const appRouter = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof appRouter;
  }
}
