// services/notificationService.js
import { v4 as uuid } from "uuid";
import db from "../db/jsonDb.js";

// In-app notification store
export function createNotification(userId, type, message, data = {}) {
  const notif = {
    _id:       "notif_" + uuid(),
    userId,
    type,       // "match_found", "match_confirmed", "partial_match", "new_request", "donation_updated"
    message,
    data,
    read:      false,
    createdAt: Date.now()
  };
  db.insert("notifications", notif);
  return notif;
}

export function getNotifications(userId) {
  return db.findMany("notifications", n => n.userId === userId)
           .sort((a, b) => b.createdAt - a.createdAt)
           .slice(0, 50);
}

export function markRead(notifId, userId) {
  return db.updateOne(
    "notifications",
    n => n._id === notifId && n.userId === userId,
    () => ({ read: true })
  );
}

export function markAllRead(userId) {
  return db.updateMany(
    "notifications",
    n => n.userId === userId && !n.read,
    () => ({ read: true })
  );
}

// Notify donor + receiver pair after match
export function notifyMatchPair({ match, request, donor, receiver, allocation }) {
  // Notify receiver
  createNotification(
    receiver._id,
    "match_confirmed",
    `Match found! ${allocation.donorName} will provide ${allocation.allocated} meals.`,
    {
      matchId:       match._id,
      donorName:     allocation.donorName,
      donorPhone:    allocation.donorPhone,
      donorLocation: allocation.donorLocation,
      quantity:      allocation.allocated,
      km:            allocation.km
    }
  );

  // Notify donor
  createNotification(
    donor._id,
    "match_confirmed",
    `Your donation matched with ${receiver.name}! ${allocation.allocated} meals allocated.`,
    {
      matchId:         match._id,
      receiverName:    receiver.name,
      receiverPhone:   receiver.phone,
      receiverLocation: request.location,
      quantity:        allocation.allocated
    }
  );
}

// Socket.IO emitter reference — set externally after server boot
let _io = null;
export function setSocketIO(io) { _io = io; }

export function emitToUser(userId, event, data) {
  if (_io) _io.to(`user:${userId}`).emit(event, data);
}

export function emitToDistrict(district, event, data) {
  if (_io) _io.to(`district:${district}`).emit(event, data);
}
