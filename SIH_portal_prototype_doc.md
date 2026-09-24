# Team Zenith | SIH 2026 | PS ID 26123
# Edge-AI Based Distributed Fleet Coordination for AMRs

## 1. Executive Summary

The current prototype in [amr_fleet_dashboard.html](amr_fleet_dashboard.html) is a visually convincing simulation dashboard that demonstrates the core idea of distributed fleet coordination: robots move in a warehouse grid, conflict events are visible, and the system can show a fail-safe mode when the network is disabled. This is suitable for the SIH portal submission as a proof-of-concept demo, but it is not yet a full implementation of the architectural PRD.

The project is currently best positioned as:
- a live demo prototype for judges,
- a concept validation for autonomous decentralized routing,
- a strong first milestone for a future full simulator/backend stack.

It is not yet a complete production-grade distributed AMR coordination platform.

---

## 2. PRD Match Assessment

| PRD Requirement | Current Status | Evidence in Prototype | Gap / Remaining Work |
|---|---|---|---|
| 2D grid warehouse simulator | Strong match | Grid-based map, shelf blocks, AMR icons, moving targets | Limited realism; static shelves, no real warehouse config JSON |
| 5–20 simulated AMR agents | Strong match | UI supports up to 20 robots; default is 8 | No real multi-process or thread architecture yet |
| Each robot acts as independent edge node | Partial | Each robot has local state and movement behavior | No true isolated process, no independent messaging bus, no peer state model |
| Local path planning | Partial | Simple BFS path generation | No A* / D* Lite implementation, no dynamic replanning logic |
| Peer-to-peer messaging layer | Partial | Simulated network toggle and P2P conflict messages | No actual MQTT/Redis pub-sub, no real robot-to-robot message exchange |
| Conflict resolution / reservation | Partial | Visual negotiation label and yield events | No reservation table, no real shared aisle logic, no deterministic priority model |
| Task allocation scoring | Weak | Basic target reassignment on completion | No local scoring model like travel time, battery, congestion |
| Fault injection | Strong for demo | Network OFFLINE toggle and visual fail-safe mode | No kill-robot, link-drop, lane-block simulation beyond UI toggle |
| Live dashboard | Strong match | Map, status bars, event log, metrics | Not yet connected to real backend data stream |
| Metrics | Strong match | Tasks completed, wait time, deadlocks avoided | Not tied to actual system metrics or comparison with centralized baseline |
| “Kill server / drop network” demo | Strong match | Toggle to disable network and show fallback state | Needs stronger proof using real decentralized behavior, not just a UI simulation |
| Throughput/deadlock comparison | Partial | Deadlock metric exists | No real baseline vs centralized dispatcher |
| Future-work items | Not yet represented | Not explicitly listed in current demo | Needs a slide/section clarifying out-of-scope items |

---

## 3. What is Already Good for the SIH Portal

The current file is already enough to show the following on the portal:

### 3.1 Strong visual story
- A warehouse grid with shelves and robot movement is immediately understandable.
- The interface looks like a real control room rather than a non-functional mock.
- The event log presents decisions in a way judges can understand.

### 3.2 Core innovation is visible
- The idea of “decentralized edge coordination” is demonstrated through:
  - independent robot movement,
  - conflict negotiation events,
  - network fail-safe behavior,
  - live diagnostics.

### 3.3 Demo-friendly fault model
- The network OFFLINE toggle is a good way to show the central orchestrator being removed while robots continue operating.
- This directly aligns with the PRD’s strongest selling point: “kill the server, robots still complete tasks.”

### 3.4 Very suitable for a hackathon portal deck
- The screen looks polished enough for a portal submission.
- The use of metrics and event-stream style logging helps explain the AI logic without needing hardware.

---

## 4. What is Still Remaining

The following items are still missing if we want the prototype to match the PRD more honestly:

### 4.1 Real distributed architecture
- No true isolated robot processes.
- No actual peer-to-peer communication using MQTT/Redis or similar.
- No real broker-only relay structure.

### 4.2 Real coordination logic
- The current system simulates visual negotiation, but does not truly implement:
  - A* path planning,
  - D* Lite dynamic replanning,
  - priority-based reservation windows,
  - conflict-based route negotiation,
  - local task allocation scoring.

### 4.3 Metric credibility
- “Tasks done”, “avg wait”, and “deadlocks avoided” are visually presented but not validated through a real simulation engine, baseline comparison, or statistical log output.

### 4.4 Fault injection realism
- The current network toggle is a good proof-of-concept, but the PRD expects more realistic failure modes:
  - kill a robot,
  - drop a network link,
  - block an aisle,
  - validate task continuation without a central controller.

### 4.5 Configurability and reproducibility
- The simulator should support runnable scenarios and warehouse layouts via configuration files to make the demo repeatable.
- No route or scenario seeds are defined yet.

---

## 5. What Can Be Done Better

The current prototype can be improved quickly and effectively for the SIH stage without moving to full hardware.

### 5.1 Replace the fake logic with a clearer logic chain
Instead of purely visual conflict triggers, the prototype should present a real decision flow:
- robot computes path,
- robot broadcasts intent,
- robot checks local reservations,
- robot requests or yields aisle access,
- robot recalculates route if blocked.

### 5.2 Make the “AI” explainable
The event log should highlight decisions such as:
- “R4 yielded aisle 7 to R8 due to higher urgency”
- “R2 re-routed after congestion threshold breach”
- “Broker lost; local fallback rules active”

This matches the PRD’s emphasis on judges being able to understand what the system is doing.

### 5.3 Show central-vs-decentral comparison clearly
Add a simple benchmark panel:
- centralized baseline,
- decentralized mode,
- task completion rate,
- mean wait time,
- deadlock count,
- network outage performance.

This is important because the PRD explicitly demands a metric showing improvement over centralized dispatch.

### 5.4 Add scenario presets
Create demo modes like:
- Normal flow,
- Aisle congestion,
- Network outage,
- Robot failure,
- High-priority task burst.

This makes the portal demo more convincing and repeatable.

### 5.5 Improve realism without heavy engineering
Even without hardware, the system can become much stronger by adding:
- obstacle-aware path planning,
- priority and age-based reservations,
- congestion heuristics,
- random but configurable robot failures,
- a script to run a 10-robot stress test.

---

## 6. What is Enough for a SIH Portal Submission

For the portal submission, the current prototype is enough if the project is positioned honestly as:

### Minimum acceptable portal story
1. A live warehouse map simulation is shown.
2. Multiple robots operate independently in the same environment.
3. The event log shows negotiation and conflict resolution.
4. The system can continue operating when the “central network” is turned off.
5. The dashboard includes metrics and a clear explanation of the distributed coordination concept.
6. The prototype is described as a simulation-based proof of coordination logic rather than an actual physical AMR implementation.

### This is enough if the submission emphasizes:
- concept validation,
- real-time explainability,
- decentralized decision-making,
- resilience under network failure,
- hackathon stage readiness.

### This is not enough if the submission claims:
- full multi-agent system deployment,
- actual robot-to-robot communication in production,
- completed A* / D* Lite / MQTT-based fleet architecture,
- physical AMR hardware integration.

---

## 7. Honest Status Statement for Submission

The current prototype should be described as:

> “A functional UI-level simulation prototype of a distributed edge-AI AMR coordination system, designed to validate the core logic of decentralized planning, peer-to-peer negotiation, and fail-safe operation under network disruption. It is intended as a hackathon-ready demonstration and concept proof rather than a full hardware-integrated fleet solution.”

This statement is honest, aligned with the PRD, and appropriate for SIH portal use.

---

## 8. Recommended Filing for Portal

For the portal, the team should present the following sections:
- Problem statement
- Solution idea
- Architecture diagram
- Live demo screenshots/video
- Fail-safe demo description
- Metrics summary
- Limitations and future work
- Why this prototype matters for SIH

This should be accompanied by a short note clarifying that the current implementation is a simulation prototype and the final system would extend it with real message relays, path planning, and deployment orchestration.

---

## 9. Final Verdict

### Status: Good for SIH portal prototype submission
The current dashboard is strong enough to communicate the value of the solution and prove the concept visually.

### Status: Not yet complete according to the full PRD
The project still needs real backend logic, actual peer messaging, robust planning algorithms, and stronger benchmark validation before it can be treated as a complete decentralized AMR orchestration system.

### Recommended positioning
Use it as a polished prototype demo for the portal, not as a final architecture claim.

---

## 10. Suggested one-line summary for submission

“An edge-AI, peer-to-peer warehouse fleet coordination simulator that demonstrates autonomous robot negotiation, fail-safe operation under network loss, and lower deadlock risk compared with centralized dispatch.”
