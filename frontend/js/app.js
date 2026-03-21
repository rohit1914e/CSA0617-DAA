/**
 * app.js  v5
 * ==========
 * Single scrollable page:  Loader → Hero + Working Dashboard Sections
 *
 * No tab switching, no separate dashboard view.
 * All four features are inlined as scrollable sections.
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


// ══════════════════════════════════════════════════════════════════════════════
//  SCROLL & NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════

// ── Scroll Reveal with Intersection Observer ──────────────────────────────────
function initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px"
    });

    document.querySelectorAll(".scroll-reveal").forEach(el => {
        observer.observe(el);
    });
}

// ── Navbar scroll effect + active section highlighting ────────────────────────
function initNavbarScroll() {
    const nav = document.getElementById("landing-nav");
    if (!nav) return;

    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".landing-nav-link");

    const onScroll = () => {
        // Frosted glass darken on scroll
        if (window.scrollY > 80) {
            nav.classList.add("scrolled");
        } else {
            nav.classList.remove("scrolled");
        }

        // Highlight active section in nav
        let current = "";
        sections.forEach(sec => {
            const top = sec.offsetTop - 120;
            if (window.scrollY >= top) {
                current = sec.id;
            }
        });
        navLinks.forEach(link => {
            link.classList.remove("active");
            if (link.getAttribute("href") === `#${current}`) {
                link.classList.add("active");
            }
        });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
}

// ── Smooth scroll for all anchor links ────────────────────────────────────────
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"], button[id="hero-launch-btn"], button[id="nav-launch-btn"]').forEach(el => {
        el.addEventListener("click", (e) => {
            let targetId;

            // Launch Dashboard buttons → scroll to network map
            if (el.id === "hero-launch-btn" || el.id === "nav-launch-btn") {
                e.preventDefault();
                targetId = "sec-network";
            } else {
                const href = el.getAttribute("href");
                if (href && href.startsWith("#")) {
                    e.preventDefault();
                    targetId = href.slice(1);
                }
            }

            if (targetId) {
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            }
        });
    });
}


// ══════════════════════════════════════════════════════════════════════════════
//  MAIN INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
    runLoader(() => {
        // Show the main page
        const mainPage = document.getElementById("main-page");
        mainPage.classList.remove("main-page-hidden");
        mainPage.classList.add("main-page-visible");

        // Start particles
        initParticles();

        // Init scroll features
        initScrollReveal();
        initNavbarScroll();
        initSmoothScroll();

        // Init live clock
        const clockEl = document.getElementById("hud-clock");
        if (clockEl) {
            const tick = () => {
                clockEl.textContent = new Date().toLocaleTimeString("en-US", { hour12: false });
            };
            tick();
            setInterval(tick, 1000);
        }

        // Initialize all dashboard components
        initAllDashboard();
    });
});


// ── Dashboard core init ───────────────────────────────────────────────────────
async function initAllDashboard() {
    // ── NetworkMap instances ──────────────────────────────────────────────────
    mapMain = new NetworkMap("network-canvas");
    mapSP = new NetworkMap("sp-canvas");
    mapProp = new NetworkMap("prop-canvas");

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
        shortestPathPanel.populateAirports(airports, graphData);

        updateNetworkStats(graphData);
        setConnectionStatus("connected");

        await perfCharts.load();

    } catch (err) {
        setConnectionStatus("error");
        console.error("[app] Backend connection failed:", err);
        showBackendError();
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
