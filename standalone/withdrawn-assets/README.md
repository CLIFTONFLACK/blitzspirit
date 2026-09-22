# Withdrawn product photography

Photos for products no longer in the catalogue. They live outside `src/assets/`
deliberately: `src/lib/images.ts` globs `/src/assets/**`, so anything left in there
is emitted into the build whether a page references it or not — which would publish
the photography of a withdrawn product.

To bring a product back, move its files into `src/assets/products/` and restore its
entry in `src/data/catalogue.json`.

- `tee-boudica-black.jpg`, `tee-boudica-offwhite.jpg` — The Boudica (#01), withdrawn 2026-09-08
- `tee-tommy-black.jpg`, `tee-tommy-white.jpg` — The Roll Call (#03), withdrawn 2026-09-08
- `tee-clerk-black.jpg`, `tee-clerk-white.jpg` — The Clerk (#05), withdrawn 2026-09-22: not in the Printful store
- `tee-roundel-black.jpg` — The Frequency (#04) in OXY_BLACK, withdrawn 2026-09-22: Printful stocks Navy and Natural only
