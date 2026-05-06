---
name: brainstorm
description: Run multi-agent brainstorm on a topic. Gemini generates options, Claude synthesizes. Optionally include Codex for code alternatives.
---

Args: topic from user input.

> Sherpa: brainstorm with G Gemini only · GC Gemini + Codex · N skip

G:
1. `[G] "7 alternatives for [topic]. Each: name · tradeoff · 1 sentence. [OUT]"`
2. Claude synthesizes, applies constraints, decides. Final call: Claude only.

GC:
1. `[G] "7 alternatives for [topic]. Each: name · tradeoff · 1 sentence. [OUT]"`
2. `[C] exec "Alternatives for [topic]. Each: approach · tradeoff · 3-line sketch. [OUT]"`
3. Claude synthesizes all output, applies constraints, decides. Final call: Claude only.
