"""
delay_propagation.py
====================
Step 4 — Delay Propagation Simulation

Simulates how a delay at one airport cascades through the airline network
using Breadth-First Search (BFS) graph traversal.

A delay propagates across an edge (u → v) when:
  edge_delay + weather_impact_score >= threshold

Propagation considers:
  - Number of flight connections
  - Delay threshold (configurable)
  - Time of day (hour-based multiplier)
  - Weather impact (weather_impact score on each edge)

Time Complexity: O(V + E)

Output: propagation_steps  →  list of step dicts in animation order
"""

from __future__ import annotations
from collections import deque
from typing import List, Dict, Optional
from graph_builder import AirportGraph
import math

INF = math.inf

# ── Time-of-day multipliers ───────────────────────────────────────────────────
#   Morning rush (06–09) and Evening rush (16–19) amplify delays
def _time_multiplier(hour: int) -> float:
    if 6 <= hour <= 9:
        return 1.4   # morning peak
    elif 16 <= hour <= 19:
        return 1.3   # evening peak
    elif 22 <= hour or hour <= 5:
        return 0.7   # off-peak / night
    return 1.0


class DelayPropagation:
    """
    BFS-based delay propagation engine.

    Parameters
    ----------
    graph      : AirportGraph  — built by graph_builder
    threshold  : int           — minimum combined score to propagate a delay
    time_of_day: int           — hour (0-23) for time-of-day multiplier
    """

    def __init__(
        self,
        graph: AirportGraph,
        threshold: int = 15,
        time_of_day: int = 10,
    ) -> None:
        self.graph       = graph
        self.threshold   = threshold
        self.multiplier  = _time_multiplier(time_of_day)

    # ── Main simulation ───────────────────────────────────────────────────────
    def simulate(
        self,
        seed_airport: str,
        initial_delay: int,
        weather_override: Optional[int] = None,
    ) -> List[Dict]:
        """
        Propagate a delay starting from `seed_airport`.

        Parameters
        ----------
        seed_airport    : str  — IATA code of initially delayed airport
        initial_delay   : int  — delay in minutes at seed airport
        weather_override: int  — if set, override weather_impact for seed edge

        Returns
        -------
        propagation_steps : list of dicts
            [
              {
                "step": int,
                "airport": str,
                "airport_id": int,
                "delay_added": float,
                "cumulative_delay": float,
                "reason": str,
                "source_airport": str,
                "edge_weight": float
              }, ...
            ]
        """
        index    = self.graph.airport_index
        airports = self.graph.airports_list
        adj      = self.graph.adj_list

        if seed_airport not in index:
            return []

        seed_id = index[seed_airport]

        # visited[id] = cumulative delay accumulated at that airport
        visited: Dict[int, float] = {}
        visited[seed_id] = float(initial_delay)

        steps: List[Dict] = []

        # Add seed step
        steps.append(
            {
                "step": 0,
                "airport": seed_airport,
                "airport_id": seed_id,
                "delay_added": float(initial_delay),
                "cumulative_delay": float(initial_delay),
                "reason": f"Initial delay of {initial_delay} min at {seed_airport}",
                "source_airport": seed_airport,
                "edge_weight": 0.0,
            }
        )

        # BFS queue: (airport_id, cumulative_delay)
        queue: deque = deque([(seed_id, float(initial_delay))])
        step_num = 1

        while queue:
            u_id, delay_at_u = queue.popleft()
            u_name = airports[u_id]

            for edge in adj.get(u_id, []):
                v_id, edge_w, flight_no, w_impact, edge_delay, weather = edge

                # Apply weather override only on seed edges
                effective_w = weather_override if (u_id == seed_id and weather_override is not None) else w_impact

                # Combined propagation score
                propagation_score = edge_delay + effective_w

                # Apply time-of-day multiplier
                effective_delay = (delay_at_u * 0.5 + edge_delay) * self.multiplier

                if propagation_score >= self.threshold and v_id not in visited:
                    visited[v_id] = effective_delay
                    v_name = airports[v_id]
                    reason = (
                        f"Delayed via {flight_no}: "
                        f"{u_name}→{v_name} "
                        f"(edge_delay={edge_delay}min, weather={weather}, "
                        f"score={propagation_score}≥{self.threshold})"
                    )
                    steps.append(
                        {
                            "step": step_num,
                            "airport": v_name,
                            "airport_id": v_id,
                            "delay_added": round(effective_delay, 1),
                            "cumulative_delay": round(effective_delay, 1),
                            "reason": reason,
                            "source_airport": u_name,
                            "source_id": u_id,
                            "edge_weight": round(edge_w, 1),
                            "flight_no": flight_no,
                            "weather": weather,
                            "weather_impact": effective_w,
                        }
                    )
                    queue.append((v_id, effective_delay))
                    step_num += 1

        return steps

    def get_affected_airports(self, steps: List[Dict]) -> List[str]:
        """Return sorted list of airport names affected by propagation."""
        return sorted({s["airport"] for s in steps[1:]})

    def get_propagation_chain(self, steps: List[Dict]) -> str:
        """Human-readable chain string: 'JFK → ORD (+20min) → LAX (+15min)'"""
        parts = []
        for s in steps:
            if s["step"] == 0:
                parts.append(f"{s['airport']} [SEED +{s['delay_added']:.0f}min]")
            else:
                parts.append(f"{s['airport']} (+{s['delay_added']:.0f}min)")
        return " → ".join(parts)


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import pathlib
    from data_loader import load_flights
    from graph_builder import build_graph

    base = pathlib.Path(__file__).parent.parent
    _, flights = load_flights(str(base / "data" / "flights.csv"))
    g = build_graph(flights)

    sim = DelayPropagation(g, threshold=15, time_of_day=8)
    steps = sim.simulate("JFK", initial_delay=45)
    print(f"Propagation from JFK (45 min delay): {len(steps)} steps")
    for s in steps[:6]:
        print(f"  Step {s['step']}: {s['airport']} (+{s['delay_added']} min) — {s['reason'][:60]}")
    print("Chain:", sim.get_propagation_chain(steps)[:120])
