---
name: search
description: >
  Web search via Gemini native Google Search. Trigger: look up, find docs, google this, latest version, check online, current info, search web, research topic, external info.
  TRIGGER when: answer needs external or current source not in local files.
  SKIP: info exists in local repo.
---

Args: query from user input.

`[G] "Search: [query]. Key facts, code example if relevant, source URL. [OUT]"`
