# CSA0617
FLIGHT DELAY PREDICTION ✈️ 
📌 Overview
The Flight Delay Prediction System is a visualization and analysis tool that studies how flight delays propagate across an airline network. The system models airports and flight routes as a graph structure and applies graph algorithms to analyze connectivity, shortest paths, and delay propagation.

This project demonstrates the practical application of Design and Analysis of Algorithms (DAA) concepts in aviation network analysis.

🎯 Objectives
Analyze flight schedules and delay data in airline networks

Model airports and routes using graph data structures

Compute optimal routes between airports using shortest path algorithms

Simulate how delays propagate across connected flights

Visualize the airline network and delay patterns using an interactive dashboard

🧠 Algorithms Used
1️⃣ Floyd–Warshall Algorithm
Used to compute shortest paths between all pairs of airports

Helps determine the optimal route between any two airports

Time Complexity: O(V³)

2️⃣ Breadth First Search (BFS)
Used to simulate delay propagation

Shows how delays spread from one airport to connected airports

Time Complexity: O(V + E)

🏗 System Architecture
The system works through five main modules:

Module 1: Flight Schedule & Weather
Collects flight data including:

Flight number

Origin airport

Destination airport

Departure & arrival time

Weather conditions

Delay minutes

Module 2: Airport Graph Construction
Airports are represented as nodes

Flight routes are represented as edges

Builds a graph structure representing the airline network

Module 3: All‑Pairs Shortest Paths
Uses the Floyd–Warshall algorithm

Computes shortest paths between all airport pairs

Identifies optimal travel routes

Module 4: Delay Propagation Simulation
Uses BFS traversal

Simulates how delays spread between connected airports

Helps understand delay chain reactions

Module 5: Prediction & Visualization
Displays results through an interactive dashboard

Shows network map, shortest routes, and delay propagation

Provides insights into flight delay patterns

💻 Technologies Used
Frontend

HTML

CSS

JavaScript

Canvas Visualization

Chart.js

Backend

Python

Flask API

Pandas

NumPy

📊 Features
Interactive airline network visualization

Shortest path route analysis

Delay propagation simulation

Real‑time dashboard display

Performance analysis charts

🚀 How to Run the Project
1️⃣ Install Requirements
pip install -r requirements.txt
2️⃣ Start Backend Server
python backend/api.py
3️⃣ Open Frontend
Open the file:

frontend/index.html
in your browser.

📂 Project Structure
FlightDelayPrediction/
│
├── data/
│   └── flights.csv
│
├── backend/
│   ├── data_loader.py
│   ├── graph_builder.py
│   ├── floyd_warshall.py
│   ├── delay_propagation.py
│   ├── prediction.py
│   └── api.py
│
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── js/
│       ├── app.js
│       ├── api-client.js
│       ├── network-map.js
│       ├── delay-propagation.js
│       ├── shortest-path.js
│       └── performance-charts.js
│
├── requirements.txt
└── README.md
🔮 Future Scope
Integration with real-time flight APIs

Machine learning based delay prediction

Global airline network analysis

Mobile application for airline monitoring

Advanced analytics dashboard

