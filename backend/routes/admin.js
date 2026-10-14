// routes/admin.js
import { Router } from "express";
import db from "../db/jsonDb.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/admin/analytics — district admin analytics
router.get("/analytics", verifyToken, requireRole("admin"), (req, res) => {
  const district = req.user.district;
  const data = db.read();
  const now  = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 3600000;

  // Filter by district
  const filterByDistrict = arr =>
    district ? arr.filter(x => x.district === district) : arr;

  const users    = filterByDistrict(data.users || []);
  const listings = filterByDistrict(data.foodListings || []);
  const requests = filterByDistrict(data.requests || []);
  const matches  = filterByDistrict(data.matches || []);
  const history  = data.matchHistory || [];

  // Active (non-expired)
  const activeDonations = listings.filter(l =>
    l.expiryTime > now && (l.status === "available" || l.status === "partial")
  );
  const activeRequests = requests.filter(r => r.status === "pending" || r.status === "partial");
  const emergencyRequests = activeRequests.filter(r =>
    r.urgencyLevel === "less_than_1h" || r.urgencyLevel === "1_2h"
  );

  // Last 30 days matching data (day-by-day)
  const matchesLast30 = matches.filter(m => m.timestamp > thirtyDaysAgo);
  const dailyMap = {};
  for (const m of matchesLast30) {
    const day = new Date(m.timestamp).toISOString().slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { date: day, matches: 0, meals: 0 };
    dailyMap[day].matches++;
    dailyMap[day].meals += m.totalAllocated || 0;
  }
  const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // Food type distribution
  const foodTypeMap = listings.reduce((acc, l) => {
    acc[l.foodType] = (acc[l.foodType] || 0) + 1;
    return acc;
  }, {});

  res.json({
    summary: {
      totalDonors:       users.filter(u => u.role === "donor").length,
      totalReceivers:    users.filter(u => u.role === "receiver").length,
      activeDonations:   activeDonations.length,
      activeRequests:    activeRequests.length,
      emergencyRequests: emergencyRequests.length,
      totalMatchesToday: matches.filter(m => {
        const today = new Date().toDateString();
        return new Date(m.timestamp).toDateString() === today;
      }).length,
      totalMealsAllocated: matches.reduce((s, m) => s + (m.totalAllocated || 0), 0),
      totalMatches:        matches.length
    },
    dailyData,
    foodTypeDistribution: foodTypeMap,
    matchCoverage: requests.length
      ? Math.round(requests.filter(r => r.status === "fulfilled").length / requests.length * 100)
      : 0,
    district
  });
});

// GET /api/admin/users — district users
router.get("/users", verifyToken, requireRole("admin"), (req, res) => {
  const district = req.user.district;
  let users = db.findMany("users", u =>
    district ? u.district === district || !u.district : true
  );
  // Strip passwords
  users = users.map(({ password: _, ...u }) => u);
  res.json(users);
});

// GET /api/admin/donations — all district donations including expired
router.get("/donations", verifyToken, requireRole("admin"), (req, res) => {
  const district = req.user.district;
  const listings = district
    ? db.findMany("foodListings", l => l.district === district)
    : db.findMany("foodListings");
  res.json(listings);
});

// GET /api/admin/requests — all district requests
router.get("/requests", verifyToken, requireRole("admin"), (req, res) => {
  const district = req.user.district;
  const requests = district
    ? db.findMany("requests", r => r.district === district)
    : db.findMany("requests");
  res.json(requests);
});

// GET /api/admin/matches — all district matches
router.get("/matches", verifyToken, requireRole("admin"), (req, res) => {
  const district = req.user.district;
  const matches = district
    ? db.findMany("matches", m => m.district === district)
    : db.findMany("matches");
  res.json(matches);
});

export default router;
