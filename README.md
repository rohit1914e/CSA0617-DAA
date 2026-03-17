# ✈ Flight Delay Prediction System
### Airline Network Delay Propagation — DAA Course Project

A real-time aviation dashboard that models the airline network as a directed weighted graph and predicts how delays cascade through connected flights. The system implements five algorithmic stages of increasing complexity and visualises everything in a 60 FPS interactive web dashboard.

---

## System Architecture

```
CSV Dataset (500 flights, 30 airports)
        │
        ▼
[ Step 1 ] DataLoader          O(E)   — load, clean, weather scoring
        │
        ▼
[ Step 2 ] GraphBuilder        O(V+E) — adjacency list + weight matrix
        │
        ▼
[ Step 3 ] Floyd-Warshall      O(V³)  — all-pairs shortest paths
        │
        ▼
[ Step 4 ] DelayPropagation    O(V+E) — BFS delay cascade simulation
        │
        ▼
[ Step 5 ] PredictionEngine    O(E)   — delay predictions + stats
        │
        ▼
 Flask REST API  ←→  60 FPS Web Dashboard
```

---

## Quick Start

### 1. Install Python dependencies
```bash
cd C:\Users\Dell\Desktop\DAA
pip install -r requirements.txt
```

### 2. Start the backend
```bash
python backend/api.py
```
Backend runs at **http://localhost:5000**

### 3. Open the frontend
Open `frontend/index.html` directly in Chrome / Edge / Firefox.

> **Note**: The frontend uses ES Modules (`type="module"`). If you get CORS errors opening the file directly, serve it with:
> ```bash
> # Python's built-in server (from the DAA folder):
> python -m http.server 8080
> # Then open http://localhost:8080/frontend/index.html
> ```

---

## Project Structure

```
DAA/
├── data/
│   └── flights.csv              # 500 flight records, 30 airports
│
├── backend/
│   ├── data_loader.py           # Step 1 — CSV load + weather scoring
│   ├── graph_builder.py         # Step 2 — Airport graph O(V+E)
│   ├── floyd_warshall.py        # Step 3 — All-pairs shortest paths O(V³)
│   ├── delay_propagation.py     # Step 4 — BFS delay simulation O(V+E)
│   ├── prediction.py            # Step 5 — Prediction engine + benchmarks
│   └── api.py                   # Flask REST API (CORS enabled)
│
├── frontend/
│   ├── index.html               # Single-page dashboard
│   ├── style.css                # Aviation control-center dark theme
│   └── js/
│       ├── app.js               # Bootstrap + tab routing
│       ├── api-client.js        # Fetch wrappers for backend
│       ├── network-map.js       # 60 FPS Canvas network renderer
│       ├── delay-propagation.js # BFS replay animation
│       ├── shortest-path.js     # Path highlight + hop table
│       └── performance-charts.js # Chart.js runtime benchmarks
│
├── requirements.txt
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/graph` | Airport nodes + edges + coordinates |
| `GET`  | `/api/airports` | List of IATA codes |
| `GET`  | `/api/shortest-path?from=JFK&to=LAX` | Floyd-Warshall path |
| `POST` | `/api/simulate-delay` | BFS delay propagation |
| `GET`  | `/api/predictions` | Prediction table |
| `GET`  | `/api/performance` | Algorithm runtime benchmarks |

### POST `/api/simulate-delay` body
```json
{
  "airport": "JFK",
  "delay_minutes": 45,
  "threshold": 15,
  "weather": 3,
  "time_of_day": 8
}
```

---

## Dashboard Features

### Tab 1 — Airport Network Map
- 60 FPS Canvas rendering via `requestAnimationFrame`
- Airports as glowing neon nodes (pulsing animation)
- Flight routes as animated dashed lines
- Moving aircraft dots on routes (green = normal, red = delayed)
- Mouse-wheel **zoom** (0.3× – 8×), drag to **pan**
- Hover over nodes to see coordinates

### Tab 2 — Delay Propagation
- Select seed airport, delay amount, threshold, weather
- Speed control slider (0.5× – 4×)
- Red pulse wave animates delay spread across the network
- Step-by-step propagation chain list
- Impact statistics: affected flights, avg/max delay, worst weather zone

### Tab 3 — Shortest Path
- Select **origin** and **destination** from dropdowns
- Floyd-Warshall result displayed as **gold animated path**
- Travelling dot animates along the highlighted route
- Hop-by-hop cost table with total journey cost

### Tab 4 — Performance Charts
- Floyd-Warshall runtime vs. V (airports) — line chart
- Graph construction time vs. E (edges) — bar chart
- Delay prediction accuracy vs. threshold — dual-axis line chart
- Startup benchmark display (Graph Build + Floyd-Warshall times)

---

## Algorithms

| Stage | Algorithm | Complexity |
|-------|-----------|------------|
| Data Loading | Pandas CSV pipeline | O(E) |
| Graph Construction | Adjacency list build | **O(V + E)** |
| Shortest Paths | Floyd-Warshall | **O(V³)** |
| Delay Propagation | BFS traversal | **O(V + E)** |
| Prediction | Aggregation | O(E) |

### Edge Weight Formula
```
edge_weight = delay_minutes + weather_impact × 5

Weather: Clear=0, Rain=1, Fog=2, Storm=3
```

### Propagation Threshold Rule
A delay propagates from airport U to V when:
```
edge_delay + weather_impact ≥ threshold
```
Time-of-day multipliers amplify delays during peak hours (06–09h ×1.4, 16–19h ×1.3).

---

## Dataset

`data/flights.csv` — 500 synthetic flight records:

| Column | Description |
|--------|-------------|
| `flight_no` | Unique flight identifier |
| `origin` | Origin airport (IATA code) |
| `destination` | Destination airport |
| `departure_time` | HH:MM format |
| `arrival_time` | HH:MM format |
| `weather_condition` | Clear / Rain / Fog / Storm |
| `delay_minutes` | Historical average delay |

**30 airports**: JFK, LAX, ORD, MIA, ATL, SFO, SEA, DFW, BOS, DEN, PHX, MSP, DTW, PHL, CLT, IAH, LAS, SAN, PDX, MDW, HOU, DAL, FLL, MCO, TPA, and more.

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend   | Python 3.10+ / Flask / Pandas / NumPy |
| Frontend  | Vanilla JavaScript (ES Modules) |
| Rendering | HTML5 Canvas API (60 FPS requestAnimationFrame) |
| Charts    | Chart.js 4.x |
| Fonts     | Orbitron + Rajdhani + Share Tech Mono (Google Fonts) |
| CORS      | flask-cors |
