// db/jsonDb.js — Zero Hunger Connect v2 — lightweight JSON file database
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data.json");

const DEFAULT_DB = {
  users: [],
  admins: [],          // district admins (separate from users for uniqueness control)
  foodListings: [],
  requests: [],
  matches: [],
  matchHistory: [],    // archived completed matches
  notifications: [],
  districtAnalytics: {},
  analytics: {
    totalMealsSaved: 0,
    wastePreventedKg: 0,
    weeklyData: []
  }
};

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      return structuredClone(DEFAULT_DB);
    }
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    // Merge missing keys from DEFAULT_DB
    return { ...DEFAULT_DB, ...parsed };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export const db = {
  read: readDB,
  write: writeDB,

  findOne(collection, predicate) {
    const data = readDB();
    return (data[collection] || []).find(predicate) || null;
  },

  findMany(collection, predicate = () => true) {
    const data = readDB();
    return (data[collection] || []).filter(predicate);
  },

  insert(collection, doc) {
    const data = readDB();
    if (!data[collection]) data[collection] = [];
    data[collection].push(doc);
    writeDB(data);
    return doc;
  },

  updateOne(collection, predicate, updater) {
    const data = readDB();
    const idx = (data[collection] || []).findIndex(predicate);
    if (idx === -1) return null;
    data[collection][idx] = { ...data[collection][idx], ...updater(data[collection][idx]) };
    writeDB(data);
    return data[collection][idx];
  },

  updateMany(collection, predicate, updater) {
    const data = readDB();
    let count = 0;
    data[collection] = (data[collection] || []).map(doc => {
      if (predicate(doc)) { count++; return { ...doc, ...updater(doc) }; }
      return doc;
    });
    writeDB(data);
    return count;
  },

  deleteOne(collection, predicate) {
    const data = readDB();
    const before = (data[collection] || []).length;
    data[collection] = (data[collection] || []).filter(d => !predicate(d));
    writeDB(data);
    return before !== data[collection].length;
  },

  // Move item to matchHistory
  archiveMatch(matchId) {
    const data = readDB();
    const match = (data.matches || []).find(m => m._id === matchId);
    if (!match) return false;
    if (!data.matchHistory) data.matchHistory = [];
    data.matchHistory.push({ ...match, archivedAt: Date.now() });
    data.matches = (data.matches || []).filter(m => m._id !== matchId);
    writeDB(data);
    return true;
  },

  incrementAnalytic(field, amount = 1) {
    const data = readDB();
    if (!data.analytics) data.analytics = { totalMealsSaved: 0, wastePreventedKg: 0 };
    data.analytics[field] = (data.analytics[field] || 0) + amount;
    writeDB(data);
    return data.analytics;
  },

  getAnalytics() {
    return readDB().analytics || {};
  },

  // District analytics helpers
  updateDistrictAnalytics(district, updater) {
    const data = readDB();
    if (!data.districtAnalytics) data.districtAnalytics = {};
    const current = data.districtAnalytics[district] || {
      totalMatches: 0,
      mealsAllocated: 0,
      activeDonors: 0,
      activeReceivers: 0,
      emergencyRequests: 0,
      dailyData: []
    };
    data.districtAnalytics[district] = { ...current, ...updater(current) };
    writeDB(data);
    return data.districtAnalytics[district];
  },

  getDistrictAnalytics(district) {
    const data = readDB();
    return (data.districtAnalytics || {})[district] || null;
  }
};

export default db;
