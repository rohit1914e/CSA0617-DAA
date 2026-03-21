/**
 * performance-charts.js
 * =====================
 * Renders algorithm performance charts using Chart.js.
 *
 * Charts:
 *  1. Floyd-Warshall runtime vs. V (airports)     — line chart (log scale)
 *  2. Graph construction time vs. E (edges)        — bar chart
 *  3. Delay prediction accuracy vs. threshold      — line chart
 */

import { fetchPerformance } from "./api-client.js";

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            labels: { color: "#a8c8e8", font: { family: "Rajdhani", size: 12 } },
        },
        tooltip: {
            backgroundColor: "rgba(5,18,40,0.95)",
            titleColor: "#00b4ff",
            bodyColor: "#a8c8e8",
            borderColor: "#00b4ff",
            borderWidth: 1,
        },
    },
    scales: {
        x: {
            ticks: { color: "#6b8cae", font: { family: "Rajdhani" } },
            grid: { color: "rgba(0,180,255,0.07)" },
        },
        y: {
            ticks: { color: "#6b8cae", font: { family: "Rajdhani" } },
            grid: { color: "rgba(0,180,255,0.07)" },
        },
    },
};

export class PerformanceCharts {
    /**
     * @param {object} opts
     *   fwChartId      – canvas id for Floyd-Warshall chart
     *   graphChartId   – canvas id for graph construction chart
     *   accuracyChartId – canvas id for accuracy chart
     *   statsId        – startup time stats container
     */
    constructor(opts = {}) {
        this.opts = opts;
        this._charts = {};
    }

    async load() {
        try {
            const data = await fetchPerformance();
            this._renderFWChart(data.floyd_warshall || []);
            this._renderGraphChart(data.graph_construction || []);
            this._renderAccuracyChart(data.prediction_accuracy || []);
            this._renderStartupStats(data.startup_times || {});
        } catch (err) {
            console.error("Failed to load performance data:", err);
        }
    }

    _renderFWChart(fwData) {
        const ctx = document.getElementById(this.opts.fwChartId);
        if (!ctx || !fwData.length) return;
        if (this._charts.fw) this._charts.fw.destroy();

        const labels = fwData.map((d) => `${d.airports} airports`);
        const times = fwData.map((d) => d.time_ms);
        const theoretical = fwData.map((d) => (d.airports ** 3) / 5000000);

        this._charts.fw = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Actual Runtime (ms)",
                        data: times,
                        borderColor: "#00b4ff",
                        backgroundColor: "rgba(0,180,255,0.12)",
                        borderWidth: 2.5,
                        pointBackgroundColor: "#00b4ff",
                        pointRadius: 5,
                        tension: 0.4,
                        fill: true,
                    },
                    {
                        label: "Theoretical O(V³) (scaled)",
                        data: theoretical,
                        borderColor: "#ff3d5a",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        tension: 0.4,
                    },
                ],
            },
            options: {
                ...CHART_DEFAULTS,
                plugins: {
                    ...CHART_DEFAULTS.plugins,
                    title: {
                        display: true,
                        text: "Floyd-Warshall: Runtime vs Airports (V)",
                        color: "#00b4ff",
                        font: { size: 14, family: "Rajdhani", weight: "bold" },
                    },
                },
            },
        });
    }

    _renderGraphChart(graphData) {
        const ctx = document.getElementById(this.opts.graphChartId);
        if (!ctx || !graphData.length) return;
        if (this._charts.graph) this._charts.graph.destroy();

        const labels = graphData.map((d) => `${d.edges} edges`);
        const times = graphData.map((d) => d.time_ms);

        this._charts.graph = new Chart(ctx, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Graph Construction Time (ms)",
                        data: times,
                        backgroundColor: graphData.map((_, i) =>
                            `hsla(${160 + i * 10}, 90%, 55%, 0.75)`
                        ),
                        borderColor: "#00ff9f",
                        borderWidth: 1.5,
                        borderRadius: 4,
                    },
                ],
            },
            options: {
                ...CHART_DEFAULTS,
                plugins: {
                    ...CHART_DEFAULTS.plugins,
                    title: {
                        display: true,
                        text: "Graph Construction: Runtime vs Number of Edges (E)",
                        color: "#00ff9f",
                        font: { size: 14, family: "Rajdhani", weight: "bold" },
                    },
                },
            },
        });
    }

    _renderAccuracyChart(accData) {
        const ctx = document.getElementById(this.opts.accuracyChartId);
        if (!ctx || !accData.length) return;
        if (this._charts.accuracy) this._charts.accuracy.destroy();

        const labels = accData.map((d) => `Threshold ${d.threshold}`);
        const accuracy = accData.map((d) => d.accuracy_pct);
        const predicted = accData.map((d) => d.predicted_airports);
        const groundT = accData.map((d) => d.ground_truth);

        this._charts.accuracy = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Accuracy (%)",
                        data: accuracy,
                        borderColor: "#00ff9f",
                        backgroundColor: "rgba(0,255,159,0.1)",
                        borderWidth: 2.5,
                        pointBackgroundColor: "#00ff9f",
                        pointRadius: 5,
                        tension: 0.3,
                        fill: true,
                        yAxisID: "y",
                    },
                    {
                        label: "Predicted Affected",
                        data: predicted,
                        borderColor: "#00b4ff",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        pointRadius: 4,
                        tension: 0.3,
                        yAxisID: "y1",
                    },
                    {
                        label: "Ground Truth",
                        data: groundT,
                        borderColor: "#ffd700",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        yAxisID: "y1",
                    },
                ],
            },
            options: {
                ...CHART_DEFAULTS,
                plugins: {
                    ...CHART_DEFAULTS.plugins,
                    title: {
                        display: true,
                        text: "Delay Prediction Accuracy vs Propagation Threshold",
                        color: "#00ff9f",
                        font: { size: 14, family: "Rajdhani", weight: "bold" },
                    },
                },
                scales: {
                    ...CHART_DEFAULTS.scales,
                    y: {
                        ...CHART_DEFAULTS.scales.y,
                        position: "left",
                        title: { display: true, text: "Accuracy (%)", color: "#00ff9f" },
                        min: 60,
                        max: 100,
                    },
                    y1: {
                        ...CHART_DEFAULTS.scales.y,
                        position: "right",
                        title: { display: true, text: "# Airports", color: "#00b4ff" },
                        grid: { drawOnChartArea: false },
                    },
                },
            },
        });
    }

    _renderStartupStats(times) {
        const el = document.getElementById(this.opts.statsId);
        if (!el) return;
        el.innerHTML = `
      <div class="perf-stat">
        <span class="perf-label">Graph Build</span>
        <span class="perf-value">${times.graph_build_ms ?? "—"} ms</span>
        <span class="perf-complexity">O(V + E)</span>
      </div>
      <div class="perf-stat">
        <span class="perf-label">Floyd-Warshall</span>
        <span class="perf-value">${times.floyd_warshall_ms ?? "—"} ms</span>
        <span class="perf-complexity">O(V³)</span>
      </div>
    `;
    }
}
