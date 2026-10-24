// A small fictional vault, used when the page is opened with ?demo=1
// (screenshots, trying the extension without an Obsidian vault).
window.DEMO_VAULT = {
  "Home.md": "# Home\n\nStarting point of the vault.\n\n- [[Daily notes]]\n- [[Projects]]\n- [[Learning]]\n- [[Reading list]]\n\n#index",
  "Daily notes.md": "# Daily notes\n\n- [[2026-10-23]]\n- [[2026-10-22]]\n\n> [!tip] Habit\n> One short note a day is enough.",
  "Journal/2026-10-23.md": "# 23 October\n\n- [x] Review the [[Home lab]] firewall rules\n- [ ] Read a chapter of [[Networking basics]]\n- [ ] Write up the [[CTF practice]] challenge\n\nBack to [[Daily notes]].",
  "Journal/2026-10-22.md": "# 22 October\n\n==Idea==: show the vault graph in the browser's new tab page. See [[Ideas]].",
  "Projects/Projects.md": "# Projects\n\n- [[Home lab]]\n- [[Personal website]]\n- [[CTF practice]]",
  "Projects/Home lab.md": "---\ntags: [homelab, networking]\n---\n# Home lab\n\nA small lab to practise **network security**.\n\n| Device | Role |\n|---|---|\n| Mini PC | Hypervisor |\n| Old router | Isolated VLAN |\n\n```bash\nnmap -sV 192.168.56.0/24\n```\n\nRelated: [[Networking basics]], [[Linux commands]].",
  "Projects/Personal website.md": "# Personal website\n\nStatic site, still to start: [[Site design]].\n\n#project",
  "Projects/CTF practice.md": "# CTF practice\n\nNotes from beginner challenges. Uses [[Linux commands]] and [[Cryptography basics]].\n\n#ctf",
  "Learning/Learning.md": "# Learning\n\n- [[Networking basics]]\n- [[Linux commands]]\n- [[Cryptography basics]]",
  "Learning/Networking basics.md": "# Networking basics\n\n> [!note] TCP vs UDP\n> TCP is connection-oriented, UDP is not.\n\nBack to [[Learning]]. #networking",
  "Learning/Linux commands.md": "# Linux commands\n\n- `ss -tulpn`: listening sockets\n- `journalctl -u ssh`: service logs\n\n[[Learning]]",
  "Learning/Cryptography basics.md": "# Cryptography basics\n\nSymmetric vs asymmetric encryption, hashing, signatures.\n\n[[Learning]] #crypto",
  "Reading list.md": "# Reading list\n\n- [[Book notes]]\n- Articles saved for later",
  "Book notes.md": "# Book notes\n\nHighlights and ideas from books. [[Reading list]]",
  "Ideas.md": "# Ideas\n\n- Connect the [[Home]] note to the new tab page\n- Automate backups for the [[Home lab]]",
  "Inbox.md": "Unsorted thoughts, to move to [[Ideas]] later."
};
