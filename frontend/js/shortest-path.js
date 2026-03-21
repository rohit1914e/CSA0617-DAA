/**
 * shortest-path.js
 * ================
 * Shortest Path panel — calls Floyd-Warshall result from backend,
 * overlays gold animated path on the network map, shows hop table.
 */

import { fetchShortestPath } from "./api-client.js";

// ── Realistic flight duration helpers ────────────────────────────────────────

/**
 * Haversine formula — great-circle distance in km between two lat/lon points.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Convert km distance to realistic flight minutes.
 * Assumes 750 km/h cruise speed + 25 min fixed overhead
 * (taxi out, take-off climb, descent, taxi in).
 * Minimum 35 min for very short hops.
 */
function flightDurationMins(distKm) {
    const CRUISE_KM_PER_MIN = 750 / 60;   // ~12.5 km/min
    const OVERHEAD_MIN = 25;              // ground ops + approach
    return Math.max(35, Math.round(distKm / CRUISE_KM_PER_MIN + OVERHEAD_MIN));
}

/**
 * Format total minutes as "X h Y min" (e.g. "2 h 35 min").
 * For < 60 min returns "Y min".
 */
function formatDuration(totalMins) {
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
}

export class ShortestPathPanel {
  /**
   * @param {NetworkMap} networkMap
   * @param {object}     opts
   *   fromSelectId    – <select> for source airport
   *   toSelectId      – <select> for destination airport
   *   findBtnId       – find path button
   *   resultTableId   – <table> / container for hop table
   *   totalCostId     – element to show total cost
   *   pathStringId    – element showing "JFK → ORD → LAX"
   *   timeMsId        – element showing fw runtime
   *   statusId        – status element
   */
  constructor(networkMap, opts = {}) {
    this.map = networkMap;
    this.opts = opts;
    this._nodeCoords = {};  // iata → { lat, lon }
    this._bind();
  }

  populateAirports(airports, graphData) {
    ["fromSelectId", "toSelectId"].forEach((key) => {
      const sel = document.getElementById(this.opts[key]);
      if (!sel) return;
      sel.innerHTML = airports.map((a) => `<option value="${a}">${a}</option>`).join("");
    });
    // Default: DEL → BOM (both exist in the Indian dataset)
    const fromSel = document.getElementById(this.opts.fromSelectId);
    const toSel = document.getElementById(this.opts.toSelectId);
    if (fromSel) fromSel.value = airports.includes("DEL") ? "DEL" : airports[0] ?? "";
    if (toSel) toSel.value = airports.includes("BOM") ? "BOM" : airports[airports.length - 1] ?? "";

    // Store coordinates for flight duration calculation
    if (graphData && graphData.nodes) {
      graphData.nodes.forEach((n) => {
        this._nodeCoords[n.iata] = { lat: n.lat, lon: n.lon };
      });
    }
  }

  _bind() {
    const btn = document.getElementById(this.opts.findBtnId);
    if (btn) btn.addEventListener("click", () => this.findPath());
  }

  async findPath() {
    const from = document.getElementById(this.opts.fromSelectId)?.value;
    const to   = document.getElementById(this.opts.toSelectId)?.value;
    if (!from || !to) return;

    this._setStatus("Computing…", "running");

    try {
      const data = await fetchShortestPath(from, to);

      if (!data.path || data.path.length === 0) {
        this._setStatus(data.error || "No path found", "error");
        this.map.highlightPath([]);
        return;
      }

      // Recalculate total cost from hop list as reliable fallback
      const hops = data.hops || [];
      let totalCost = typeof data.cost === "number" && data.cost > 0
        ? data.cost
        : hops.reduce((sum, h) => sum + (h.cost ?? 0), 0);
      totalCost = Math.round(totalCost * 100) / 100;

      // ── Compute realistic flight durations from coordinates ──────────────
      const coords = this._nodeCoords;
      let totalRealisticMins = 0;
      const hopsWithDuration = data.path.slice(0, -1).map((iata, i) => {
        const nextIata = data.path[i + 1];
        const hop = hops[i] || {};
        let durationMins = 0;
        const c1 = coords[iata];
        const c2 = coords[nextIata];
        if (c1 && c2) {
          const km = haversineKm(c1.lat, c1.lon, c2.lat, c2.lon);
          durationMins = flightDurationMins(km);
        } else {
          // Fallback: use edge cost as proxy (already in minutes)
          durationMins = Math.max(35, Math.round(hop.cost ?? 60));
        }
        totalRealisticMins += durationMins;
        return {
          from: iata,
          to: nextIata,
          cost: hop.cost ?? 0,
          durationMins,
        };
      });

      // Add transit time for multi-hop journeys (30 min per layover)
      if (data.path.length > 2) {
        totalRealisticMins += (data.path.length - 2) * 30;
      }

      const formattedDuration = formatDuration(totalRealisticMins);

      // Send to map
      this.map.highlightPath(data.path);

      // Update UI
      this._renderPathString(data.path);
      this._renderHopTable(hopsWithDuration, totalCost, formattedDuration);
      this._setStatus(
        `Path found: ${data.path.length - 1} hop(s)  ·  ${formattedDuration} journey`,
        "done"
      );

      const timeEl = document.getElementById(this.opts.timeMsId);
      if (timeEl) timeEl.textContent = `Floyd-Warshall: ${data.floyd_warshall_time_ms ?? "—"} ms`;
    } catch (err) {
      this._setStatus("Backend error", "error");
      console.error(err);
    }
  }

  _renderPathString(path) {
    const el = document.getElementById(this.opts.pathStringId);
    if (!el) return;
    el.innerHTML = path
      .map((a, i) => `<span class="path-node">${a}</span>${i < path.length - 1 ? '<span class="path-arrow">→</span>' : ""}`)
      .join("");
  }

  _renderHopTable(hops, totalCost, formattedDuration) {
    const container = document.getElementById(this.opts.resultTableId);
    if (!container) return;

    if (!hops || hops.length === 0) {
      container.innerHTML = "<p class='no-data'>Same airport selected.</p>";
      return;
    }

    const rows = hops.map((h, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><span class="airport-badge">${h.from}</span></td>
        <td><span class="airport-badge">${h.to}</span></td>
        <td class="cost-cell duration-cell">${formatDuration(h.durationMins)}</td>
      </tr>
    `).join("");

    const totalLabel = formattedDuration
      ? `${formattedDuration}${hops.length > 1 ? " (incl. layovers)" : ""}`
      : "—";

    container.innerHTML = `
      <table class="hop-table">
        <thead>
          <tr><th>Hop</th><th>From</th><th>To</th><th>Flight Time</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right;font-weight:bold">Total Journey</td>
            <td class="cost-cell total-cost">${totalLabel}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const totalEl = document.getElementById(this.opts.totalCostId);
    if (totalEl) totalEl.textContent = formattedDuration || `${totalCost} min`;
  }

  _setStatus(msg, type) {
    const el = document.getElementById(this.opts.statusId);
    if (!el) return;
    el.textContent = msg;
    el.className = `status-badge status-${type}`;
  }
}
