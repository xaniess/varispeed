# lūtera • visual principles for varispeed

**Working direction: November 21, 2026.** This follows the newer lūtera conversations and supersedes the initial blue-led prototype. The ornamental symbol is a provisional motif, not a finalized logo.

## Atmosphere versus material

- **Atmosphere:** soft light, warm ambient reflections, an inviting threshold into a creative space. Ivory `#F7F4ED`, parchment `#EEE9DF`, champagne `#EBDDC4`. Amber `#E8C589` is reserved for faint illumination, not the color of buttons, large panels, metallic objects, or copper trim.
- **Material:** cool silver/chrome `#BCC3C2`, restrained graphite `#2E3538`, brushed stone and precise hairline edges. Contrast derives from geometry and light rather than saturation.
- Avoid the earlier signature blue, copper, excessive glassmorphism, generic floating card gardens, gratuitous glows, and loud color-coding.

## Type and structure

- An editorial display serif for the hero and quiet architectural headings; restrained UI sans for controls and monospaced numeric pitch/duration readouts.
- Meaningful hierarchy: track collection, A/B listening room, export system. Do not bury the waveforms beneath decoration.
- Use rectangular/chamfered or asymmetrically rounded shapes. Prefer precision over pill-heavy UI.
- Respect reduced-motion preferences and keyboard navigation.

## Motifs

- The **doorway / threshold** symbolizes entering lūtera's creative world. This is atmosphere, not a compulsory interaction to reach basic controls.
- Ornamental keys and a balanced abstract **seven-point rosette** may be reused as a key bow and door ornament. Keep the design lightly gothic, not overly ornate. This is an exploratory emblem direction, not an approved final mark.
- Motion should be subtle and have a function. No unnecessary animations in the core listening workflow.

## Product-specific interpretation

- A/B waveforms: original in soft metal gray; transformed in deeper graphite. One shared relative timeline for switching, with precise time readouts.
- Exact cents remain explicit: no fictional “soft dial” pitch math.
- Batch export and filename tools remain visible and predictable; avoid sacrificing task speed for stylistic effects.

Implementation: `src/styles.css` supplies layout primitives; `src/atelier.css` defines the new material and visual rules; `src-tauri/icons/` contains the revised provisional icon.
