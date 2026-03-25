/**
 * api-client.js
 * =============
 * Thin fetch wrapper for the Flask backend REST API.
 */

export const BASE_URL = "";  // ✅ FIXED

async function _get(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error(`GET ${endpoint} → ${res.status}`);
  return res.json();
}

async function _post(endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} → ${res.status}`);
  return res.json();
}

export const fetchGraph = () => _get("/api/graph");

export const fetchAirports = () => _get("/api/airports");

export const fetchShortestPath = (from, to) =>
  _get(`/api/shortest-path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const simulateDelay = (params) => _post("/api/simulate-delay", params);

export const fetchPredictions = () => _get("/api/predictions");

export const fetchPerformance = () => _get("/api/performance");