"""Quick integration test for all backend modules."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent / "backend"))

from data_loader import load_flights
from graph_builder import build_graph
from floyd_warshall import FloydWarshall
from delay_propagation import DelayPropagation
from prediction import PredictionEngine, generate_performance_benchmarks

# Step 1
df, flights = load_flights("data/flights.csv")
assert len(flights) > 0
print(f"[OK] DataLoader: {len(flights)} flights, {df['origin'].nunique()} airports")

# Step 2
g = build_graph(flights)
assert g.num_vertices > 0 and g.num_edges > 0
print(f"[OK] GraphBuilder: {g.num_vertices} nodes, {g.num_edges} edges")

# Step 3
fw = FloydWarshall(g)
fw.compute()
r = fw.reconstruct_path("JFK", "LAX")
assert r["path"], f"No path found: {r}"
print(f"[OK] FloydWarshall: JFK->LAX path={r['path']}  cost={r['cost']}")

# Step 4
sim = DelayPropagation(g, threshold=15, time_of_day=8)
steps = sim.simulate("JFK", 45)
assert len(steps) > 0
print(f"[OK] DelayPropagation: {len(steps)} steps propagated from JFK")

# Step 5
engine = PredictionEngine(g, flights)
pred = engine.generate_predictions(steps)
assert "predictions" in pred and "statistics" in pred
print(f"[OK] PredictionEngine: {len(pred['predictions'])} predictions, stats={pred['statistics']}")

# Benchmarks
bench = generate_performance_benchmarks(g, flights)
assert "floyd_warshall" in bench
print(f"[OK] Benchmarks: {len(bench['floyd_warshall'])} FW data points")

print("\n=== ALL BACKEND MODULES PASSED ===")
