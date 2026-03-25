import os
import sys
import time
import pathlib

ROOT = pathlib.Path(__file__).parent.parent
BACKEND = pathlib.Path(__file__).parent
sys.path.insert(0, str(BACKEND))

from flask import Flask, jsonify, request
from flask_cors import CORS

from data_loader        import load_flights, get_weather_summary, get_route_delays
from graph_builder      import build_graph, graph_to_dict
from floyd_warshall     import FloydWarshall
from delay_propagation  import DelayPropagation
from prediction         import PredictionEngine, generate_performance_benchmarks

# ✅ FIXED STATIC PATH (IMPORTANT)
app = Flask(__name__, static_folder=str(ROOT / "frontend"), static_url_path="")
CORS(app)

# ── Load Data ──
CSV_PATH = str(ROOT / "data" / "flights.csv")
print(f"[API] Loading dataset from {CSV_PATH} …")
t0 = time.perf_counter()
df, FLIGHTS = load_flights(CSV_PATH)
print(f"[API] Loaded {len(FLIGHTS)} flights in {(time.perf_counter()-t0)*1000:.1f} ms")

# ── Build Graph ──
t0 = time.perf_counter()
GRAPH = build_graph(FLIGHTS)
GRAPH_BUILD_MS = round((time.perf_counter() - t0) * 1000, 3)
print(f"[API] Graph built: {GRAPH.num_vertices} airports, {GRAPH.num_edges} edges in {GRAPH_BUILD_MS} ms")

# ── Floyd Warshall ──
t0 = time.perf_counter()
FW = FloydWarshall(GRAPH)
FW.compute()
FW_MS = round((time.perf_counter() - t0) * 1000, 3)
print(f"[API] Floyd-Warshall computed in {FW_MS} ms")

# ── Cache ──
_last_simulation = {
    "steps": [],
    "predictions": {},
    "params": {},
}

# ── Benchmarks ──
print("[API] Generating performance benchmarks …")
t0 = time.perf_counter()
BENCHMARKS = generate_performance_benchmarks(GRAPH, FLIGHTS)
print(f"[API] Benchmarks ready in {(time.perf_counter()-t0)*1000:.0f} ms")


# ================= ROUTES =================

@app.route("/")
def index():
    return app.send_static_file("index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "airports": GRAPH.num_vertices, "edges": GRAPH.num_edges})


@app.route("/api/graph")
def api_graph():
    data = graph_to_dict(GRAPH)
    data["weather_summary"] = get_weather_summary(df)
    data["top_delayed_routes"] = get_route_delays(df)
    data["build_time_ms"] = GRAPH_BUILD_MS
    return jsonify(data)


@app.route("/api/shortest-path")
def api_shortest_path():
    src = request.args.get("from", "").strip().upper()
    dst = request.args.get("to", "").strip().upper()

    if not src or not dst:
        return jsonify({"error": "Missing 'from' or 'to' parameter"}), 400

    result = FW.reconstruct_path(src, dst)
    result["floyd_warshall_time_ms"] = FW_MS
    return jsonify(result)


@app.route("/api/simulate-delay", methods=["POST"])
def api_simulate_delay():
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

    engine = PredictionEngine(GRAPH, FLIGHTS)
    pred_result = engine.generate_predictions(steps)

    _last_simulation["steps"] = steps
    _last_simulation["predictions"] = pred_result
    _last_simulation["params"] = {
        "airport": airport,
        "delay_minutes": delay_minutes,
        "threshold": threshold,
        "weather_override": weather_ovr,
        "time_of_day": time_of_day,
    }

    return jsonify({
        "propagation_steps": steps,
        "affected_airports": sim.get_affected_airports(steps),
        "chain": sim.get_propagation_chain(steps),
        "prediction_summary": pred_result.get("statistics", {}),
        "params": _last_simulation["params"],
    })


@app.route("/api/predictions")
def api_predictions():
    if not _last_simulation["steps"]:
        sim = DelayPropagation(GRAPH, threshold=15, time_of_day=10)
        steps = sim.simulate("JFK", initial_delay=45)
        engine = PredictionEngine(GRAPH, FLIGHTS)
        pred_result = engine.generate_predictions(steps)
        _last_simulation["steps"] = steps
        _last_simulation["predictions"] = pred_result
    return jsonify(_last_simulation["predictions"])


@app.route("/api/performance")
def api_performance():
    return jsonify({
        **BENCHMARKS,
        "startup_times": {
            "graph_build_ms": GRAPH_BUILD_MS,
            "floyd_warshall_ms": FW_MS,
        },
    })


@app.route("/api/airports")
def api_airports():
    return jsonify({"airports": GRAPH.airports_list})


# ================= RUN =================

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  Flight Delay Prediction System — Backend API")
    print("  Running on Render / Local")
    print("=" * 60 + "\n")

    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)