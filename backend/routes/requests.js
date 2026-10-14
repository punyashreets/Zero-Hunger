// routes/requests.js
import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/jsonDb.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { onNewRequest } from "../services/autoMatcher.js";

const router = Router();

// GET /api/requests
router.get("/", verifyToken, (req, res) => {
  const { status } = req.query;

  let requests;
  if (req.user.role === "admin") {
    // Admin sees only district requests
    requests = req.user.district
      ? db.findMany("requests", r => r.district === req.user.district)
      : db.findMany("requests");
  } else if (req.user.role === "receiver") {
    // Receiver sees ONLY their own
    requests = db.findMany("requests", r => r.receiverId === req.user._id);
  } else if (req.user.role === "donor") {
    // Donor sees active requests (anonymized — no contact info)
    requests = db.findMany("requests", r => r.status === "pending" || r.status === "partial")
      .map(({ receiverPhone: _, ...safe }) => safe);
  } else {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (status) requests = requests.filter(r => r.status === status);

  res.json(requests);
});

// GET /api/requests/:id
router.get("/:id", verifyToken, (req, res) => {
  const request = db.findOne("requests", r => r._id === req.params.id);
  if (!request) return res.status(404).json({ error: "Not found" });

  // Receiver: own only; Admin: district; Donor: can see (anonymized)
  if (req.user.role === "receiver" && request.receiverId !== req.user._id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json(request);
});

// POST /api/requests — create request (receivers only)
router.post("/", verifyToken, requireRole("receiver"), async (req, res) => {
  try {
    const body = req.body || {};

    // Support all possible field name variants
    const rawMeals    = body.requiredMeals ?? body.meals ?? body.quantity;
    const urgencyLevel = body.urgencyLevel || "more_than_5h";
    const foodPreference = body.foodPreference || "Any";
    const notes        = body.notes || "";
    const unit         = body.unit || "meals";
    const location     = body.location;

    const parsedMeals = Number(rawMeals);

    if (!rawMeals || isNaN(parsedMeals) || parsedMeals < 1) {
      return res.status(400).json({ error: "requiredMeals must be a positive number" });
    }

    // Accept all known urgency value formats from any frontend version
    const ALL_URGENCY = [
      "less_than_1h", "1_2h", "2_3h", "4_5h", "more_than_5h",  // current frontend
      "lt1h", "1-2h", "2-3h", "4-5h", "gt5h"                   // legacy variants
    ];
    const normalizedUrgency = ALL_URGENCY.includes(urgencyLevel) ? urgencyLevel : "more_than_5h";

    const receiver = db.findOne("users", u => u._id === req.user._id);

    const request = {
      _id:                  "req_" + uuid(),
      receiverId:           req.user._id,
      receiverName:         receiver?.name || "Unknown",
      receiverType:         receiver?.type || null,
      receiverPhone:        receiver?.phone || null,
      district:             receiver?.district || null,
      requiredMeals:        parsedMeals,
      remainingMealsNeeded: parsedMeals,
      unit,
      foodPreference,
      urgencyLevel:         normalizedUrgency,
      location:             location || receiver?.location || { lat: 14.9981, lng: 75.5681 },
      notes,
      status:               "pending",
      createdAt:            Date.now()
    };

    db.insert("requests", request);

    // Trigger auto-matching immediately
    setImmediate(() => onNewRequest(request));

    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/requests/:id — cancel request (own or admin)
router.patch("/:id/cancel", verifyToken, (req, res) => {
  const request = db.findOne("requests", r => r._id === req.params.id);
  if (!request) return res.status(404).json({ error: "Not found" });

  if (req.user.role !== "admin" && request.receiverId !== req.user._id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const updated = db.updateOne(
    "requests", r => r._id === req.params.id,
    () => ({ status: "cancelled" })
  );
  res.json(updated);
});

export default router;
