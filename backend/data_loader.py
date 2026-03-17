"""
data_loader.py
==============
Step 1 — Flight Schedule & Weather Data Processing Pipeline.

Responsibilities:
- Load flights.csv using pandas
- Clean null values
- Convert departure_time / arrival_time to minutes since midnight (int)
- Compute weather_impact score per row
- Return cleaned DataFrame + list of Flight namedtuples

Complexity: O(E) where E = number of flight records
"""

import pandas as pd
from collections import namedtuple
from typing import List, Tuple

# ── Named tuple representing a single flight record ───────────────────────────
Flight = namedtuple(
    "Flight",
    [
        "flight_no",
        "origin",
        "destination",
        "departure_time",   # minutes since midnight
        "arrival_time",     # minutes since midnight
        "weather_condition",
        "weather_impact",   # 0–3 score
        "delay_minutes",
        "edge_weight",      # delay_minutes + weather_impact * 5
    ],
)

# ── Weather scoring map ───────────────────────────────────────────────────────
WEATHER_IMPACT: dict = {
    "Clear": 0,
    "Rain":  1,
    "Fog":   2,
    "Storm": 3,
}


def _time_to_minutes(t: str) -> int:
    """'HH:MM' → integer minutes since midnight.  Returns 0 on parse error."""
    try:
        parts = str(t).strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


def load_flights(csv_path: str) -> Tuple[pd.DataFrame, List[Flight]]:
    """
    Load, clean, and enrich the flight dataset.

    Parameters
    ----------
    csv_path : str
        Path to flights.csv

    Returns
    -------
    df : pd.DataFrame
        Cleaned, enriched DataFrame
    flights : List[Flight]
        Typed namedtuple list ready for graph construction
    """
    # ── 1. Load ───────────────────────────────────────────────────────────────
    df = pd.read_csv(csv_path)

    # ── 2. Clean ──────────────────────────────────────────────────────────────
    df.dropna(subset=["origin", "destination"], inplace=True)
    df.fillna(
        {
            "delay_minutes":    0,
            "weather_condition": "Clear",
            "departure_time":   "00:00",
            "arrival_time":     "00:00",
        },
        inplace=True,
    )
    df = df.reset_index(drop=True)

    # Strip whitespace from string columns
    for col in ["flight_no", "origin", "destination", "weather_condition"]:
        df[col] = df[col].astype(str).str.strip()

    # ── 3. Convert times ──────────────────────────────────────────────────────
    df["departure_time"] = df["departure_time"].apply(_time_to_minutes)
    df["arrival_time"]   = df["arrival_time"].apply(_time_to_minutes)
    df["delay_minutes"]  = pd.to_numeric(df["delay_minutes"], errors="coerce").fillna(0).astype(int)

    # ── 4. Weather impact ─────────────────────────────────────────────────────
    df["weather_impact"] = df["weather_condition"].map(WEATHER_IMPACT).fillna(0).astype(int)

    # ── 5. Edge weight ────────────────────────────────────────────────────────
    df["edge_weight"] = df["delay_minutes"] + df["weather_impact"] * 5

    # ── 6. Build Flight namedtuples ───────────────────────────────────────────
    flights: List[Flight] = [
        Flight(
            flight_no=row.flight_no,
            origin=row.origin,
            destination=row.destination,
            departure_time=int(row.departure_time),
            arrival_time=int(row.arrival_time),
            weather_condition=row.weather_condition,
            weather_impact=int(row.weather_impact),
            delay_minutes=int(row.delay_minutes),
            edge_weight=int(row.edge_weight),
        )
        for row in df.itertuples(index=False)
    ]

    return df, flights


def get_weather_summary(df: pd.DataFrame) -> dict:
    """Return per-weather-condition average delay (used for analytics)."""
    summary = (
        df.groupby("weather_condition")["delay_minutes"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "avg_delay", "count": "num_flights"})
        .round(2)
        .to_dict(orient="index")
    )
    return summary


def get_route_delays(df: pd.DataFrame) -> list:
    """Return top-10 routes by average delay."""
    routes = (
        df.groupby(["origin", "destination"])["delay_minutes"]
        .mean()
        .reset_index()
        .rename(columns={"delay_minutes": "avg_delay"})
        .sort_values("avg_delay", ascending=False)
        .head(10)
    )
    return routes.to_dict(orient="records")


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import os, pathlib
    base = pathlib.Path(__file__).parent.parent
    df, flights = load_flights(str(base / "data" / "flights.csv"))
    print(f"Loaded {len(df)} flights, {df['origin'].nunique()} unique airports")
    print(df.head(3))
    print(f"\nFirst flight: {flights[0]}")
    print(f"\nWeather summary:\n{get_weather_summary(df)}")
