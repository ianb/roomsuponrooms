import { resolve } from "node:path";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { setStorage } from "./storage-instance.js";
import { FileStorage } from "./storage-file.js";
import { appRouter } from "./router.js";

// Register games from disk (fs-based)
import "../games/test-world.js";
import "../games/colossal-cave/index.js";
import "../games/the-aaru/index.js";

// Configure file-based storage
setStorage(new FileStorage(resolve(process.cwd(), "data")));

const server = Fastify();

server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter },
});

const port = Number(process.env["PORT"]) || 3001;

server.listen({ port, host: "0.0.0.0" }).then((address) => {
  console.log(`Server listening at ${address}`);
});
