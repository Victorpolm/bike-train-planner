import { handleParking } from "./parkingHandler.ts";
import { handleTimetable, type TimetableEnvironment } from "./timetableHandler.ts";
import type { Plugin } from "vite";
import { handleOjp } from "./ojpHandler.ts";

export function ojpDevelopment(key?: string, timetable: TimetableEnvironment = {}): Plugin {
  return { name: "server-only-ojp", configureServer(server) {
    server.middlewares.use(async (incoming, outgoing, next) => {
      if (!incoming.url?.startsWith("/api/ojp/") && !incoming.url?.startsWith("/api/timetable/") && incoming.url !== "/api/parking") return next();
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of incoming) {
          size += chunk.length;
          if (size > 8192) { outgoing.writeHead(413); outgoing.end(); return; }
          chunks.push(Buffer.from(chunk));
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(",") : value);
        const request = new Request(`http://${incoming.headers.host}${incoming.url}`, {
          method: incoming.method, headers,
          body: ["GET", "HEAD"].includes(incoming.method ?? "GET") ? undefined : Buffer.concat(chunks),
        });
        const response = incoming.url === "/api/parking" ? await handleParking(request)
          : incoming.url.startsWith("/api/timetable/") ? await handleTimetable(request, timetable) : await handleOjp(request, { OJP_API_KEY: key });
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch { outgoing.writeHead(500); outgoing.end("Service details unavailable"); }
    });
  } };
}
