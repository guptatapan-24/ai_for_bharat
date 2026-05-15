import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Intercept Clerk's session-refresh redirect handshake: this API server never
// serves HTML, so any redirect (307) Clerk issues should become a 401 JSON
// response instead. Without this, stale session cookies from a prior Clerk
// instance cause an infinite redirect loop in the API server logs.
app.use((_req, res, next) => {
  const original = res.redirect.bind(res);
  (res as any).redirect = (...args: Parameters<typeof original>) => {
    if (res.headersSent) return;
    res.status(401).json({ error: "Unauthorized" });
  };
  next();
});

// Use env-var keys directly — publishableKeyFromHost derives a wrong key
// from the Replit domain and breaks session verification in dev.
app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }),
);

app.use("/api", router);

export default app;
