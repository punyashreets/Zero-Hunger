// server.js — Zero Hunger Connect API v2
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";

import authRouter from "./routes/auth.js";
import foodRouter from "./routes/food.js";
import requestsRouter from "./routes/requests.js";
import matchRouter from "./routes/match.js";
import notificationsRouter from "./routes/notifications.js";
import adminRouter from "./routes/admin.js";
import { setSocketIO } from "./services/notificationService.js";

const app    = express();
const server = createServer(app);
const PORT   = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "zero-hunger-connect-secret-v2";

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

setSocketIO(io);

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) return socket.disconnect();

  try {
    const user = jwt.verify(token, JWT_SECRET);
    socket.join(`user:${user._id}`);
    if (user.district) socket.join(`district:${user.district}`);
    socket.emit("connected", { userId: user._id });
  } catch {
    socket.disconnect();
  }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth",          authRouter);
app.use("/api/food",          foodRouter);
app.use("/api/requests",      requestsRouter);
app.use("/api/match",         matchRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/admin",         adminRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "2.0", timestamp: new Date().toISOString() });
});

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

server.listen(PORT, () => {
  console.log(`🌾 Zero Hunger Connect API v2 running at http://localhost:${PORT}`);
  console.log(`   Socket.IO enabled for real-time notifications`);
});
