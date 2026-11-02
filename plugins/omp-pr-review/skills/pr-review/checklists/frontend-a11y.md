# Frontend a11y and UX-state checklist

Load when: diff touches `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.html`, `*.css`/`*.scss`, templates, or UI component libraries. Skip for non-rendering code (hooks/stores with no markup change).

## Flag
Standard: WCAG 2.2 AA. Report only on added/changed markup.
### Accessibility
- Interactive element with no accessible name — icon-only `<button>`/`<a>`/`<input>` lacking text, `aria-label`, `aria-labelledby`, or `title`; quote the element and confirm no wrapper supplies a name (SC 4.1.2).
- `div`/`span`/`li` with `onClick` acting as a control — no `role`, no `tabIndex=0`, no Enter/Space key handler; check whether a design-system component (`Button`, `Link`) already wraps this before reporting (SC 2.1.1).
- Modal/dialog/drawer/popover — no initial focus move, no focus trap, Esc not closing, or focus not returned to the trigger on close; native `<dialog>`/`inert`/library primitives (Radix, Headless UI, React Aria) handle this, so verify the custom code bypasses them (SC 2.4.3, 2.1.2).
- Focus lost on conditional render — focused element unmounted (delete row, step change) without moving focus; `outline: none`/`:focus { outline: 0 }` added with no replacement `:focus-visible` style (SC 2.4.7).
- State conveyed by color alone — error/success/required/selected differs only in `color`/`border-color`; no text, icon, or `aria-*` equivalent (SC 1.4.1).
- `<img>` / `<svg role="img">` that carries information with missing `alt` or generic `alt="image"`; decorative images with non-empty alt where adjacent text repeats it (SC 1.1.1).
- Form control without association — `<input>`/`<select>`/`<textarea>` with no `<label for>`, wrapping label, or `aria-label`; placeholder as only label; error text not linked via `aria-describedby`/`aria-invalid`; new `autocomplete` missing on identity/address/payment fields (SC 1.3.1, 3.3.2, 1.3.5).
- ARIA misuse that breaks semantics — `role="button"` on `<a href>` or native `<button>` with conflicting role; `aria-hidden="true"` on a focusable element or its ancestor; `aria-label` on a non-interactive `div`/`span` with no role; invalid role/attribute pairs; `tabIndex` > 0.
- Dynamic updates invisible to AT — toast/validation/async result inserted with no `role="status"`/`role="alert"`/`aria-live` where nothing else announces it (SC 4.1.3).
- Target size / reflow — new interactive target visibly < 24×24 CSS px with no spacing; fixed `px` container that blocks 320px reflow, only when the CSS makes it provable (SC 2.5.8, 1.4.10).
### UX state bugs
- Async fetch/mutation UI with no loading, error, or empty state where sibling components in the repo handle them; trace the promise rejection to a blank or frozen screen.
- Double-submit — submit/pay/create handler with no disabled/pending guard or idempotency key; show that a second click before the response sends a second request.
- Layout shift — media or async content inserted with no reserved size (`width`/`height`, `aspect-ratio`, skeleton) in a region above existing content.
- State not reset/cleaned — error or loading flag never cleared on success/retry, leaving the UI stuck.

## Do not flag
- Visual taste: spacing, color palette, typography, animation preference, "looks cramped".
- Contrast ratios eyeballed from hex values; report only when both colors are literal and the computed ratio is stated (< 4.5:1 text, < 3:1 UI).
- Missing `alt`/labels on elements rendered by a component that supplies them internally (check the component).
- `aria-*` redundant with native semantics when harmless (`role="button"` on `<button>` is a lint nit, not a defect).
- Pre-existing inaccessible markup the diff only moves or re-indents.
- Storybook, test fixtures, and dev-only/admin tooling pages unless the repo states a11y rules for them.
- Missing `prefers-reduced-motion` support on short, non-essential transitions.

## Severity
- Critical: a core flow (login, checkout, primary form) is unusable by keyboard or screen reader; double-submit causes duplicate charges/records.
- Important: modal without focus management, unlabeled form field or icon button on a main path, color-only error state, missing error state that leaves a blank screen.
- Minor: missing `aria-live` on a secondary toast, layout shift on a minor widget, undersized target on a rarely used control.
