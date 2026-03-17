"""
floyd_warshall.py
=================
Step 3 — All-Pairs Shortest Paths

Implements the Floyd-Warshall algorithm to find the shortest cost path
between every pair of airports in the airline network.

Time Complexity : O(V³)
Space Complexity: O(V²)

Edge weight used: delay_minutes + weather_impact * 5
  (inherited from GraphBuilder's weight_matrix)

Outputs:
  dist[i][j]  — minimum cost from airport i to airport j
  next[i][j]  — next hop on the shortest path from i to j
               (used by reconstruct_path)
"""

from __future__ import annotations
import math
import copy
from typing import List, Optional
from graph_builder import AirportGraph

INF = math.inf


class FloydWarshall:
    """
    All-pairs shortest path solver for a weighted directed graph.

    Usage
    -----
    fw = FloydWarshall(graph)
    fw.compute()
    path = fw.reconstruct_path("JFK", "LAX")
    """

    def __init__(self, graph: AirportGraph) -> None:
        self.graph   = graph
        self.V       = graph.num_vertices
        self.airports = graph.airports_list
        self.index    = graph.airport_index

        # Deep-copy weight matrix — we will mutate it in place
        self.dist: List[List[float]] = copy.deepcopy(graph.weight_matrix)

        # next[i][j] = next vertex on shortest path from i to j (None = no path)
        self.next: List[List[Optional[int]]] = [
            [None] * self.V for _ in range(self.V)
        ]

        # Initialise next matrix from direct edges
        for i in range(self.V):
            for j in range(self.V):
                if i != j and self.dist[i][j] < INF:
                    self.next[i][j] = j

        self._computed = False

    # ── Core algorithm ────────────────────────────────────────────────────────
    def compute(self) -> None:
        """
        Run Floyd-Warshall: O(V³).

        After calling this:
          self.dist[i][j] = shortest path weight from i to j
          self.next[i][j] = next hop from i toward j
        """
        dist = self.dist
        nxt  = self.next
        V    = self.V

        for k in range(V):             # intermediate vertex
            for i in range(V):         # from vertex
                if dist[i][k] == INF:
                    continue
                for j in range(V):     # to vertex
                    through_k = dist[i][k] + dist[k][j]
                    if through_k < dist[i][j]:
                        dist[i][j]  = through_k
                        nxt[i][j]   = nxt[i][k]  # route through k

        self._computed = True

    # ── Path reconstruction ───────────────────────────────────────────────────
    def reconstruct_path(
        self, source: str, destination: str
    ) -> dict:
        """
        Return the shortest path and its cost between two airports.

        Returns
        -------
        {
          "path": ["JFK", "ORD", "LAX"],   # ordered list
          "cost": 23.0,
          "hops": [{"from": ..., "to": ..., "cost": ...}, ...]
        }
        """
        if not self._computed:
            self.compute()

        if source not in self.index or destination not in self.index:
            return {"path": [], "cost": INF, "hops": [], "error": "Unknown airport"}

        u = self.index[source]
        v = self.index[destination]

        if self.dist[u][v] == INF:
            return {"path": [], "cost": INF, "hops": [], "error": "No path exists"}

        # Walk the next matrix
        path = [u]
        current = u
        visited = {u}
        while current != v:
            nxt_hop = self.next[current][v]
            if nxt_hop is None or nxt_hop in visited:
                break
            visited.add(nxt_hop)
            path.append(nxt_hop)
            current = nxt_hop

        airport_path = [self.airports[i] for i in path]

        # Build hop-by-hop cost list
        hops = []
        for idx in range(len(path) - 1):
            a, b = path[idx], path[idx + 1]
            hops.append(
                {
                    "from": self.airports[a],
                    "to":   self.airports[b],
                    "cost": round(self.dist[a][b], 2),
                }
            )

        return {
            "path": airport_path,
            "cost": round(self.dist[u][v], 2),
            "hops": hops,
        }

    # ── Serialisation helper ──────────────────────────────────────────────────
    def get_dist_matrix_sample(self, size: int = 10) -> dict:
        """Return a small sub-matrix (for performance endpoint)."""
        sub = []
        labels = self.airports[:size]
        for i in range(min(size, self.V)):
            row = {}
            for j in range(min(size, self.V)):
                val = self.dist[i][j]
                row[self.airports[j]] = round(val, 1) if val < INF else -1
            sub.append({"airport": self.airports[i], "distances": row})
        return {"labels": labels, "matrix": sub}

    def get_all_paths_summary(self) -> list:
        """Return list of all finite shortest paths (source, dest, cost)."""
        results = []
        for i in range(self.V):
            for j in range(self.V):
                if i != j and self.dist[i][j] < INF:
                    results.append(
                        {
                            "source": self.airports[i],
                            "destination": self.airports[j],
                            "cost": round(self.dist[i][j], 2),
                        }
                    )
        return results


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import pathlib, time
    from data_loader import load_flights
    from graph_builder import build_graph

    base = pathlib.Path(__file__).parent.parent
    _, flights = load_flights(str(base / "data" / "flights.csv"))
    g = build_graph(flights)

    fw = FloydWarshall(g)
    t0 = time.perf_counter()
    fw.compute()
    elapsed = (time.perf_counter() - t0) * 1000

    print(f"Floyd-Warshall on {g.num_vertices} airports: {elapsed:.2f} ms")
    result = fw.reconstruct_path("JFK", "LAX")
    print(f"JFK → LAX: {result}")
    result2 = fw.reconstruct_path("SEA", "MIA")
    print(f"SEA → MIA: {result2}")
