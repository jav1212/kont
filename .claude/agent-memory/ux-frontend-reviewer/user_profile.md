---
name: User Profile
description: Role and context of the user working on KONT
type: user
---

Working on KONT, a Venezuelan payroll and inventory management system.
The codebase uses Next.js 16 App Router, HeroUI components, and Tailwind CSS 4.
Project is production-facing for Venezuelan businesses managing nómina (payroll).

Key domain context:
- Salary in VES (Bolívares), bonuses in USD converted via BCV exchange rate
- LOTTT = Venezuelan labor law governing calculations
- Two-week pay periods (quincenas)
- User base: Venezuelan HR/accounting staff

UX review focus areas observed:
- Accessibility compliance (WCAG AA) was severely lacking
- Color contrast is the primary reported user complaint
- Both light and dark modes need equal treatment
