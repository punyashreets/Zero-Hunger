// services/autoMatcher.js — triggers whenever a new donation or request arrives
import { v4 as uuid } from "uuid";
import db from "../db/jsonDb.js";
import { runMatchingEngine } from "./matchingEngine.js";
import { notifyMatchPair, emitToUser, emitToDistrict } from "./notificationService.js";

/**
 * Called after a new donation is posted — try to fulfil pending requests.
 */
export async function onNewDonation(donation) {
  const pendingRequests = db.findMany(
    "requests",
    r => r.status === "pending" || r.status === "partial"
  );

  for (const request of pendingRequests) {
    if ((request.remainingMealsNeeded ?? request.requiredMeals) <= 0) continue;
    await attemptAutoMatch(request, [donation]);
  }
}

/**
 * Called after a new request is posted — try to satisfy from available donations.
 */
export async function onNewRequest(request) {
  const allDonations = db.findMany(
    "foodListings",
    d => (d.status === "available" || d.status === "partial") && d.expiryTime > Date.now()
  );
  await attemptAutoMatch(request, allDonations);
}

/**
 * Core auto-match routine for one request against a set of donations.
 */
async function attemptAutoMatch(request, donations) {
  if (!donations.length) return;

  const result = runMatchingEngine(request, donations);
  if (!result.allocations.length) return;

  const now = Date.now();
  const match = {
    _id:       "m_" + uuid(),
    requestId: request._id,
    receiverId: request.receiverId,
    district:  request.district || null,
    allocations: result.allocations,
    totalAllocated: result.totalAllocated,
    remaining: result.remaining,
    covered:   result.covered,
    status:    "confirmed",
    autoMatched: true,
    timestamp: now
  };

  db.insert("matches", match);

  // Update request: remaining need
  const newRemainingNeed = (request.remainingMealsNeeded ?? request.requiredMeals) - result.totalAllocated;
  const requestStatus = newRemainingNeed <= 0 ? "fulfilled" : "partial";

  db.updateOne(
    "requests",
    r => r._id === request._id,
    () => ({
      status: requestStatus,
      remainingMealsNeeded: Math.max(0, newRemainingNeed),
      lastMatchedAt: now
    })
  );

  // Update each donation: reduce remaining meals, update status
  for (const alloc of result.allocations) {
    const donation = db.findOne("foodListings", d => d._id === alloc.donationId);
    if (!donation) continue;

    const prevRemaining = donation.remainingMeals ?? donation.totalMeals;
    const newRemaining  = prevRemaining - alloc.allocated;
    const donationStatus = newRemaining <= 0 ? "matched" : "partial";

    db.updateOne(
      "foodListings",
      d => d._id === alloc.donationId,
      () => ({
        remainingMeals: Math.max(0, newRemaining),
        status: donationStatus,
        updatedAt: now
      })
    );

    // Clean up fully used donations — move to history implied by status
    if (donationStatus === "matched") {
      db.insert("matchHistory", {
        type:        "donation_fulfilled",
        donationId:  donation._id,
        matchId:     match._id,
        archivedAt:  now
      });
    }

    // Notify donor
    const donor = db.findOne("users", u => u._id === alloc.donorId);
    const receiver = db.findOne("users", u => u._id === request.receiverId);

    if (donor && receiver) {
      notifyMatchPair({
        match,
        request,
        donor,
        receiver,
        allocation: alloc
      });

      emitToUser(donor._id, "match_confirmed", {
        matchId: match._id,
        receiverName: receiver.name,
        allocated: alloc.allocated,
        location: request.location
      });

      emitToUser(receiver._id, "match_confirmed", {
        matchId: match._id,
        donorName: alloc.donorName,
        allocated: alloc.allocated,
        location: alloc.donorLocation,
        phone: alloc.donorPhone
      });
    }

    // Emit to district admin room
    if (request.district) {
      emitToDistrict(request.district, "new_match", { matchId: match._id });
    }
  }

  // Clean up fulfilled request
  if (requestStatus === "fulfilled") {
    db.insert("matchHistory", {
      type:       "request_fulfilled",
      requestId:  request._id,
      matchId:    match._id,
      archivedAt: now
    });
  }

  // Update analytics
  db.incrementAnalytic("totalMealsSaved", result.totalAllocated);

  // Update district analytics
  if (request.district) {
    db.updateDistrictAnalytics(request.district, current => ({
      totalMatches:  current.totalMatches + 1,
      mealsAllocated: current.mealsAllocated + result.totalAllocated
    }));
  }

  return match;
}
