/*
 * Resize raw Unsplash downloads for hero use.
 *
 * MUST be .cjs: apps/storefront is "type": "module", so a .js file here is
 * parsed as ESM and `require` throws.
 *
 * Reads with fs.readFileSync rather than handing sharp the path — on Windows
 * sharp keeps the source handle open, which locks the file and makes writing
 * back over it fail.
 *
 * Hero sources are wider than the usual 1500 used elsewhere in this repo: the
 * hero is full-bleed, so on a 2560px display next/image will ask for a 2560
 * candidate and upscaling a 1500 source shows.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const DIR = path.join(__dirname, "..", "public", "demo", "products");

/*
 * `keepTopFraction` crops the bottom off BEFORE resizing.
 *
 * hero-red-shorts needs it: the subject wears Adidas trainers with a clearly
 * legible trefoil at roughly 85% of the frame height. Relying on the hero's
 * centre crop to hide them is not safe — it works on desktop (the visible band
 * is 32-68% of the source) but FAILS on mobile, where a 1275x1912 portrait
 * renders 484x726 into a 726px-tall hero and the full height is shown. The
 * only crop that holds at every viewport is one baked into the file.
 */
const JOBS = [
  { src: "valeriia-petrova-T0veN4lHLr8-unsplash.jpg", out: "hero-shorts-wall.jpg", width: 2400 },
  {
    src: "daren-inshape-LlZD2SJ0bh8-unsplash.jpg",
    out: "hero-red-shorts.jpg",
    width: 1700,
    keepTopFraction: 0.79,
  },
  // Third hero slide, requested by the user. ⚠ The shorts carry visible
  // DSQUARED² branding; the user reviewed it and accepted it (2026-07-21).
  { src: "ramy-mamdouh-GchQFkmUHcE-unsplash.jpg", out: "hero-model.jpg", width: 1700 },
];

(async () => {
  for (const job of JOBS) {
    const from = path.join(DIR, job.src);
    const to = path.join(DIR, job.out);
    if (!fs.existsSync(from)) {
      console.log(`SKIP (missing): ${job.src}`);
      continue;
    }
    const before = fs.statSync(from).size;
    const buf = fs.readFileSync(from);
    const meta = await sharp(buf).metadata();
    let pipe = sharp(buf);
    if (job.keepTopFraction) {
      pipe = pipe.extract({
        left: 0,
        top: 0,
        width: meta.width,
        height: Math.round(meta.height * job.keepTopFraction),
      });
    }
    await pipe
      .resize({ width: job.width, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(to);
    const after = fs.statSync(to).size;
    const outMeta = await sharp(fs.readFileSync(to)).metadata();
    console.log(
      `${job.src}\n  ${meta.width}x${meta.height} ${(before / 1024).toFixed(0)}KB` +
        `  ->  ${job.out} ${outMeta.width}x${outMeta.height} ${(after / 1024).toFixed(0)}KB` +
        `  (-${(100 - (after / before) * 100).toFixed(0)}%)`,
    );
  }
})();
