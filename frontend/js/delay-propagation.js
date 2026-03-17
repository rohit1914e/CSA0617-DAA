/**
 * delay-propagation.js
 * ====================
 * Controls the Delay Propagation panel.
 *
 * - Calls POST /api/simulate-delay
 * - Feeds propagation_steps to NetworkMap for animated replay
 * - Shows step-by-step chain list in the side panel
 * - Speed slider (0.5× – 4×)
 */

import { simulateDelay } from "./api-client.js";

export class DelayPropagationPanel {
    /**
     * @param {NetworkMap} networkMap  – shared instance
     * @param {object} opts
     *   airportSelectId  – <select> element id for airport picker
     *   delayInputId     – delay minutes <input>
     *   thresholdInputId – threshold <input>
     *   weatherSelectId  – weather override <select>
     *   speedRangeId     – speed slider <input[range]>
     *   runBtnId         – run button id
     *   chainListId      – <ul> element id for step chain
     *   statsId          – stats summary element id
     *   statusId         – status badge element id
     */
    constructor(networkMap, opts = {}) {
        this.map = networkMap;
        this.opts = opts;
        this.steps = [];
        this._timer = null;
        this._stepIndex = 0;
        this._speed = 1.0;

        this._bindControls();
    }

    populateAirports(airports) {
        const sel = document.getElementById(this.opts.airportSelectId);
        if (!sel) return;
        sel.innerHTML = airports.map((a) => `<option value="${a}">${a}</option>`).join("");
    }

    _bindControls() {
        const runBtn = document.getElementById(this.opts.runBtnId);
        if (runBtn) runBtn.addEventListener("click", () => this.run());

        const speedEl = document.getElementById(this.opts.speedRangeId);
        if (speedEl) {
            speedEl.addEventListener("input", () => {
                this._speed = parseFloat(speedEl.value);
                const label = document.getElementById(this.opts.speedRangeId + "-label");
                if (label) label.textContent = `${this._speed.toFixed(1)}×`;
            });
        }
    }

    async run() {
        const airport = document.getElementById(this.opts.airportSelectId)?.value || "JFK";
        const delay_min = parseInt(document.getElementById(this.opts.delayInputId)?.value || 45, 10);
        const threshold = parseInt(document.getElementById(this.opts.thresholdInputId)?.value || 15, 10);
        const weather = parseInt(document.getElementById(this.opts.weatherSelectId)?.value ?? 0, 10);

        this._setStatus("Simulating…", "running");

        try {
            const data = await simulateDelay({
                airport,
                delay_minutes: delay_min,
                threshold,
                weather,
                time_of_day: new Date().getHours(),
            });

            this.steps = data.propagation_steps || [];
            this._updateStats(data.prediction_summary, data.chain);
            this._renderChainList([]);

            if (this.steps.length === 0) {
                this._setStatus("No delays propagated", "idle");
                return;
            }

            this._setStatus(`${this.steps.length} airports affected`, "active");
            this._replaySteps();
        } catch (err) {
            this._setStatus("Error connecting to backend", "error");
            console.error(err);
        }
    }

    _replaySteps() {
        clearInterval(this._timer);
        this._stepIndex = 0;
        this.map.setPropagationHighlight(this.steps);

        const interval = Math.max(200, 800 / this._speed);
        this._timer = setInterval(() => {
            if (this._stepIndex >= this.steps.length) {
                clearInterval(this._timer);
                this._setStatus("Simulation complete ✓", "done");
                return;
            }

            // Reveal steps up to current index
            this._renderChainList(this.steps.slice(0, this._stepIndex + 1));
            this.map.advancePropStep();
            this._stepIndex++;
        }, interval);
    }

    _renderChainList(steps) {
        const ul = document.getElementById(this.opts.chainListId);
        if (!ul) return;
        ul.innerHTML = steps.map((s) => `
      <li class="chain-item ${s.step === 0 ? 'seed' : 'propagated'}">
        <span class="step-num">Step ${s.step}</span>
        <span class="step-airport">${s.airport}</span>
        <span class="step-delay">+${s.delay_added} min</span>
        <span class="step-reason">${s.reason.slice(0, 60)}…</span>
      </li>
    `).join("");
        ul.scrollTop = ul.scrollHeight;
    }

    _updateStats(stats, chain) {
        const el = document.getElementById(this.opts.statsId);
        if (!el || !stats) return;
        el.innerHTML = `
      <div class="stat-item"><span class="stat-label">Affected Flights</span><span class="stat-val">${stats.total_affected_flights ?? "—"}</span></div>
      <div class="stat-item"><span class="stat-label">Avg Delay</span><span class="stat-val">${stats.average_delay_minutes ?? "—"} min</span></div>
      <div class="stat-item"><span class="stat-label">Max Delay</span><span class="stat-val" style="color:#ff3d5a">${stats.max_delay_minutes ?? "—"} min</span></div>
      <div class="stat-item"><span class="stat-label">Most Affected</span><span class="stat-val">${stats.most_affected_airport ?? "—"}</span></div>
      <div class="stat-item"><span class="stat-label">Worst Weather</span><span class="stat-val">${stats.worst_weather_zone ?? "—"}</span></div>
      <div class="stat-item"><span class="stat-label">Propagation Depth</span><span class="stat-val">${stats.propagation_depth ?? "—"} hops</span></div>
    `;
    }

    _setStatus(msg, type) {
        const el = document.getElementById(this.opts.statusId);
        if (!el) return;
        el.textContent = msg;
        el.className = `status-badge status-${type}`;
    }
}
