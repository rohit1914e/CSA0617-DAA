"""
api.py
======
Flask REST API — Flight Delay Prediction System

Run with:
    python backend/api.py

Endpoints:
    GET  /api/graph                  → airport nodes + edges
    GET  /api/shortest-path?from=X&to=Y → reconstructed path
    POST /api/simulate-delay         → BFS propagation steps
    GET  /api/predictions            → prediction table (last simulation)
    GET  /api/performance            → algorithm runtime benchmarks
    GET  /                           → health check

CORS is enabled for localhost frontend access.
"""

import os
import sys
import time
import pathlib

# ── Ensure backend directory is on the path ───────────────────────────────────
ROOT = pathlib.Path(__file__).parent.parent
BACKEND = pathlib.Path(__file__).parent
sys.path.insert(0, str(BACKEND))

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from data_loader        import load_flights, get_weather_summary, get_route_delays
from graph_builder      import build_graph, graph_to_dict
from floyd_warshall     import FloydWarshall
from delay_propagation  import DelayPropagation
from prediction         import PredictionEngine, generate_performance_benchmarks

# ─────────────────────────────────────────────────────────────────────────────
#  Application bootstrap
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=str(ROOT / "frontend"), static_url_path="")
CORS(app)

# ── Load data once at startup ─────────────────────────────────────────────────
CSV_PATH = str(ROOT / "data" / "flights.csv")
print(f"[API] Loading dataset from {CSV_PATH} …")
t0 = time.perf_counter()
df, FLIGHTS = load_flights(CSV_PATH)
print(f"[API] Loaded {len(FLIGHTS)} flights in {(time.perf_counter()-t0)*1000:.1f} ms")

# ── Build airport graph O(V+E) ────────────────────────────────────────────────
t0 = time.perf_counter()
GRAPH = build_graph(FLIGHTS)
GRAPH_BUILD_MS = round((time.perf_counter() - t0) * 1000, 3)
print(f"[API] Graph built: {GRAPH.num_vertices} airports, {GRAPH.num_edges} edges in {GRAPH_BUILD_MS} ms")

# ── Compute Floyd-Warshall O(V³) ──────────────────────────────────────────────
t0 = time.perf_counter()
FW = FloydWarshall(GRAPH)
FW.compute()
FW_MS = round((time.perf_counter() - t0) * 1000, 3)
print(f"[API] Floyd-Warshall computed in {FW_MS} ms")

# ── Cache for last simulation ─────────────────────────────────────────────────
_last_simulation: dict = {
    "steps": [],
    "predictions": {},
    "params": {},
}

# ── Pre-generate benchmarks (background-ish, takes a few seconds) ────────────
print("[API] Generating performance benchmarks …")
t0 = time.perf_counter()
BENCHMARKS = generate_performance_benchmarks(GRAPH, FLIGHTS)
print(f"[API] Benchmarks ready in {(time.perf_counter()-t0)*1000:.0f} ms")

# ─────────────────────────────────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(str(ROOT / "frontend"), "index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "airports": GRAPH.num_vertices, "edges": GRAPH.num_edges})


# ── GET /api/graph ─────────────────────────────────────────────────────────────
@app.route("/api/graph")
def api_graph():
    """Return airport nodes + edges for frontend network map."""
    data = graph_to_dict(GRAPH)
    data["weather_summary"] = get_weather_summary(df)
    data["top_delayed_routes"] = get_route_delays(df)
    data["build_time_ms"] = GRAPH_BUILD_MS
    return jsonify(data)


# ── GET /api/shortest-path?from=X&to=Y ────────────────────────────────────────
@app.route("/api/shortest-path")
def api_shortest_path():
    src = request.args.get("from", "").strip().upper()
    dst = request.args.get("to", "").strip().upper()

    if not src or not dst:
        return jsonify({"error": "Missing 'from' or 'to' parameter"}), 400

    result = FW.reconstruct_path(src, dst)
    result["floyd_warshall_time_ms"] = FW_MS
    return jsonify(result)


# ── POST /api/simulate-delay ───────────────────────────────────────────────────
@app.route("/api/simulate-delay", methods=["POST"])
def api_simulate_delay():
    """
    Body JSON:
    {
      "airport":        "JFK",
      "delay_minutes":  45,
      "threshold":      15,
      "weather":        2,       # optional override (0-3)
      "time_of_day":    8        # optional hour 0-23
    }
    """
    body = request.get_json(silent=True) or {}

    airport       = str(body.get("airport", "JFK")).strip().upper()
    delay_minutes = int(body.get("delay_minutes", 30))
    threshold     = int(body.get("threshold", 15))
    weather_ovr   = body.get("weather", None)
    time_of_day   = int(body.get("time_of_day", 10))

    if weather_ovr is not None:
        weather_ovr = int(weather_ovr)

    sim = DelayPropagation(GRAPH, threshold=threshold, time_of_day=time_of_day)
    steps = sim.simulate(airport, initial_delay=delay_minutes, weather_override=weather_ovr)

    # Generate predictions from this simulation
    engine = PredictionEngine(GRAPH, FLIGHTS)
    pred_result = engine.generate_predictions(steps)

    # Cache
    _last_simulation["steps"] = steps
    _last_simulation["predictions"] = pred_result
    _last_simulation["params"] = {
        "airport": airport,
        "delay_minutes": delay_minutes,
        "threshold": threshold,
        "weather_override": weather_ovr,
        "time_of_day": time_of_day,
    }

    return jsonify(
        {
            "propagation_steps": steps,
            "affected_airports": sim.get_affected_airports(steps),
            "chain": sim.get_propagation_chain(steps),
            "prediction_summary": pred_result.get("statistics", {}),
            "params": _last_simulation["params"],
        }
    )


# ── GET /api/predictions ───────────────────────────────────────────────────────
@app.route("/api/predictions")
def api_predictions():
    """Return prediction table from last simulation (or default JFK seed)."""
    if not _last_simulation["steps"]:
        # Run a default simulation so the page has data on first load
        sim = DelayPropagation(GRAPH, threshold=15, time_of_day=10)
        steps = sim.simulate("JFK", initial_delay=45)
        engine = PredictionEngine(GRAPH, FLIGHTS)
        pred_result = engine.generate_predictions(steps)
        _last_simulation["steps"] = steps
        _last_simulation["predictions"] = pred_result
    return jsonify(_last_simulation["predictions"])


# ── GET /api/performance ───────────────────────────────────────────────────────
@app.route("/api/performance")
def api_performance():
    """Return algorithm runtime benchmarks for Chart.js."""
    return jsonify(
        {
            **BENCHMARKS,
            "startup_times": {
                "graph_build_ms": GRAPH_BUILD_MS,
                "floyd_warshall_ms": FW_MS,
            },
        }
    )


# ── GET /api/airports ─────────────────────────────────────────────────────────
@app.route("/api/airports")
def api_airports():
    """Return flat list of airport codes (for frontend dropdowns)."""
    return jsonify({"airports": GRAPH.airports_list})


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  Flight Delay Prediction System — Backend API")
    print("  http://localhost:5000")
    print("=" * 60 + "\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
