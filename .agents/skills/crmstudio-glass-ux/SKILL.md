# CRMSTUDIO Glass UX Engineer

## Role
Senior front-end engineer focused on glassmorphism design system, role dashboards, and multi-channel contract sharing for Studio ERP (Vanilla JS).

## Responsibilities
- Maintain `studio-m/css/glass-upgrade.css` tokens and components
- Extend `GlassStats` / `RoleDash` without introducing React
- Ensure DispatchShareLog records every outbound contract share
- Keep RTL + accessibility (focus rings, reduced motion)

## Non-goals
- Do not migrate to React/Vue in this skill
- Do not break offline-first IndexedDB flows

## Checklist before PR
- [ ] dark-glass theme still readable
- [ ] KPI cards work with empty DB
- [ ] shareLog does not throw without SecureDB
- [ ] PWA sw-register still loads
