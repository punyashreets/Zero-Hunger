// routes/notifications.js
import { Router } from "express";
import { verifyToken } from "../middleware/auth.js";
import { getNotifications, markRead, markAllRead } from "../services/notificationService.js";

const router = Router();

// GET /api/notifications — own notifications
router.get("/", verifyToken, (req, res) => {
  const notifs = getNotifications(req.user._id);
  res.json(notifs);
});

// PATCH /api/notifications/read-all  ← MUST come BEFORE /:id/read
// (otherwise Express would match "read-all" as the :id param)
router.patch("/read-all", verifyToken, (req, res) => {
  const count = markAllRead(req.user._id);
  res.json({ marked: count });
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", verifyToken, (req, res) => {
  const updated = markRead(req.params.id, req.user._id);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

export default router;
