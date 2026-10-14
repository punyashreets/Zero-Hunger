// routes/auth.js
import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import db from "../db/jsonDb.js";
import { signToken, verifyToken } from "../middleware/auth.js";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const {
      name, email, password, role,
      type, phone, location, district
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password, role are required" });
    }

    const validRoles = ["donor", "receiver", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "role must be donor, receiver, or admin" });
    }

    // Check email uniqueness
    const existing = db.findOne("users", u => u.email === email);
    if (existing) return res.status(409).json({ error: "Email already registered" });

    // ── Admin: district uniqueness constraint ─────────────────────────────────
    if (role === "admin") {
      if (!district) {
        return res.status(400).json({ error: "district is required for admin registration" });
      }
      const districtAdmin = db.findOne("users", u => u.role === "admin" && u.district === district);
      if (districtAdmin) {
        return res.status(409).json({
          error: `An admin for district "${district}" already exists. Only one admin is allowed per district.`
        });
      }
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      _id:       "u_" + uuid(),
      name,
      email,
      password:  hashed,
      role,
      type:      type || null,
      phone:     phone || null,
      district:  district || null,
      location:  location || { lat: 14.9981, lng: 75.5681, address: "" },
      createdAt: Date.now()
    };

    db.insert("users", user);

    const { password: _, ...safeUser } = user;
    const token = signToken({ _id: user._id, role: user.role, email: user.email, district: user.district });
    res.status(201).json({ user: safeUser, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = db.findOne("users", u => u.email === email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const { password: _, ...safeUser } = user;
    const token = signToken({ _id: user._id, role: user.role, email: user.email, district: user.district });
    res.json({ user: safeUser, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", verifyToken, (req, res) => {
  const user = db.findOne("users", u => u._id === req.user._id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

// GET /api/auth/districts — list districts that already have an admin
router.get("/districts", (req, res) => {
  const admins = db.findMany("users", u => u.role === "admin");
  const takenDistricts = admins.map(a => a.district).filter(Boolean);
  res.json({ takenDistricts });
});

export default router;
