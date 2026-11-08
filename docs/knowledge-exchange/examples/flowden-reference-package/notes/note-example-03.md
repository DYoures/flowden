---
id: note-example-03
title: "Integrated Microclimate Synthesis & Tradeoff Matrix"
disambiguation_hint: null
folder_id: fld-synthesis-tradeoffs
is_pinned: true
verification_status: synthetic_demonstration
tags:
  - urban-climate
  - synthesis
  - architecture-diagram
---

# Integrated Microclimate Synthesis & Tradeoff Matrix

## 1. Coupled Roof-to-Canyon Architecture

This synthesis integrates the envelope findings from [[fkf:note-example-01|Thermal Performance Summary (High-Albedo Cool Roof Membranes)]] with the street-level findings from [[fkf:note-example-02|Thermal Performance Summary (Vegetative Canopy Evapotranspiration)]].

![Architecture Diagram](../assets/architecture-diagram.png)

## 2. Comparative Subsystem Matrix (Synthetic Demonstration Data)

| Subsystem Note ID | Display Title | Primary Zone | Peak Daytime Delta | Nocturnal Tradeoff |
| :--- | :--- | :--- | :--- | :--- |
| `note-example-01` | Thermal Performance Summary (Cool Roofs) | Roof Envelope | -11.2 K to -18.4 K surface | Dew-point condensation soiling (`exc-albedo-moisture-02`) |
| `note-example-02` | Thermal Performance Summary (Vegetative Canopy) | Street Canyon (2 m) | -14.6 K Mean Radiant Temp | Reduced SVF slows nocturnal longwave release (`exc-canopy-lai-01`) |

## 3. Recommended Combined Deployment Pattern

1. Pair hydrophobic cool-roof membranes (`note-example-01`) on low-rise and mid-rise rooftops to suppress boundary-layer entrainment heat.
2. Deploy staggered high-LAI street trees (`note-example-02`) maintaining a minimum `0.45` Sky-View Factor corridor along prevailing night-breeze axes to prevent nocturnal longwave trapping.
