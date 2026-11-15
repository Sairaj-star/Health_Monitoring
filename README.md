# IoT Based Multi-Parameter Health Monitoring & Alert System

A real-time patient health monitoring dashboard built for an **ESP32-based IoT telemetry system**. It streams vital signs from biomedical sensors to **ThingSpeak Cloud** and visualizes live metrics, trend waveforms, telemetry logs, and clinical threshold alerts on a responsive web dashboard deployed on **Render**.

---

## Live Architecture Overview

```text
[Biomedical Sensors] ──► [ESP32-D0WD-V3] ──► [0.96" I2C OLED Display (Local)]
                                │
                                ▼ (Wi-Fi / HTTP REST)
                      [ThingSpeak Cloud]
                       Channel ID: 3579817
                                │
                                ▼ (JSON Feed API - 15s Poll)
                    [Web Dashboard on Render]