/**
 * api-client.js
 * =============
 * Thin fetch wrapper for the Flask backend REST API.
 *
 * All functions return Promises resolving to parsed JSON.
 * BASE_URL is auto-detected: localhost:5000 for development.
 */

export const BASE_URL = "http://localhost:5000";

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

/** Fetch the full airport graph (nodes + edges + coordinates). */
export const fetchGraph = () => _get("/api/graph");

/** Fetch list of airport codes for dropdowns. */
export const fetchAirports = () => _get("/api/airports");

/**
 * Fetch shortest path between two airports.
 * @param {string} from  – IATA code
 * @param {string} to    – IATA code
 */
export const fetchShortestPath = (from, to) =>
  _get(`/api/shortest-path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

/**
 * Start a delay propagation simulation.
 * @param {object} params – { airport, delay_minutes, threshold, weather, time_of_day }
 */
export const simulateDelay = (params) => _post("/api/simulate-delay", params);

/** Get prediction table from last simulation. */
export const fetchPredictions = () => _get("/api/predictions");

/** Get algorithm runtime benchmark data. */
export const fetchPerformance = () => _get("/api/performance");
