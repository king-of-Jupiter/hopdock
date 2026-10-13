# Selected logo: variant 1

The user selected the generated sage H monogram. The production SVG is a clean geometric reconstruction of that mark, preserving its rounded posts, rising bridge, and inset notches. The wordmark stays live Lora text in the interface.

Source concept: `01-monogram.png`.
Production master: `packages/ui/src/assets/hopdock-mark.svg`.
Desktop packaging: `apps/desktop/build/hopdock-icon.png`.
Window icon: `apps/desktop/src/renderer/public/app-icon.png`.

Regenerate PNG exports with `node tools/export-logo.mjs` (Playwright Chromium required). Exported PNG files are checked in; regular app builds do not require this tool.

Built-in image_gen was used for the original concept and transparent extraction attempts. The extraction produced edge artifacts, so the selected silhouette was reconstructed as an editable SVG for crisp production rendering.

Final extraction prompt:

Create a clean production version of the H symbol in this reference image. Preserve its exact overall design and proportions: two thick rounded vertical posts and an upward diagonal connecting bridge, small rounded interior notches. Remove the text Hopdock and background. Only the H symbol, centered and enlarged to fill 80% of a square canvas. Flat solid muted sage green. Absolutely clean smooth silhouette and smooth antialiased edges. NO bright green edge fringe, NO grain, NO texture, NO shading, NO gradients. Real transparent background, opaque solid H interior. This is a simple two-dimensional app icon, faithful to the reference, not a redesign.
