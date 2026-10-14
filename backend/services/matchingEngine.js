// services/matchingEngine.js — Smart Food Allocation Engine v2

// ── Geo distance (Haversine formula) ─────────────────────────────────────────
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── Urgency level → score mapping ────────────────────────────────────────────
// Higher urgency = higher score (0..1)
const URGENCY_SCORES = {
  "less_than_1h":  1.0,
  "1_2h":          0.8,
  "2_3h":          0.6,
  "4_5h":          0.4,
  "more_than_5h":  0.2
};

export function urgencyScore(level) {
  return URGENCY_SCORES[level] ?? 0.5;
}

// ── Expiry score for a donation ───────────────────────────────────────────────
// Near expiry = high score (needs to be allocated ASAP)
export function expiryScore(expiryTime) {
  const hoursLeft = (expiryTime - Date.now()) / 3600000;
  if (hoursLeft <= 0)   return 0;    // already expired
  if (hoursLeft < 1)    return 1.0;  // critical
  if (hoursLeft < 2)    return 0.85;
  if (hoursLeft < 3)    return 0.65;
  if (hoursLeft < 5)    return 0.45;
  if (hoursLeft < 8)    return 0.25;
  return 0.1;
}

// ── Distance score ────────────────────────────────────────────────────────────
// Shorter distance = higher score
export function distanceScore(km) {
  if (km < 1)   return 1.0;
  if (km < 2)   return 0.9;
  if (km < 5)   return 0.7;
  if (km < 10)  return 0.5;
  if (km < 20)  return 0.3;
  return 0.1;
}

// ── Demand score ──────────────────────────────────────────────────────────────
// Higher remaining need = higher demand score (up to cap)
export function demandScore(needed, available) {
  const ratio = needed / Math.max(available, 1);
  return Math.min(ratio, 1.0);
}

// ── Composite priority score for (donation, request) pair ────────────────────
// priorityScore = (urgency*0.4) + (expiry*0.3) + (distance*0.2) + (demand*0.1)
export function computePriorityScore(donation, request) {
  const uScore = urgencyScore(request.urgencyLevel);
  const eScore = expiryScore(donation.expiryTime);
  const km     = haversineKm(
    donation.location.lat, donation.location.lng,
    request.location.lat,  request.location.lng
  );
  const dScore = distanceScore(km);
  const dmScore = demandScore(
    request.remainingMealsNeeded ?? request.requiredMeals,
    donation.remainingMeals ?? donation.totalMeals
  );

  const score = (uScore * 0.4) + (eScore * 0.3) + (dScore * 0.2) + (dmScore * 0.1);
  return {
    score: Math.round(score * 100) / 100,
    breakdown: { urgency: uScore, expiry: eScore, distance: dScore, demand: dmScore },
    km: Math.round(km * 10) / 10
  };
}

// ── Main matching engine ──────────────────────────────────────────────────────
/**
 * Given a request and all available donations, compute optimal allocation.
 *
 * Returns:
 * {
 *   allocations: [{ donationId, donorId, donorName, allocated, km, score }],
 *   totalAllocated: number,
 *   remaining: number,          // shortfall
 *   covered: boolean
 * }
 */
export function runMatchingEngine(request, allDonations) {
  const now = Date.now();
  const needed = request.remainingMealsNeeded ?? request.requiredMeals;

  // 1. Filter: available, not expired, matching food preference
  let candidates = allDonations.filter(d => {
    if (d.status !== "available" && d.status !== "partial") return false;
    if (d.expiryTime <= now) return false;
    const remaining = d.remainingMeals ?? d.totalMeals;
    if (remaining <= 0) return false;
    if (request.foodPreference && request.foodPreference !== "Any") {
      if (d.foodType !== request.foodPreference) return false;
    }
    return true;
  });

  // 2. Score each candidate
  candidates = candidates.map(d => {
    const { score, breakdown, km } = computePriorityScore(d, request);
    return { ...d, _score: score, _breakdown: breakdown, _km: km };
  });

  // 3. Sort by score DESC, then by expiry ASC (most urgent first)
  candidates.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return a.expiryTime - b.expiryTime;
  });

  // 4. Dynamic allocation
  const allocations = [];
  let remaining = needed;

  for (const donation of candidates) {
    if (remaining <= 0) break;
    const available = donation.remainingMeals ?? donation.totalMeals;
    const allocate  = Math.min(available, remaining);
    allocations.push({
      donationId: donation._id,
      donorId:    donation.donorId,
      donorName:  donation.donorName,
      donorPhone: donation.phone,
      donorLocation: donation.location,
      allocated:  allocate,
      km:         donation._km,
      score:      donation._score,
      breakdown:  donation._breakdown,
      expiryTime: donation.expiryTime
    });
    remaining -= allocate;
  }

  return {
    allocations,
    totalAllocated: needed - Math.max(0, remaining),
    remaining: Math.max(0, remaining),
    covered: remaining <= 0
  };
}
