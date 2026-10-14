// routes/food.js
import { Router } from "express";
import { v4 as uuid } from "uuid";
import db from "../db/jsonDb.js";
import { verifyToken, requireRole } from "../middleware/auth.js";
import { onNewDonation } from "../services/autoMatcher.js";

const router = Router();

// GET /api/food — DONOR sees own; RECEIVER sees all active; ADMIN sees district
router.get("/", verifyToken, (req, res) => {
  const { status, donorId, district } = req.query;
  const now = Date.now();

  let listings = db.findMany("foodListings");

  // Expire old listings
  listings = listings.filter(l => l.expiryTime > now);

  if (req.user.role === "donor") {
    // Donor sees ONLY their own donations
    listings = listings.filter(l => l.donorId === req.user._id);
  } else if (req.user.role === "receiver") {
    // Receiver sees all available (but without private donor contact info)
    listings = listings
      .filter(l => l.status === "available" || l.status === "partial")
      .map(({ phone: _, donorId: __, ...safe }) => safe);
  } else if (req.user.role === "admin") {
    // Admin sees district listings
    if (req.user.district) {
      listings = listings.filter(l => l.district === req.user.district);
    }
  }

  if (status) listings = listings.filter(l => l.status === status);
  if (donorId && req.user.role === "admin") listings = listings.filter(l => l.donorId === donorId);

  res.json(listings);
});

// GET /api/food/:id
router.get("/:id", verifyToken, (req, res) => {
  const listing = db.findOne("foodListings", l => l._id === req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found" });

  // Donors see own listings with full info; receivers see without contact
  if (req.user.role === "receiver") {
    const { phone: _, ...safe } = listing;
    return res.json(safe);
  }
  res.json(listing);
});

// POST /api/food — create donation (donors only)
router.post("/", verifyToken, requireRole("donor"), async (req, res) => {
  try {
    const body = req.body || {};

    // Support all possible field name variants from any frontend version
    const description = body.description;
    const rawMeals    = body.totalMeals ?? body.quantity ?? body.meals;
    const rawExpiry   = body.expiryHours ?? body.expiry ?? body.expiryTime;
    const foodType    = body.foodType || "Veg";
    const category    = body.category || "Cooked Meals";
    const unit        = body.unit || "meals";
    const location    = body.location;
    const imageUrl    = body.imageUrl || null;

    const parsedMeals  = Number(rawMeals);
    const parsedExpiry = Number(rawExpiry);

    if (!description || String(description).trim() === "") {
      return res.status(400).json({ error: "description is required" });
    }
    if (!rawMeals || isNaN(parsedMeals) || parsedMeals < 1) {
      return res.status(400).json({ error: "totalMeals must be a positive number" });
    }
    if (!rawExpiry || isNaN(parsedExpiry) || parsedExpiry <= 0) {
      return res.status(400).json({ error: "expiryHours must be a positive number" });
    }

    const donor = db.findOne("users", u => u._id === req.user._id);

    const listing = {
      _id:           "fl_" + uuid(),
      donorId:       req.user._id,
      donorName:     donor?.name || "Unknown",
      donorType:     donor?.type || null,
      district:      donor?.district || null,
      foodType,
      category,
      totalMeals:    parsedMeals,
      remainingMeals: parsedMeals,
      unit,
      description:   String(description).trim(),
      expiryTime:    Date.now() + parsedExpiry * 3600000,
      location:      location || donor?.location || { lat: 14.9981, lng: 75.5681 },
      imageUrl,
      phone:         donor?.phone || null,
      status:        "available",
      createdAt:     Date.now()
    };

    db.insert("foodListings", listing);

    // Trigger auto-matching for pending requests
    setImmediate(() => onNewDonation(listing));

    res.status(201).json(listing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/food/:id — update a listing (donor owner only)
router.patch("/:id", verifyToken, requireRole("donor"), (req, res) => {
  const listing = db.findOne("foodListings", l => l._id === req.params.id);
  if (!listing) return res.status(404).json({ error: "Not found" });
  if (listing.donorId !== req.user._id) return res.status(403).json({ error: "Forbidden" });

  const allowed = ["description", "imageUrl", "expiryHours", "location"];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (req.body.expiryHours) {
    updates.expiryTime = Date.now() + parseFloat(req.body.expiryHours) * 3600000;
    delete updates.expiryHours;
  }

  const updated = db.updateOne("foodListings", l => l._id === req.params.id, () => updates);
  res.json(updated);
});

// DELETE /api/food/:id (admin or listing owner)
router.delete("/:id", verifyToken, (req, res) => {
  const listing = db.findOne("foodListings", l => l._id === req.params.id);
  if (!listing) return res.status(404).json({ error: "Not found" });

  if (req.user.role !== "admin" && listing.donorId !== req.user._id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  db.deleteOne("foodListings", l => l._id === req.params.id);
  res.json({ message: "Deleted" });
});

export default router;
