# Product

## Register

product

## Users

Venezuelan CPAs (Contadores Publicos) managing payroll, inventory, and accounting for multiple SME clients simultaneously. They work in office environments during business hours, often switching between 3-10 company contexts in a single session. Their primary job: accurate, compliant financial calculations (payroll, ISLR, IVA, prestaciones sociales) under Venezuelan labor law (LOTTT) and tax regulations (SENIAT). Secondary job: generating reports and documents for clients and regulatory bodies.

These are professionals who value precision over aesthetics. They notice when a number is wrong before they notice a color is off. Speed and keyboard efficiency matter; they process dozens of employees and transactions daily.

## Product Purpose

kont replaces fragmented desktop accounting tools (Profit Plus, Saint, spreadsheets) with a unified, multi-tenant SaaS platform for Venezuelan accounting. It handles payroll calculation, inventory management, accounting journals, purchases, sales, and document storage under a single subscription model.

Success looks like: a CPA opens kont, selects a client company, completes their payroll run or inventory operation in minutes instead of hours, and moves to the next company without logging out. Zero ambiguity in calculations, zero compliance risk, zero context-switching friction.

## Brand Personality

Precise, reliable, efficient.

The voice is direct and professional. No marketing fluff inside the app. Labels say exactly what they mean. Numbers are the interface; decoration stays out of their way. Confidence comes from correctness, not from visual flourish.

Emotional goal: the user should feel like they're using a tool built by someone who understands Venezuelan accounting, not a generic template adapted for it.

## Anti-references

- **Legacy Venezuelan accounting software** (Profit Plus, Saint, AdminPAQ): gray interfaces, 3D beveled buttons, clipart icons, cramped layouts, Windows XP aesthetic. kont should feel like a generation leap, not an incremental update.
- **Generic SaaS templates**: hero sections with purple/blue gradients, glassmorphism cards, "Get Started Free" CTAs everywhere, Vercel-template aesthetics. kont is a professional tool, not a startup pitch deck.
- **Overly playful productivity apps**: cartoon illustrations, confetti animations, gamification badges. The users are accountants handling real money and legal compliance.

## Design Principles

1. **Numbers are the interface.** Every screen exists to show, calculate, or validate a number. Typography, alignment, and spacing serve numerical clarity above all else.
2. **Expert confidence.** Assume the user knows accounting. Don't over-explain, don't add training wheels. Surface power directly; hide nothing behind "are you sure?" when the action is routine.
3. **Multi-context fluency.** Company switching, module switching, and period switching must feel instant and unambiguous. The user always knows which company, which period, which module they're in.
4. **Compliance is infrastructure, not decoration.** Venezuelan legal requirements (LOTTT, SENIAT, ISLR, IVA) are built into calculations, not bolted on as warnings or badges. The system is correct by default.
5. **Density over emptiness.** Professionals prefer information-dense screens over spacious layouts with one card per viewport. Respect screen real estate; white space is intentional rhythm, not filler.

## Accessibility & Inclusion

WCAG AA compliance. 4.5:1 contrast ratio for text, 3:1 for interactive components. The codebase already maintains documented contrast ratios with OKLCH-calculated overrides. Semantic HTML, keyboard navigation, and ARIA labels are established patterns. Status indicators must never rely on color alone.
