# lūtera product guidelines

Version: 1.0  
Established: 2026-11-21  
Scope: All lūtera software, websites, creative tools, documentation, GitHub repositories, and releases.

This is the shared product design source for lūtera. Other projects should reference it directly and add a small local specification for needs unique to that product. The rules marked **required** are not suggestions.

## 1. Identity and tone

lūtera is a personal creative world. Each product should feel authored, quietly distinctive, light, precise, atmospheric, and useful. Create a sense of discovery without sacrificing speed or clarity.

**Required:** Always write the brand as `lūtera`, lowercase with the macron. Do not print `LŪTERA`, `Lūtera`, or `LUTERA` as decorative branding. Plain `lutera` is acceptable only in filenames, package identifiers, domains, and other technical contexts that do not comfortably support the macron.

Brand presence is restrained. Usually one wordmark is enough. A product title already establishes what the product is; do not repeat the product name, version, or creator across several surfaces.

## 2. Writing rules

**Required:** Never use em dashes, including in UI labels, comments, source documentation, release notes, GitHub issues, pull requests, commit messages, or project descriptions. Rewrite with commas, periods, colons, parentheses, or separate sentences.

Make every line earn its space. Remove filler taglines, status claims that add no information, decorative slogans, redundant branding, repeated instructions, arbitrary punctuation, and version numbers shown in multiple places. Use short, specific, restrained language. Favor action labels over explanatory paragraphs. If removing a line improves comprehension, remove it.

Do not automatically attach broad lūtera phrases to unrelated projects. In particular, `as within, so without` is not a default app footer or mandatory brand slogan.

## 3. Color and materials

The current preferred visual atmosphere uses warm ambient light, ivory, parchment, champagne, and soft stone. The material language uses cool silver or chrome, graphite, glass, fine outlines, and quiet highlights.

Reference palette, adaptable to context:

- Ivory: `#F7F4ED`
- Parchment: `#EEE9DF`
- Champagne light: `#EBDDC4`
- Ambient amber glow: `#E8C589`
- Silver or chrome: `#BCC3C2`
- Graphite: `#2E3538`

Amber is atmospheric lighting, not a copper UI trim or an excuse to make controls orange. Avoid generic bright-blue software dashboards, excessive glassmorphism, saturated accents, floating card clutter, and ornamental color with no function. Do not treat the palette as immutable for every medium, but preserve the light and cool-metal contrast.

## 4. Typography

Use a small, intentional type system, usually one editorial display serif and one readable interface sans. Reserve monospaced typography for measurements, timestamps, filenames, and technical readouts where it genuinely helps. Define exact roles and apply them consistently across panels, buttons, placeholders, captions, and menus.

Avoid arbitrary mixing of fonts, letterspacing, capitalization, and weight. The wordmark should feel crafted and consistent across products. Preserve the brand's lowercase spelling. Make the visual hierarchy obvious without relying on dozens of font treatments.

## 5. Composition and interaction

**Required:** Prioritize the workflow over decoration. Frequently used actions should remain within reach, including while scrolling long collections. Consider a sticky action rail, fixed transport, or persistent import control rather than forcing a scroll to the end.

Use deliberate spacing, exact centering, balanced silhouettes, and clean component alignment. Icons must be optically and geometrically centered. Distinguish states clearly. Avoid controls that look interactive but do nothing.

Motion should be smooth, calm, subtle, and functional. Prefer transforms and opacity over expensive layout animations. Respect reduced-motion settings. Maintain keyboard access, focus visibility, legible text, and sensible layouts at small window sizes.

## 6. Symbolism and ornament

Architectural doors, thresholds, restrained gothic geometry, ornamental keys, and top-down flower or rosette forms are recurring exploratory motifs. They are expressive rather than mandatory. The flower should read from above, not as a tulip profile. A provisional motif is not a final logo.

Show ornaments fully unless cropping is a deliberate, visually balanced composition. Avoid clipped crowns, stray dots, arbitrary circles, misaligned symbols, and generic decoration pasted onto controls. Every decorative element must reinforce the product identity or be removed.

## 7. Branding placement

Prefer a single tasteful `lūtera` wordmark in a deliberate location such as a footer. Avoid unnecessary headers duplicating the title, `made by lūtera`, and `a lūtera instrument` if authorship is already clear. Avoid redundant version numbers in the hero or chrome. Functional update controls can live in the product's main context rather than requiring a permanent extra navigation bar.

## 8. Audio and creative software

Use clear, responsive A/B states, accurate waveform and time displays, low-latency playback controls, and predictable exports. Keep processing quality and measurement accuracy ahead of visual effects. A displayed estimate must have a defined method, uncertainty, and a candid fallback if the reference audio is not confidently matchable.

Do not replace a verified audio algorithm merely to compensate for perceptual differences between instruments or recordings. Preserve source files and make transformed outputs easy to name and retrieve.

## 9. Project inheritance and maintenance

Each project should keep a short local `DESIGN_GUIDELINES.md` or similar file that states it follows this shared document, then records only project-specific layout, interaction, and visual decisions.

When design feedback changes a general rule, update this shared document. When it affects one product only, record it locally. Review rendered results at realistic desktop sizes, reduced window sizes, and keyboard navigation before treating a design change as finished.

## 10. Current varispeed decisions (project-specific example)

Retain the warm, neutral palette and two-tone large title. Keep the doorway entirely visible. Remove redundant top navigation and move Updates into the hero. Make Add tracks persist while scrolling the collection. Correct the empty-state plus alignment. Use consistent serif, sans, and numeric font roles. Add a clearly labeled reference pitch estimate with reliability status. Use one centered lowercase `lūtera` wordmark in the footer, without an extra slogan or `made by` text. Do not change the exact-cent resampling algorithm on aesthetic grounds.

These points are an example of inheritance. They are not universal requirements for unrelated products.
