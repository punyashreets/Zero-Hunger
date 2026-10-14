// routes/match.js
import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/jsonDb.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { runMatchingEngine } from "../services/matchingEngine.js";
import { notifyMatchPair, emitToUser, emitToDistrict } from "../services/notificationService.js";

const router = Router();

// POST /api/match/preview — run algorithm, return candidates (no DB write)
router.post("/preview", verifyToken, requireRole("receiver"), (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: "requestId required" });

  const request = db.findOne("requests", r => r._id === requestId);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.receiverId !== req.user._id) return res.status(403).json({ error: "Forbidden" });
  if (!["pending", "partial"].includes(request.status)) {
    return res.status(400).json({ error: "Request already fulfilled or cancelled" });
  }

  const donations = db.findMany(
    "foodListings",
    d => (d.status === "available" || d.status === "partial") && d.expiryTime > Date.now()
  );
  const result = runMatchingEngine(request, donations);

  res.json({ request, ...result });
});

// POST /api/match/confirm — manual confirm match, write to DB
router.post("/confirm", verifyToken, requireRole("receiver"), (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: "requestId required" });

  const request = db.findOne("requests", r => r._id === requestId);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.receiverId !== req.user._id) return res.status(403).json({ error: "Forbidden" });
  if (!["pending", "partial"].includes(request.status)) {
    return res.status(400).json({ error: "Already processed" });
  }

  const donations = db.findMany(
    "foodListings",
    d => (d.status === "available" || d.status === "partial") && d.expiryTime > Date.now()
  );
  const result = runMatchingEngine(request, donations);

  if (!result.allocations.length) {
    return res.status(422).json({ error: "No donors available for this request" });
  }

  const now = Date.now();
  const match = {
    _id:            "m_" + uuid(),
    requestId,
    receiverId:     request.receiverId,
    district:       request.district || null,
    allocations:    result.allocations,
    totalAllocated: result.totalAllocated,
    remaining:      result.remaining,
    covered:        result.covered,
    status:         "confirmed",
    autoMatched:    false,
    timestamp:      now
  };

  db.insert("matches", match);

  // Update request
  const newNeed = (request.remainingMealsNeeded ?? request.requiredMeals) - result.totalAllocated;
  const reqStatus = newNeed <= 0 ? "fulfilled" : "partial";
  db.updateOne("requests", r => r._id === requestId, () => ({
    status: reqStatus,
    remainingMealsNeeded: Math.max(0, newNeed),
    lastMatchedAt: now
  }));

  // Update donations & notify
  const receiver = db.findOne("users", u => u._id === request.receiverId);

  for (const alloc of result.allocations) {
    const donation = db.findOne("foodListings", d => d._id === alloc.donationId);
    if (!donation) continue;

    const prev = donation.remainingMeals ?? donation.totalMeals;
    const newRem = prev - alloc.allocated;
    db.updateOne("foodListings", d => d._id === alloc.donationId, () => ({
      remainingMeals: Math.max(0, newRem),
      status: newRem <= 0 ? "matched" : "partial",
      updatedAt: now
    }));

    const donor = db.findOne("users", u => u._id === alloc.donorId);
    if (donor && receiver) {
      notifyMatchPair({ match, request, donor, receiver, allocation: alloc });
      emitToUser(donor._id, "match_confirmed", {
        matchId: match._id, receiverName: receiver.name, allocated: alloc.allocated
      });
      emitToUser(receiver._id, "match_confirmed", {
        matchId: match._id, donorName: alloc.donorName, allocated: alloc.allocated,
        phone: alloc.donorPhone, location: alloc.donorLocation
      });
    }
  }

  if (request.district) {
    emitToDistrict(request.district, "new_match", { matchId: match._id });
  }

  db.incrementAnalytic("totalMealsSaved", result.totalAllocated);

  res.status(201).json({ match, result });
});

// GET /api/match — own matches for receiver/donor; district for admin
router.get("/", verifyToken, (req, res) => {
  let matches;
  if (req.user.role === "admin") {
    matches = req.user.district
      ? db.findMany("matches", m => m.district === req.user.district)
      : db.findMany("matches");
  } else if (req.user.role === "receiver") {
    matches = db.findMany("matches", m => m.receiverId === req.user._id);
  } else if (req.user.role === "donor") {
    // Donor sees matches where they are a donor in allocations
    matches = db.findMany("matches", m =>
      m.allocations?.some(a => a.donorId === req.user._id)
    );
    // Anonymize receiver info except for confirmed matches
    matches = matches.map(m => ({
      ...m,
      allocations: m.allocations.map(a => ({
        ...a,
        // Only show receiver contact if this donor is allocated
        donorPhone: undefined
      }))
    }));
  }
  res.json(matches || []);
});

// GET /api/match/history — completed/archived matches
router.get("/history", verifyToken, (req, res) => {
  let history = db.findMany("matchHistory");

  if (req.user.role === "receiver") {
    const myMatches = db.findMany("matches", m => m.receiverId === req.user._id).map(m => m._id);
    history = history.filter(h => myMatches.includes(h.matchId));
  } else if (req.user.role === "donor") {
    const myMatchIds = db.findMany("matches", m =>
      m.allocations?.some(a => a.donorId === req.user._id)
    ).map(m => m._id);
    history = history.filter(h => myMatchIds.includes(h.matchId));
  } else if (req.user.role === "admin" && req.user.district) {
    const districtMatchIds = db.findMany("matches", m => m.district === req.user.district).map(m => m._id);
    history = history.filter(h => districtMatchIds.includes(h.matchId));
  }

  res.json(history);
});

export default router;
