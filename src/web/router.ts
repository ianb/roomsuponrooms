import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root.js";
import { indexRoute } from "./routes/index.js";
import { gameRoute } from "./routes/game.js";

const routeTree = rootRoute.addChildren([indexRoute, gameRoute]);

export const appRouter = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof appRouter;
  }
}
