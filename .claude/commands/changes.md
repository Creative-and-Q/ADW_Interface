---
description: Show all working changes compared to git branch
---

git diff HEAD && echo -e "\n--- Untracked files ---\n" && git ls-files --others --exclude-standard
