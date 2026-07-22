/*
 * Turn the supplied gold-on-black logos into black-on-transparent marks the
 * ivory navbar can use.
 *
 * The source art is light (gold/cream) on a near-black ground. Using the
 * image's own luminance as an ALPHA channel over a solid-black fill inverts the
 * relationship: the bright line-art becomes opaque black, the dark ground
 * becomes transparent. `linear(gain, bias)` pushes the gold to full opacity and
 * the ground to zero while keeping anti-aliased edges, so the mark stays crisp
 * rather than getting a hard threshold's jaggies.
 *
 * .cjs because apps/storefront is "type":"module"; read via fs to dodge the
 * Windows file lock sharp otherwise holds on the source path.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const DIR = path.join(__dirname, "..", "public", "demo", "products");
const OUT = path.join(__dirname, "..", "public", "brand");

const JOBS = [
  { src: "logo.png", out: "risitex-mark-black.png" },
  { src: "logofull (1).png", out: "risitex-logo-black.png" },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const job of JOBS) {
    const from = path.join(DIR, job.src);
    const to = path.join(OUT, job.out);
    if (!fs.existsSync(from)) {
      console.log(`SKIP (missing): ${job.src}`);
      continue;
    }
    const buf = fs.readFileSync(from);
    const meta = await sharp(buf).metadata();

    // Luminance → alpha, gained so art is opaque and the ground is clear.
    const alpha = await sharp(buf)
      .removeAlpha()
      .greyscale()
      .linear(1.7, -28) // gain, bias
      .toColourspace("b-w")
      .raw()
      .toBuffer();

    await sharp({
      create: {
        width: meta.width,
        height: meta.height,
        channels: 3,
        background: { r: 20, g: 20, b: 18 }, // near-black ink, not pure #000
      },
    })
      .joinChannel(alpha, { raw: { width: meta.width, height: meta.height, channels: 1 } })
      .png()
      .toFile(to);

    const outMeta = await sharp(fs.readFileSync(to)).metadata();
    console.log(`${job.src} ${meta.width}x${meta.height} -> ${job.out} ${outMeta.width}x${outMeta.height} (alpha:${outMeta.hasAlpha})`);
  }
})();
