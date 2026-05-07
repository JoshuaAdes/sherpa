---
name: brainstorm
description: >
  Multi-agent brainstorm via Gemini + optional Codex. Claude synthesizes. Trigger: think through, explore options, compare approaches, suggest alternatives, help me decide, pros and cons, generate ideas, design options.
  TRIGGER when: user wants multiple solution paths or asks for options/alternatives.
  SKIP: user gives direct implementation command.
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
