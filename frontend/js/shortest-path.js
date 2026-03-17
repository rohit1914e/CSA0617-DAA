/**
 * shortest-path.js
 * ================
 * Shortest Path panel — calls Floyd-Warshall result from backend,
 * overlays gold animated path on the network map, shows hop table.
 */

import { fetchShortestPath } from "./api-client.js";

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
    this._bind();
  }

  populateAirports(airports) {
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
  }

  _bind() {
    const btn = document.getElementById(this.opts.findBtnId);
    if (btn) btn.addEventListener("click", () => this.findPath());
  }

  async findPath() {
    const from = document.getElementById(this.opts.fromSelectId)?.value;
    const to = document.getElementById(this.opts.toSelectId)?.value;
    if (!from || !to) return;

    this._setStatus("Computing…", "running");

    try {
      const data = await fetchShortestPath(from, to);

      if (!data.path || data.path.length === 0) {
        this._setStatus(data.error || "No path found", "error");
        this.map.highlightPath([]);
        return;
      }

      // Recalculate total cost from hop list as a reliable fallback
      // (guards against backend returning 0 or missing cost field)
      const hops = data.hops || [];
      let totalCost = typeof data.cost === "number" && data.cost > 0
        ? data.cost
        : hops.reduce((sum, h) => sum + (h.cost ?? 0), 0);
      totalCost = Math.round(totalCost * 100) / 100;

      if (totalCost === 0 && hops.length === 0) {
        console.warn("[ShortestPath] Zero cost and no hops — check API response:", data);
      }

      // Send to map
      this.map.highlightPath(data.path);

      // Update UI
      this._renderPathString(data.path);
      this._renderHopTable(hops, totalCost);
      this._setStatus(`Path found: ${data.path.length - 1} hop(s) — ${totalCost} min`, "done");

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

  _renderHopTable(hops, totalCost) {
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
        <td class="cost-cell">${h.cost}</td>
      </tr>
    `).join("");

    container.innerHTML = `
      <table class="hop-table">
        <thead>
          <tr><th>Hop</th><th>From</th><th>To</th><th>Cost (min)</th></tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right;font-weight:bold">Total</td>
            <td class="cost-cell total-cost">${totalCost}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const totalEl = document.getElementById(this.opts.totalCostId);
    if (totalEl) totalEl.textContent = `${totalCost} min`;
  }

  _setStatus(msg, type) {
    const el = document.getElementById(this.opts.statusId);
    if (!el) return;
    el.textContent = msg;
    el.className = `status-badge status-${type}`;
  }
}
