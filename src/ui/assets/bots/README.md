# Character portraits

The owner requested corresponding black-and-white Transformer heads for six supported bot names.

- `bumblebee.png`: owner's supplied 570 × 624 image. An SVG viewport displays the head and omits lettering; the file is unmodified.
- `autobot.png`: owner's supplied faction emblem, retained as a reference. It is not used as Optimus Prime's avatar.
- `optimus-prime.png`, `ratchet.png`, `wheeljack.png`, `arcee.png`, `jazz.png`: generated character interpretations using the built-in image-generation tool on September 9, 2026. Each is 1254 × 1254 and copied without raster edits.

CSS displays black ink as white using grayscale, contrast, inversion and screen blending. Portraits depend on names, never roles, instructions, engines or permissions. Legacy custom names retain initials. These depict existing Transformers characters and are not claimed as official artwork.

## Generation

Initial prompt: “Use case: logo-brand. Asset: black-and-white character avatar for a dark desktop app, readable at 32px. Create one recognizable head-only portrait of [character description]. Match the supplied Bumblebee emblem's bold flat stencil style, but draw THIS named Transformer accurately, not Bumblebee and not the generic Autobot insignia. Centered frontal symmetric head, no shoulders. Pure white positive silhouette with transparent negative spaces and a genuinely transparent background. No colors, gradients, shading, outlines around the image, border, badge, words, letters, labels or watermark. Strong clean geometric shapes, few large readable details, entire helmet comfortably inside a square with 10% transparent margin. Reference image is style only; do not include its text. Return one square icon asset.”

Descriptions specified Optimus's tall antennae and mouthplate; Ratchet's squared medic helmet and face; Wheeljack's large ear fins and mouthplate; Arcee's rounded helmet with circular side sections and face; Jazz's domed helmet and broad visor. Bumblebee was the style reference. The initial transparency pass damaged details and was rejected after inspection.

Final edit prompt, applied separately to each inspected portrait: “Edit this [character] Transformer head portrait into a clean black and white stencil icon. Preserve its recognizable character helmet and face proportions. CRITICAL: solid pure white OPAQUE background, NO transparency. Draw the helmet plates in solid black with broad pure white cutouts separating every major panel, eyes, mouthplate or mouth. Bold flat black ink and white negative spaces only. Smooth clean edges. Remove ALL speckles, distress, texture, tiny detail and thin hairline strokes. Main features must remain distinct at 32px. Symmetric centered frontal head only, no text, no logo badge, no border. Keep 10% white margin in a square composition. The result should resemble a crisp black silhouette insignia with expressive white internal gaps, never a nearly solid filled head.”

Final sources under the tool's `generated_images/01a08702-b3f3-78a3-a966-ccfcfa1d08cf` output directory:

| Character     | Source filename                                 |
| ------------- | ----------------------------------------------- |
| Optimus Prime | `exec-e007e2f1-d240-4ed3-b9c8-fe76fddeb83b.png` |
| Ratchet       | `exec-2fbf2b5f-644b-44bf-a576-d3ace70cde3c.png` |
| Wheeljack     | `exec-840f43c5-5ca4-4725-91da-96c2523a9654.png` |
| Arcee         | `exec-8187a141-10a2-42c5-b8a8-7a2dae166870.png` |
| Jazz          | `exec-72857866-fd9a-4add-a09a-42b55fa55ca0.png` |
