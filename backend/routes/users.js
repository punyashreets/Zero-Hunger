// routes/users.js
import { Router } from "express";
import db from "../db/jsonDb.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/users — admin only
router.get("/", verifyToken, requireRole("admin"), (req, res) => {
  const users = db.findMany("users").map(({ password: _, ...u }) => u);
  res.json(users);
});

// DELETE /api/users/:id — admin only
router.delete("/:id", verifyToken, requireRole("admin"), (req, res) => {
  const user = db.findOne("users", u => u._id === req.params.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  if (user.role === "admin") return res.status(403).json({ error: "Cannot delete admin" });
  db.deleteOne("users", u => u._id === req.params.id);
  res.json({ message: "User deleted" });
});

export default router;


// routes/analytics.js (export inline)
export function analyticsRouter() {
  const r = Router();

  r.get("/", verifyToken, requireRole("admin"), (req, res) => {
    const data     = db.read();
    const users    = data.users || [];
    const listings = data.foodListings || [];
    const requests = data.requests || [];
    const matches  = data.matches || [];

    const byRole = ["donor", "receiver", "admin"].reduce((acc, role) => {
      acc[role] = users.filter(u => u.role === role).length;
      return acc;
    }, {});

    const byFoodType = listings.reduce((acc, l) => {
      acc[l.foodType] = (acc[l.foodType] || 0) + 1;
      return acc;
    }, {});

    const byListingStatus = listings.reduce((acc, l) => {
      const s = l.expiryTime < Date.now() ? "expired" : l.status;
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totals: {
        users:    users.length,
        listings: listings.length,
        requests: requests.length,
        matches:  matches.length,
        mealsSaved: data.analytics?.totalMealsSaved || 0
      },
      byRole,
      byFoodType,
      byListingStatus,
      matchRate: requests.length > 0
        ? Math.round(matches.length / requests.length * 100)
        : 0
    });
  });

  return r;
}
