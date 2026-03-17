"""
graph_builder.py
================
Step 2 — Airport Graph Construction

Airports  = nodes (vertices V)
Flights   = directed edges (E)

Edge weight = delay_minutes + weather_impact * 5

Builds:
  - airport_index  : {name -> int id}
  - airports_list  : [name, ...]  (index → name)
  - adj_list       : {id -> [(neighbour_id, weight, flight_no, weather_impact, delay_minutes), ...]}
  - weight_matrix  : V×V matrix (INF where no direct edge)

Complexity: O(V + E)
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from typing import Dict, List, Tuple
from data_loader import Flight

INF = math.inf


@dataclass
class AirportGraph:
    """Immutable snapshot of the airline graph."""
    airport_index: Dict[str, int]          # airport name → numeric id
    airports_list: List[str]               # numeric id  → airport name
    adj_list: Dict[int, List[Tuple]]       # id → [(dst_id, weight, flight_no, w_impact, delay)]
    weight_matrix: List[List[float]]       # V×V  (dist, INF = no direct edge)
    num_vertices: int
    num_edges: int
    # raw coordinates for frontend map (approximate lat/lon)
    coordinates: Dict[str, Tuple[float, float]]


# Indian airport coordinates (lat, lon)
_KNOWN_COORDS: Dict[str, Tuple[float, float]] = {
    "DEL": (28.5562,  77.1000),   # Indira Gandhi International, Delhi
    "BOM": (19.0896,  72.8656),   # Chhatrapati Shivaji Maharaj, Mumbai
    "MAA": (12.9900,  80.1693),   # Chennai International
    "BLR": (13.1986,  77.7066),   # Kempegowda International, Bangalore
    "HYD": (17.2403,  78.4294),   # Rajiv Gandhi International, Hyderabad
    "CCU": (22.6547,  88.4467),   # Netaji Subhash Chandra Bose, Kolkata
    "COK": (10.1520,  76.4019),   # Cochin International, Kochi
    "GOI": (15.3808,  73.8314),   # Goa International (Dabolim)
    "AMD": (23.0734,  72.6266),   # Sardar Vallabhbhai Patel, Ahmedabad
    "PNQ": (18.5821,  73.9197),   # Pune Airport
}

# Full city names for Indian airports
_CITY_NAMES: Dict[str, str] = {
    "DEL": "Delhi",
    "BOM": "Mumbai",
    "MAA": "Chennai",
    "BLR": "Bangalore",
    "HYD": "Hyderabad",
    "CCU": "Kolkata",
    "COK": "Kochi",
    "GOI": "Goa",
    "AMD": "Ahmedabad",
    "PNQ": "Pune",
}


def _get_coords(airport: str) -> Tuple[float, float]:
    """Return known coords or a deterministic fallback."""
    if airport in _KNOWN_COORDS:
        return _KNOWN_COORDS[airport]
    # Deterministic fallback using hash — places unknown airports within India bounds
    h = abs(hash(airport)) % 1_000_000
    lat = 10.0 + (h % 25)
    lon = 70.0 + (h % 20)
    return (float(lat), float(lon))


def build_graph(flights: List[Flight]) -> AirportGraph:
    """
    Build airport graph in O(V + E) time.

    Parameters
    ----------
    flights : list of Flight namedtuples

    Returns
    -------
    AirportGraph dataclass
    """
    # ── 1. Collect unique airports (O(E)) ─────────────────────────────────────
    airport_set = set()
    for f in flights:
        airport_set.add(f.origin)
        airport_set.add(f.destination)

    airports_list = sorted(airport_set)
    airport_index: Dict[str, int] = {name: i for i, name in enumerate(airports_list)}
    V = len(airports_list)

    # ── 2. Initialise weight matrix with INF (O(V²)) ─────────────────────────
    weight_matrix: List[List[float]] = [[INF] * V for _ in range(V)]
    for i in range(V):
        weight_matrix[i][i] = 0.0   # self-loops = 0

    # ── 3. Initialise adjacency list (O(V)) ───────────────────────────────────
    adj_list: Dict[int, List[Tuple]] = {i: [] for i in range(V)}

    # ── 4. Insert edges (O(E)) ────────────────────────────────────────────────
    edge_count = 0
    for f in flights:
        u = airport_index[f.origin]
        v = airport_index[f.destination]
        w = float(f.edge_weight)

        adj_list[u].append(
            (v, w, f.flight_no, f.weather_impact, f.delay_minutes, f.weather_condition)
        )

        # Keep minimum weight for multi-flight routes (same OD pair, pick best)
        if w < weight_matrix[u][v]:
            weight_matrix[u][v] = w

        edge_count += 1

    # ── 5. Coordinates ────────────────────────────────────────────────────────
    coordinates = {ap: _get_coords(ap) for ap in airports_list}

    return AirportGraph(
        airport_index=airport_index,
        airports_list=airports_list,
        adj_list=adj_list,
        weight_matrix=weight_matrix,
        num_vertices=V,
        num_edges=edge_count,
        coordinates=coordinates,
    )


def graph_to_dict(graph: AirportGraph) -> dict:
    """Serialise graph to JSON-friendly dict for API response."""
    nodes = []
    for iata, idx in graph.airport_index.items():
        lat, lon = graph.coordinates[iata]
        nodes.append({
            "id":   idx,
            "iata": iata,
            "name": _CITY_NAMES.get(iata, iata),   # full city name, fallback to IATA
            "lat":  lat,
            "lon":  lon,
        })

    edges = []
    seen = set()
    for u, neighbours in graph.adj_list.items():
        for (v, w, flight_no, w_impact, delay, weather) in neighbours:
            key = (u, v, flight_no)
            if key not in seen:
                seen.add(key)
                edges.append(
                    {
                        "source": u,
                        "target": v,
                        "source_name": graph.airports_list[u],
                        "target_name": graph.airports_list[v],
                        "weight": w,
                        "flight_no": flight_no,
                        "weather_impact": w_impact,
                        "delay_minutes": delay,
                        "weather": weather,
                    }
                )

    return {
        "nodes": nodes,
        "edges": edges,
        "num_vertices": graph.num_vertices,
        "num_edges": graph.num_edges,
    }


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import pathlib
    from data_loader import load_flights

    base = pathlib.Path(__file__).parent.parent
    _, flights = load_flights(str(base / "data" / "flights.csv"))
    g = build_graph(flights)
    print(f"Graph: {g.num_vertices} airports, {g.num_edges} flight edges")
    print(f"Sample adj_list[0]: {g.adj_list[0][:2]}")
