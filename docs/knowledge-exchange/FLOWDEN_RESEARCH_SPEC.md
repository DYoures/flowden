# Flowden Research Specification & Knowledge Exchange Guide

- **Format Identifiers:** `flowden-markdown-knowledge` (.md) / `flowden-knowledge-package` (.flowden.zip)
- **Specification Version:** `2.0.0`
- **Recommended File Format:** Single Structured Markdown Document (`.md`)
- **Package Archive Format:** Complete Knowledge Package (`.flowden.zip`)

---

## 1. Executive Overview

### 1.1 What Is Flowden Knowledge Exchange?
**Flowden Knowledge Exchange** enables external AI research systems—including **Claude**, **ChatGPT**, **Gemini**, and **NotebookLM**—to transform comprehensive research results into a structured, interconnected Second Brain knowledge collection.

Rather than generating one monolithic, flat document, Flowden's Markdown structure decomposes research into:
1. **A Cohesive Research Project & Synthesis** (Project title and overview)
2. **Hierarchical Folders** for logical categorization
3. **Atomic, Focused Notes** with cross-referencing WikiLinks (`[[Note Title]]` or `[[fkf:note-...|Display Title]]`)
4. **Structured Bibliographic Sources** with cited excerpts
5. **Typed Semantic Relationships** connecting related concepts

---

## 2. Structured Markdown Document Specification (.md)

A single `.md` file can contain an entire interconnected research project with multiple independent Notes.

### 2.1 File Structure Template

```markdown
---
project: Adaptive Urban Heat-Island Mitigation
summary: Strategic analysis of urban cooling technologies, surface albedo, and green infrastructure.
---

# Adaptive Urban Heat-Island Mitigation

Comprehensive research synthesis on microclimatic cooling mechanisms, empirical albedo interventions, and municipal policy frameworks.

---
## Note: Microclimate Dynamics & Heat Accumulation
folder: 01 Foundations
tags: climatology, microclimate, urban-geometry

Urban heat islands (UHIs) emerge from high impervious surface fractions, reduced vegetation, and anthropogenic heat dissipation. Thermal mass in high-density urban canyons traps longwave radiation during diurnal cycles.

Primary mitigation strategies focus on radiative modification via [[Cool Roofs & Surface Albedo]] and vegetative cooling through [[Vegetation Canopies & Evapotranspiration]].

---
## Note: Cool Roofs & Surface Albedo
folder: 02 Interventions
tags: materials, albedo, radiative-cooling

High-albedo roofing materials reflect shortwave solar radiation, significantly reducing roof surface temperatures and subsequent convective heating of ambient air.

Empirical studies demonstrate that increasing municipal roof albedo by 0.2 reduces peak cooling loads by 10–20%. Connects directly with theoretical baseline in [[Microclimate Dynamics & Heat Accumulation]].

---
## Note: Vegetation Canopies & Evapotranspiration
folder: 02 Interventions
tags: green-infrastructure, urban-forestry

Urban tree canopies provide two distinct thermodynamic benefits: direct shortwave solar shading and latent heat absorption via evapotranspiration.

---
## Sources
- [src-1] Akbari, H., Pomerantz, M., & Taha, H. (2001). Cool surfaces and shade trees to reduce energy use and improve air quality in urban areas. Solar Energy, 70(3), 295-310.
  > "Cool surfaces and shade trees reduce summer cooling energy use and air temperature in cities." (p. 295)
- [src-2] Oke, T. R. (1982). The energetic basis of the urban heat island. Quarterly Journal of the Royal Meteorological Society, 108(455), 1-24.

---
## Relationships
- [[Microclimate Dynamics & Heat Accumulation]] relates_to [[Cool Roofs & Surface Albedo]]
- [[Cool Roofs & Surface Albedo]] supports [[Microclimate Dynamics & Heat Accumulation]]
```

### 2.2 Unambiguous Parsing Rules

The Flowden Markdown Importer recognizes and separates entities as follows:

1. **Project Definition:**
   - Declared via YAML frontmatter at the top of the file using `project:` (or `title:`) and `summary:`.
   - Alternatively inferred from the first top-level `# <Heading>`.

2. **Note Delimiters & Titles:**
   - Notes are separated by horizontal dividers (`---`) followed by a heading:
     `## Note: <Title>` or `# Note: <Title>`
   - The prefix `Note:` is automatically stripped to yield the canonical Note Title.

3. **Note Folders & Metadata:**
   - Directly under each note heading, declare optional metadata attributes:
     - `folder: <Folder Name>` — Organizes the note into a named folder.
     - `tags: <tag1, tag2>` — Comma-separated tags.
     - `id: <note-unique-id>` — Optional explicit note identifier (must start with `note-`).

4. **WikiLinks Between Notes:**
   - Reference other notes using natural titles: `[[Cool Roofs & Surface Albedo]]`
   - Flowden automatically links these to target Note IDs during import.
   - Flowden URI WikiLinks are also supported: `[[fkf:note-id|Display Text]]`.

5. **Optional Sources & Relationships:**
   - An optional `## Sources` section registers bibliographic citations and `> "quoted excerpts"`.
   - An optional `## Relationships` section defines typed semantic links (`supports`, `contradicts`, `relates_to`, `cites`, `derived_from`).

---

## 3. Package Archive Specification (.flowden.zip)

For complex multi-file packages containing binary attachments or companion reports, Flowden continues to support the standard `.flowden.zip` archive format containing:
- `manifest.json` — Package metadata and entity registry.
- `folders.json` — Hierarchical folder structure.
- `notes/*.md` — Markdown files for individual notes.
- `sources/index.json` — Bibliographic records.
- `relationships/links.json` — Knowledge graph edges.

---

## 4. Prompt Template for External AI Models

Copy and paste this prompt when initiating research with AI tools:

```markdown
Research this topic thoroughly. Follow the attached FLOWDEN_RESEARCH_SPEC.md exactly. Organize the findings into multiple focused, interconnected Notes using Flowden's required Markdown structure. Preserve reliable sources, citations, and relationships. Deliver one downloadable structured `.md` document or a complete `.flowden.zip` package.

Topic: [INSERT RESEARCH TOPIC]
```

---

## 5. Import Modes in Flowden

When you upload an `.md` document or `.flowden.zip` package:

### Mode A: Create New Project
- Creates a fresh Flowden Project workspace using the title and structure from your document.
- Organizes the generated notes into their respective folders with all WikiLinks and relationships connected.

### Mode B: Merge into Existing Project
- Merges the incoming notes directly into an existing authorized Flowden Project.
- Existing Notes are preserved and never overwritten. Matching note titles receive a disambiguated label `(Imported)`.
- Spatial Board content and project entities are updated cleanly.
