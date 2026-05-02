Do a final README/Kanban consistency cleanup.

Do not add new features.
Do not rewrite the app.
Only fix documentation and wording inconsistencies.

Tasks:

1. Make README roadmap milestone names match the Kanban exactly:
   M1 Full-stack Scaffold
   M2 AI Extraction Engine
   M3 Database Schema & Seeding
   M4 Branding & Landing Page
   M5 Model Card 10-Tab View
   M6 Reproducibility Scoring Engine
   M7 Unit & Dimension Checker
   M8 Python ODE Template Generator
   M9 Reproducible Model Package Export
   M10 UI Polish & Demo Readiness
   M11 README & Documentation
   M12 Portability & Development Handoff
   M13 Real AI Providers
   M14 PDF Ingestion

2. Make the 14-file ZIP package list identical everywhere:
   README, Kanban, exports page, and package generator.

3. Replace overstrong unit-check wording:
   Use "heuristic unit and consistency checks" instead of claiming rigorous dimensional analysis.

4. In the black-box optimizer section, remove specific industrial platform names unless necessary.
   Use generic wording:
   "Industrial bioprocess and digital-twin platforms optimize validated processes from experimental or sensor data."

5. Update demo wording:
   "No API key is required for the demo. Without API keys, extractions use MockProvider. With OpenAI or Gemini keys configured, real providers can be selected."

6. Fix local setup repo/path naming.
   If the repository is still named Test-Run, use that in the commands.
   Add a note that the repo can later be renamed to chemai-model-compiler.

7. Add a short "Quick Demo" section near the top of the README:
   - Open app
   - View Demo Model
   - Inspect model card
   - Run simulation
   - Download model package

8. Check that the README does not claim:
   - validated simulation platform
   - certified digital twin
   - guaranteed optimization
   - rigorous dimensional algebra unless referring to future M15

After finishing:
- Tell me what documentation files changed
- Tell me any remaining inconsistencies
- Confirm production build still passes if you run it