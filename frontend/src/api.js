// src/api.js — Zero Hunger Connect API client v2
const BASE = "/api";

function getToken() {
  return localStorage.getItem("zhc_token");
}

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Auth
  register: (body)          => req("POST", "/auth/register", body),
  login: (body)             => req("POST", "/auth/login", body),
  me: ()                    => req("GET", "/auth/me"),
  districts: ()             => req("GET", "/auth/districts"),

  // Food listings
  getFood: (params = {})    => req("GET", "/food?" + new URLSearchParams(params)),
  getFoodById: (id)         => req("GET", "/food/" + id),
  createFood: (body)        => req("POST", "/food", body),
  updateFood: (id, body)    => req("PATCH", "/food/" + id, body),
  deleteFood: (id)          => req("DELETE", "/food/" + id),

  // Requests
  getRequests: (params = {}) => req("GET", "/requests?" + new URLSearchParams(params)),
  getRequest: (id)           => req("GET", "/requests/" + id),
  createRequest: (body)      => req("POST", "/requests", body),
  cancelRequest: (id)        => req("PATCH", "/requests/" + id + "/cancel"),

  // Matching
  previewMatch: (requestId)  => req("POST", "/match/preview", { requestId }),
  confirmMatch: (requestId)  => req("POST", "/match/confirm", { requestId }),
  getMatches: ()             => req("GET", "/match"),
  getMatchHistory: ()        => req("GET", "/match/history"),

  // Notifications
  getNotifications: ()       => req("GET", "/notifications"),
  markRead: (id)             => req("PATCH", "/notifications/" + id + "/read"),
  markAllRead: ()            => req("PATCH", "/notifications/read-all"),

  // Admin
  adminAnalytics: ()         => req("GET", "/admin/analytics"),
  adminUsers: ()             => req("GET", "/admin/users"),
  adminDonations: ()         => req("GET", "/admin/donations"),
  adminRequests: ()          => req("GET", "/admin/requests"),
  adminMatches: ()           => req("GET", "/admin/matches"),
};

export default api;
