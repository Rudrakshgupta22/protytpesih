## **Product Requirements Document-:**



Edge-AI Based Distributed Fleet Coordination for AMRs

Team MeredianX | SIH 2026 | PS ID 26123



1\. Problem, in one line

Central fleet servers create a single point of failure and Wi-Fi dead zones stall robots. Replace the central brain with robots that plan, negotiate, and reroute directly with their neighbors.



2\. What the prototype needs to prove

Since real AMR hardware won't be available for the demo, the prototype's job is to prove the coordination logic works, not to build physical robots. Judges need to see:



N simulated robots moving in a warehouse grid, each making its own decisions.

Robots detecting and resolving a conflict (two robots wanting the same aisle) without a central arbiter.

A live view of the peer-to-peer message exchange, not just the end result.

A "kill the server / drop the network" demo — robots keep completing tasks.

A metric that shows this beats centralized dispatch (throughput, wait time, deadlocks avoided).

3\. Scope

In scope (hackathon prototype)



2D grid-based warehouse simulator, configurable size and shelf layout

5–20 simulated AMR agents, each running as an independent process/thread (this is the "edge node")

Local A\*/D\* Lite path planning per robot

Peer-to-peer messaging layer (pub/sub, no central broker doing decision-making — it only relays)

Priority + time-slot reservation for shared aisles

Lightweight on-agent scoring model for task allocation (travel time, battery, congestion)

Fault injection: kill a robot, drop a network link, block an aisle

Live web dashboard: map view, robot states, event log, metrics

Out of scope (mention as "future work" in the deck)



Real hardware / ROS2 driver integration

SLAM / real sensor fusion

Production-grade security on the mesh

Multi-warehouse / multi-site coordination

4\. Users

SIH judges — need a visual, real-time, explainable demo.

Warehouse ops lead (persona for the pitch) — cares about throughput, downtime, and not replacing existing AMRs.

5\. System Architecture

┌─────────────────────────────────────────────────────────┐

│                     Browser Dashboard                     │

│   (map view · event log · metrics · fault injection UI)   │

└───────────────────────▲─────────────────────────────────┘

&#x20;                        │ WebSocket (read-only feed)

┌───────────────────────┴─────────────────────────────────┐

│                  Simulation Orchestrator                  │

│   spins up N agent processes · world clock · warehouse    │

│   grid state · does NOT make robot decisions               │

└───────────────────────▲─────────────────────────────────┘

&#x20;                        │ pub/sub relay only (MQTT/Redis)

&#x20;       ┌────────┬───────┴───────┬────────┬────────┐

&#x20;       ▼        ▼               ▼        ▼        ▼

&#x20;    \[Robot 1] \[Robot 2]      \[Robot 3] \[Robot N] ...

&#x20;    each robot = independent "edge node":

&#x20;      - local map belief

&#x20;      - A\*/D\* Lite planner

&#x20;      - task-scoring model

&#x20;      - conflict/priority negotiation

&#x20;      - peer discovery (who's nearby)

Key design point for the demo: the orchestrator/broker only relays messages between robots — it never decides anything. Kill it, and robots already in motion keep negotiating directly and finish their current task (this is your "fail-safe" slide, made real).



6\. Core Modules

Module	Responsibility	Approach

Comms layer	Robots discover neighbors, exchange position/task/intent	Pub/sub topics per robot, simulating ad-hoc mesh (MQTT or Redis pub/sub for prototype; Zenoh/ROS2 DDS for real hardware later)

Path planning	Per-robot route to goal, replans on blocks	A\* for static, D\* Lite for dynamic replanning

Conflict resolution	Two robots want the same cell/aisle	Fixed priority (e.g. lower ID or higher urgency wins) + time-slot reservation table shared with immediate neighbors

Task allocation	Which robot takes which job	Lightweight local scoring: score = f(travel\_time, battery, current\_load, congestion\_estimate), robots bid/announce, nearest-best wins — no central dispatcher

Congestion prediction	Anticipate jams before they happen	Simple heuristic or small regression/decision-tree model trained on simulated traffic density — this is your "edge AI"

Fail-safe	Network/server loss	Robot falls back to last known reservations + conservative local rules (stop-and-wait, peer-only negotiation)

7\. Frontend Recommendation

Build one web dashboard, not a mobile app — judges and warehouse ops will use this on a laptop/big screen during a live demo.



Type: Single-page real-time dashboard, 3 panels:



Live warehouse map — top-down grid, robots as moving icons, colored by state (moving / waiting / replanning / idle), shelves as blocks, live path lines.

Event/decision log — scrolling feed of what robots are actually deciding ("R3 yielded aisle 4 to R7 — lower priority", "R5 lost connection — falling back to local rules"). This is what makes the "AI" visible to judges instead of a black box.

Metrics strip — tasks completed, avg wait time, deadlocks avoided, active connections, network status toggle (to trigger the "kill the network" demo live).

A control bar lets you spawn/remove robots, drop a random link, block an aisle — all on stage, live.



8\. Preferred Stack

Layer	Choice	Why

Frontend	React + TypeScript + Tailwind CSS	Fast to build, huge ecosystem, easy real-time state updates

Map rendering	PixiJS (or Konva for simpler needs)	WebGL-accelerated 2D canvas, smooth for 20+ moving agents, better than SVG at this scale

Charts	Recharts	Quick metrics strip, minimal setup

Real-time transport	Socket.IO (WebSocket)	Dashboard ↔ orchestrator live feed

Orchestrator/backend	Python + FastAPI (or Node.js if your team is stronger there)	Spins up robot agent processes, exposes WebSocket, hosts simulation clock

Robot agent logic	Python (asyncio, one task/process per robot)	Matches planning-algorithm ecosystem (numpy, networkx)

Inter-robot messaging	MQTT (Eclipse Mosquitto) for prototype; note Zenoh or ROS2 DDS as the real-hardware equivalent in your report	MQTT is trivial to simulate a mesh with in software; DDS/Zenoh is what real edge robots would use

Path planning	Custom A\* + D\* Lite; Conflict-Based Search (CBS) for dense conflict cases	Matches your references slide (Stern et al., Boyarski et al.)

Edge AI model	Small scikit-learn regressor/decision tree, exported as a lightweight scorer (or plain heuristic if time-constrained)	Keeps "AI" honest and explainable without needing GPU/TFLite complexity for a hackathon

Data/logging	SQLite for run logs, Redis for fast pub/sub + reservation table	Zero-ops, easy to demo

Packaging	Docker Compose — one container per robot + broker + dashboard	Lets you literally docker stop robot-3 on stage to prove fault tolerance

9\. Integrations Checklist

&#x20;MQTT broker (Mosquitto) or Redis pub/sub — the message relay

&#x20;WebSocket bridge from orchestrator to dashboard

&#x20;A\*/D\* Lite/CBS planning library (write your own — it's the core IP of the project)

&#x20;Warehouse layout config (JSON grid: shelves, aisles, charging stations, spawn/goal points)

&#x20;Fault-injection hooks (kill process, drop MQTT connection, block a cell)

&#x20;Metrics logger (SQLite table: task completions, wait times, conflicts resolved)

&#x20;Docker Compose file to spin the whole thing up with one command

&#x20;(Stretch/bonus) ROS2 bridge or a Raspberry Pi + small bot kit for a physical demo alongside the simulation

10\. Suggested Build Order (hackathon timeline)

Phase	Deliverable

1	Grid warehouse model + single-robot A\* pathing, no comms yet

2	Multi-robot spawn, MQTT relay, robots see each other's position

3	Conflict resolution (priority + reservations) working for 2 robots sharing an aisle

4	Task allocation scoring across N robots

5	Dashboard: map + event log wired to live WebSocket feed

6	Fault injection (kill robot/network) + metrics panel

7	Polish: demo script, seed a scenario that clearly shows deadlock avoidance

11\. Success Metrics for the Demo

Fleet keeps completing tasks after the orchestrator/broker is killed.

Zero collisions / deadlocks across a stress scenario (e.g., 10 robots, 3 shared aisles).

Visibly lower average wait time vs. a "dumb" first-come-first-served baseline you show side by side.

