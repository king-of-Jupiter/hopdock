# Interface motion

The existing warm Hopdock theme uses short directional motion, inspired by the CSS entry patterns in [Radix UI](https://www.radix-ui.com/primitives/docs/guides/animation). Library view transitions use the native [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate), without adding a runtime dependency.

- Drawers enter from the right in 340ms; their backdrop fades in over 220ms and their content follows with a short reveal.
- Host and group cards reveal in order. Delays are capped at 200ms so long libraries remain quick to use.
- Context menus enter in 160ms; notifications enter from the right in 300ms.
- New tabs appear in 220ms; active tabs have a short underline reveal.
- Snippets and navigation panels enter from their respective edges.
- Library views fade and move 6px over 220ms. Live terminal content is excluded.
- Buttons, folder icons, chevrons, field borders and theme surfaces have restrained interaction transitions.

CSS uses opacity and transforms for entry animations. Animations do not retain transforms after finishing, so fixed menus and overlays retain their usual positioning. System reduced-motion preferences disable CSS animations/transitions and skip JavaScript view animations. Closing a conditional view still removes it immediately.

Validation: production build, typecheck, UI interaction checks including dragging selections out of both key drawers, and an explicit normal/reduced-motion check. The existing Electron suite also checks SSH session preservation while toggling panels.
