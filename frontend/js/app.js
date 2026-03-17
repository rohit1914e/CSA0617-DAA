/**
 * app.js  v3
 * ==========
 * Bootstrap: startup loader → particle background → dashboard init
 *
 * v3 additions
 * ─────────────
 * • AircraftOverlay — persistent glowing SVG plane that stays on screen
 *   across all module transitions (Layer 4, z-index 300)
 * • Scroll-driven / parallax module transitions
 *   Layer 1 — bg grid (canvas)   moves slowest
 *   Layer 2 — network graph       slightly faster
 *   Layer 3 — UI panels           full speed (normal)
 *   Layer 4 — aircraft overlay    independent parallax
 * • Old "plane flies across" transition removed
 */

import { NetworkMap } from "./network-map.js";
import { DelayPropagationPanel } from "./delay-propagation.js";
import { ShortestPathPanel } from "./shortest-path.js";
import { PerformanceCharts } from "./performance-charts.js";
import { fetchGraph, fetchAirports } from "./api-client.js";

// ── Module instances ──────────────────────────────────────────────────────────
let mapMain, mapProp, mapSP;
let delayPanel, shortestPathPanel, perfCharts;

// ── Loader sequence ───────────────────────────────────────────────────────────
const LOADER_MESSAGES = [
    "Initialising systems…",
    "Loading flight schedule database…",
    "Building airport graph O(V + E)…",
    "Running Floyd-Warshall algorithm O(V³)…",
    "Calibrating delay propagation engine…",
    "Rendering dashboard…",
    "System ready ✓",
];

const MODULE_IDS = ["mod-data", "mod-graph", "mod-fw", "mod-sim", "mod-dash"];

function runLoader(onComplete) {
    initLoaderParticles();
    playRadarBeep();

    const bar = document.getElementById("loader-bar");
    const pct = document.getElementById("loader-pct");
    const status = document.getElementById("loader-status");
    const loader = document.getElementById("loader");

    let progress = 0;
    let msgIndex = 0;
    let modIndex = 0;
    const totalMs = 5000;
    const steps = 60;
    const intervalMs = totalMs / steps;

    const ticker = setInterval(() => {
        progress += 100 / steps;
        if (progress > 100) progress = 100;

        const p = Math.min(100, Math.round(progress));
        bar.style.width = p + "%";
        pct.textContent = p + "%";

        const mIdx = Math.floor((p / 100) * LOADER_MESSAGES.length);
        if (mIdx < LOADER_MESSAGES.length && mIdx !== msgIndex) {
            msgIndex = mIdx;
            status.textContent = LOADER_MESSAGES[mIdx];
        }

        const activeMod = Math.floor((p / 100) * MODULE_IDS.length);
        if (activeMod > modIndex) {
            for (let i = modIndex; i < activeMod && i < MODULE_IDS.length; i++) {
                document.getElementById(MODULE_IDS[i])?.classList.add("done");
            }
            modIndex = activeMod;
        }

        if (p >= 100) {
            clearInterval(ticker);
            status.textContent = "System ready ✓";
            MODULE_IDS.forEach(id => document.getElementById(id)?.classList.add("done"));
            setTimeout(() => {
                loader.classList.add("fade-out");
                setTimeout(onComplete, 800);
            }, 400);
        }
    }, intervalMs);
}

// ── Loader particle animation ─────────────────────────────────────────────────
function initLoaderParticles() {
    const canvas = document.getElementById("loader-particles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        a: Math.random(),
    }));

    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "rgba(0,180,255,0.04)";
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 50) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 50) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        particles.forEach((p) => {
            p.x = (p.x + p.vx + canvas.width) % canvas.width;
            p.y = (p.y + p.vy + canvas.height) % canvas.height;
            p.a += 0.01;
            const alpha = (Math.sin(p.a) * 0.4 + 0.6) * 0.5;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = "#00b4ff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        if (!document.getElementById("loader")?.classList.contains("fade-out")) {
            requestAnimationFrame(draw);
        }
    };
    draw();
}

// ── Dashboard particle background ─────────────────────────────────────────────
function initParticles() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 40 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.2 + 0.2,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        a: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
            p.x = (p.x + p.vx + canvas.width) % canvas.width;
            p.y = (p.y + p.vy + canvas.height) % canvas.height;
            p.a += 0.008;
            ctx.globalAlpha = (Math.sin(p.a) * 0.3 + 0.5) * 0.3;
            ctx.fillStyle = "#00b4ff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
        requestAnimationFrame(draw);
    };
    draw();
}

// ── Radar beep via Web Audio API ──────────────────────────────────────────────
function playRadarBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);

        setTimeout(() => {
            try {
                const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
                const osc2 = ctx2.createOscillator();
                const gain2 = ctx2.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx2.destination);
                osc2.type = "sine";
                osc2.frequency.setValueAtTime(1200, ctx2.currentTime);
                gain2.gain.setValueAtTime(0.1, ctx2.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.25);
                osc2.start(ctx2.currentTime);
                osc2.stop(ctx2.currentTime + 0.25);
            } catch (_) { }
        }, 2000);
    } catch (_) { /* Audio not supported — silent fail */ }
}

// ── Main initialisation ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    runLoader(initDashboard);
});

async function initDashboard() {
    const appEl = document.getElementById("app");
    appEl?.classList.remove("app-hidden");
    appEl?.classList.add("app-visible");

    initParticles();

    // ── NetworkMap instances ──────────────────────────────────────────────────
    mapMain = new NetworkMap("network-canvas");
    mapProp = new NetworkMap("prop-canvas");
    mapSP = new NetworkMap("sp-canvas");

    // ── Delay Propagation panel ───────────────────────────────────────────────
    delayPanel = new DelayPropagationPanel(mapProp, {
        airportSelectId: "prop-airport",
        delayInputId: "prop-delay",
        thresholdInputId: "prop-threshold",
        weatherSelectId: "prop-weather",
        speedRangeId: "prop-speed",
        runBtnId: "prop-run-btn",
        chainListId: "prop-chain-list",
        statsId: "prop-stats",
        statusId: "prop-status",
    });

    // ── Shortest path panel ───────────────────────────────────────────────────
    shortestPathPanel = new ShortestPathPanel(mapSP, {
        fromSelectId: "sp-from",
        toSelectId: "sp-to",
        findBtnId: "sp-find-btn",
        resultTableId: "sp-table",
        totalCostId: "sp-total-cost",
        pathStringId: "sp-path-string",
        timeMsId: "sp-time-info",
        statusId: "sp-status",
    });

    // ── Performance charts ────────────────────────────────────────────────────
    perfCharts = new PerformanceCharts({
        fwChartId: "chart-fw",
        graphChartId: "chart-graph",
        accuracyChartId: "chart-accuracy",
        statsId: "perf-startup-stats",
    });

    // ── Fetch data from backend ───────────────────────────────────────────────
    setConnectionStatus("connecting");
    try {
        const [graphData, airportsData] = await Promise.all([
            fetchGraph(),
            fetchAirports(),
        ]);

        mapMain.loadGraph(graphData);
        mapProp.loadGraph(graphData);
        mapSP.loadGraph(graphData);

        const airports = airportsData.airports || [];
        delayPanel.populateAirports(airports);
        shortestPathPanel.populateAirports(airports);

        updateNetworkStats(graphData);
        setConnectionStatus("connected");

        await perfCharts.load();

    } catch (err) {
        setConnectionStatus("error");
        console.error("[app] Backend connection failed:", err);
        showBackendError();
    }

    // ── Tab navigation with smooth parallax transitions ───────────────────────
    document.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            _switchTab(target);
        });
    });

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
        const tabMap = { "1": "map", "2": "propagation", "3": "shortest", "4": "performance" };
        if (tabMap[e.key]) _switchTab(tabMap[e.key]);
    });

    // ── Live clock ────────────────────────────────────────────────────────────
    const clockEl = document.getElementById("hud-clock");
    if (clockEl) {
        const tick = () => {
            clockEl.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });
        };
        tick();
        setInterval(tick, 1000);
    }
}

// ── Smooth parallax tab switch ────────────────────────────────────────────────
let _currentTab = "map";
let _transitioning = false;

function _switchTab(target) {
    if (target === _currentTab || _transitioning) return;
    _transitioning = true;
    _currentTab = target;

    const allBtns = document.querySelectorAll(".tab-btn");
    const allPanels = document.querySelectorAll(".tab-panel");

    // Active button
    allBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === target));

    // ── Phase 1: slide-out current panel ──────────────────────────────────────
    const activePanel = document.querySelector(".tab-panel.active");
    if (activePanel) {
        activePanel.classList.add("panel-exit");
        activePanel.style.setProperty("--slide-dir", "-1");
    }

    // ── Notify aircraft overlay ───────────────────────────────────────────────
    // (overlay removed)

    // ── Parallax: shift the background grid subtly ───────────────────────────
    _shiftParallaxLayers(target);

    setTimeout(() => {
        // Hide exiting panel
        allPanels.forEach((p) => {
            p.classList.remove("active", "panel-exit", "panel-enter");
        });

        // Show new panel with enter animation
        const nextPanel = document.getElementById(`tab-${target}`);
        if (nextPanel) {
            nextPanel.classList.add("active", "panel-enter");
            // Re-project maps
            setTimeout(() => {
                [mapMain, mapProp, mapSP].forEach((m) => m._resize());
                nextPanel.classList.remove("panel-enter");
                _transitioning = false;
            }, 450);
        } else {
            _transitioning = false;
        }

        if (target === "performance") perfCharts.load();
    }, 280);
}

// ── Parallax shift based on module ───────────────────────────────────────────
// Moves background layers (grid canvas, particle canvas) independently
// from the UI panels, creating depth.
const _parallaxOffsets = {
    map: { x: 0, y: 0, scaleBoost: 1.0 },
    propagation: { x: -18, y: 8, scaleBoost: 1.04 },
    shortest: { x: 14, y: -6, scaleBoost: 1.02 },
    performance: { x: 0, y: 20, scaleBoost: 0.98 },
};

function _shiftParallaxLayers(target) {
    const off = _parallaxOffsets[target] ?? { x: 0, y: 0, scaleBoost: 1 };

    // Layer 1 — background grid canvas (slowest, 0.3× speed)
    const pc = document.getElementById("particle-canvas");
    if (pc) {
        pc.style.transition = "transform 0.7s cubic-bezier(0.25,0.46,0.45,0.94)";
        pc.style.transform = `translate(${off.x * 0.3}px, ${off.y * 0.3}px)`;
    }

    // Layer 2 — left col (network map + panels, 0.7× speed)
    const leftCol = document.getElementById("left-col");
    if (leftCol) {
        leftCol.style.transition = "transform 0.55s cubic-bezier(0.25,0.46,0.45,0.94)";
        leftCol.style.transform = `translate(${off.x * 0.12}px, ${off.y * 0.12}px) scale(${off.scaleBoost})`;
        // Reset after settling
        setTimeout(() => {
            leftCol.style.transition = "transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94)";
            leftCol.style.transform = "translate(0,0) scale(1)";
        }, 600);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateNetworkStats(graphData) {
    const updates = {
        "hud-airports": graphData.num_vertices ?? "—",
        "hud-routes": graphData.num_edges ?? "—",
        "hud-build-ms": `${graphData.build_time_ms ?? "—"} ms`,
    };
    Object.entries(updates).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });
}

function setConnectionStatus(state) {
    const dot = document.getElementById("conn-dot");
    const text = document.getElementById("conn-text");
    if (!dot || !text) return;
    const MAP = {
        connecting: { cls: "connecting", label: "Connecting…" },
        connected: { cls: "connected", label: "Backend Online" },
        error: { cls: "error", label: "Backend Offline" },
    };
    const s = MAP[state] || MAP.error;
    dot.className = `conn-dot ${s.cls}`;
    text.textContent = s.label;
}

function showBackendError() {
    const overlay = document.getElementById("backend-error-overlay");
    if (overlay) overlay.style.display = "flex";
}
