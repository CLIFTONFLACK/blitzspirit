/* ============================================================
   product-form.js — <product-form> custom element

   Ported from the Shopify theme with two changes, both noted inline:
   the submit is no longer native (cart.js binds [data-add-to-cart]
   instead of intercepting a form POST), and swapPlate's single-image
   fallback no longer rebuilds Shopify CDN URLs.

   Contract:
   - Parses variants from script[data-variant-json] inside the element.
   - Option buttons ([data-option-index][data-value], aria-pressed
     exclusive per [data-option-group]) resolve the current variant.
   - Updates input[name="id"], toggles the pre-rendered per-variant
     price spans inside [data-price] (money stays server-formatted —
     NEVER formatted in JS), updates [data-stock] text/state, disables
     option pills unavailable for the current selection, swaps the
     plate image by toggling [hidden] on pre-rendered
     [data-plate-frame] wrappers (srcset preserved), syncs the pressed
     [data-thumb], replaceState `?variant=` when the element carries
     data-url-update (PDP only), and fires a bubbling "variant:change"
     CustomEvent.
   - Lookup scope = closest [data-product-wrap] (fallback:
     .shopify-section, then the element itself) so multiple instances
     coexist on one page (homepage embeds). Sections embedding more
     than one product (e.g. apparel-archive rows) MUST put
     data-product-wrap on each row.
   - Adding to the bag is handled by cart.js, which binds
     [data-add-to-cart] and reads input[name="id"]. Without a Shopify
     cart there is no native form to post, so this build needs JS to
     sell; the page still renders and reads completely without it.
   ============================================================ */
(function () {
  'use strict';

  if (window.customElements.get('product-form')) return;

  function variantOptions(variant) {
    if (Array.isArray(variant.options)) return variant.options;
    return [variant.option1, variant.option2, variant.option3].filter(function (value) {
      return value !== null && value !== undefined;
    });
  }

  function toArray(list) {
    return Array.prototype.slice.call(list);
  }

  class ProductForm extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;

      this.scope =
        this.closest('[data-product-wrap]') ||
        this.closest('.shopify-section') ||
        this;

      this.idInput =
        this.querySelector('input[name="id"]') ||
        this.scope.querySelector('input[name="id"]');

      this.bindQty();
      this.bindThumbs();
      this.equalizeActions();

      var jsonEl = this.querySelector('script[data-variant-json]');
      if (!jsonEl) return;
      try {
        this.variants = JSON.parse(jsonEl.textContent);
      } catch (error) {
        this.variants = null;
      }
      if (!this.variants || !this.variants.length) return;

      this.groups = this.collectGroups();
      this.selected = this.initialSelection();

      this.bindOptions();
      this.refreshOptionAvailability();

      var current = this.currentVariant();
      if (current) this.applyVariant(current, { updateUrl: false, silent: true });
    }

    /* ---------- setup ---------- */

    collectGroups() {
      var list = this.querySelectorAll('[data-option-group]');
      if (!list.length) list = this.scope.querySelectorAll('[data-option-group]');
      return toArray(list).sort(function (a, b) {
        var ai = parseInt(a.getAttribute('data-option-index'), 10) || 0;
        var bi = parseInt(b.getAttribute('data-option-index'), 10) || 0;
        return ai - bi;
      });
    }

    findById(id) {
      if (id === null || id === undefined || id === '') return null;
      var key = String(id);
      for (var i = 0; i < this.variants.length; i++) {
        if (String(this.variants[i].id) === key) return this.variants[i];
      }
      return null;
    }

    initialSelection() {
      var variant = this.idInput ? this.findById(this.idInput.value) : null;
      if (!variant) {
        for (var i = 0; i < this.variants.length; i++) {
          if (this.variants[i].available) {
            variant = this.variants[i];
            break;
          }
        }
      }
      if (!variant) variant = this.variants[0];
      return variantOptions(variant).slice();
    }

    currentVariant() {
      return this.resolve(this.selected);
    }

    resolve(selected) {
      for (var i = 0; i < this.variants.length; i++) {
        var opts = variantOptions(this.variants[i]);
        var match = true;
        for (var j = 0; j < selected.length; j++) {
          if (opts[j] !== selected[j]) {
            match = false;
            break;
          }
        }
        if (match) return this.variants[i];
      }
      return null;
    }

    /* ---------- events ---------- */

    bindOptions() {
      var self = this;
      this.groups.forEach(function (group) {
        var index = (parseInt(group.getAttribute('data-option-index'), 10) || 1) - 1;
        group.addEventListener('click', function (event) {
          var btn = event.target.closest('[data-option-index][data-value]');
          if (!btn || btn.disabled || !group.contains(btn)) return;

          toArray(group.querySelectorAll('[data-value]')).forEach(function (other) {
            other.setAttribute('aria-pressed', String(other === btn));
          });

          self.selected[index] = btn.getAttribute('data-value');
          self.refreshOptionAvailability();
          self.applyVariant(self.resolve(self.selected), {
            updateUrl: self.hasAttribute('data-url-update')
          });
        });
      });
    }

    bindThumbs() {
      var self = this;
      toArray(this.scope.querySelectorAll('[data-thumb]')).forEach(function (thumb) {
        thumb.addEventListener('click', function () {
          var mediaId = thumb.getAttribute('data-media-id');
          var imageId = thumb.getAttribute('data-image-id');

          // Thumbnails select a variant, not just an image: find the
          // variant(s) sharing this media/image, then pick whichever one
          // keeps the most of the currently-selected options (so e.g.
          // switching colour via thumb preserves the chosen size).
          if (self.variants && self.variants.length) {
            var matches = self.variants.filter(function (v) {
              var vMediaId = v.featured_media && v.featured_media.id !== undefined ? String(v.featured_media.id) : null;
              var vImageId = v.featured_image && v.featured_image.id !== undefined ? String(v.featured_image.id) : null;
              return (mediaId !== null && vMediaId === mediaId) || (imageId !== null && vImageId === imageId);
            });

            if (matches.length) {
              var best = null;
              var bestScore = -1;
              matches.forEach(function (v) {
                var opts = variantOptions(v);
                var score = 0;
                for (var i = 0; i < opts.length; i++) {
                  if (opts[i] === self.selected[i]) score++;
                }
                if (v.available) score += 100; // prefer an in-stock match
                if (score > bestScore) {
                  bestScore = score;
                  best = v;
                }
              });

              if (best) {
                self.selected = variantOptions(best).slice();
                self.groups.forEach(function (group) {
                  var index = (parseInt(group.getAttribute('data-option-index'), 10) || 1) - 1;
                  toArray(group.querySelectorAll('[data-value]')).forEach(function (btn) {
                    btn.setAttribute('aria-pressed', String(btn.getAttribute('data-value') === self.selected[index]));
                  });
                });
                self.refreshOptionAvailability();
                self.applyVariant(best, { updateUrl: self.hasAttribute('data-url-update') });
                return;
              }
            }
          }

          // Fallback: no variant resolved (e.g. an extra editorial photo
          // with no matching variant image) -- just swap the frame.
          var frame =
            (mediaId !== null && self.scope.querySelector('[data-plate-frame][data-media-id="' + mediaId + '"]')) ||
            (imageId !== null && self.scope.querySelector('[data-plate-frame][data-image-id="' + imageId + '"]'));
          if (frame) self.showFrame(frame);
        });
      });
    }

    bindQty() {
      var input =
        this.querySelector('input[name="quantity"]') ||
        this.scope.querySelector('input[name="quantity"]');
      if (!input) return;

      function step(delta) {
        var value = parseInt(input.value, 10);
        if (isNaN(value)) value = 1;
        var min = parseInt(input.min, 10) || 1;
        input.value = Math.max(min, value + delta);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      toArray(this.scope.querySelectorAll('[data-qty-minus]')).forEach(function (btn) {
        btn.addEventListener('click', function () { step(-1); });
      });
      toArray(this.scope.querySelectorAll('[data-qty-plus]')).forEach(function (btn) {
        btn.addEventListener('click', function () { step(1); });
      });
    }

    /* Equal-height "STORY" link / "ADD TO BAG" button pair. Grid/flex
       align-items:stretch does not reliably stretch native <button>
       elements to match a sibling that has wrapped to two lines (a
       cross-browser quirk with form-control intrinsic sizing), so this
       measures both and sets an explicit min-height on the shorter one. */
    equalizeActions() {
      toArray(this.scope.querySelectorAll('.actions')).forEach(function (actions) {
        var items = toArray(actions.children);
        if (items.length < 2) return;
        items.forEach(function (item) { item.style.height = ''; });
        var tallest = 0;
        items.forEach(function (item) {
          var h = item.getBoundingClientRect().height;
          if (h > tallest) tallest = h;
        });
        items.forEach(function (item) {
          item.style.height = Math.ceil(tallest) + 'px';
        });
      });
    }

    /* ---------- option availability ---------- */

    refreshOptionAvailability() {
      var self = this;
      this.groups.forEach(function (group) {
        var index = (parseInt(group.getAttribute('data-option-index'), 10) || 1) - 1;
        toArray(group.querySelectorAll('[data-value]')).forEach(function (btn) {
          var value = btn.getAttribute('data-value');
          var available = self.variants.some(function (variant) {
            var opts = variantOptions(variant);
            if (opts[index] !== value) return false;
            for (var j = 0; j < self.selected.length; j++) {
              if (j !== index && opts[j] !== self.selected[j]) return false;
            }
            return variant.available;
          });
          btn.disabled = !available;
          btn.setAttribute('aria-disabled', String(!available));
        });
      });
    }

    /* ---------- variant application ---------- */

    applyVariant(variant, config) {
      config = config || {};
      var scope = this.scope;

      if (variant && this.idInput) this.idInput.value = variant.id;

      // Price: toggle server-rendered per-variant spans. No JS money.
      var priceBox = scope.querySelector('[data-price]');
      if (priceBox) {
        var spans = priceBox.querySelectorAll('[data-variant-price]');
        if (spans.length) {
          toArray(spans).forEach(function (span) {
            span.hidden =
              !variant || String(variant.id) !== span.getAttribute('data-variant-price');
          });
        }
      }

      // Stock indicator.
      var available = !!(variant && variant.available);
      var stock = scope.querySelector('[data-stock]');
      if (stock) {
        var label = available
          ? stock.getAttribute('data-label-in-stock')
          : stock.getAttribute('data-label-sold-out');
        if (label) stock.textContent = label;
        stock.setAttribute('data-state', available ? 'in-stock' : 'sold-out');
      }

      // Add-to-bag button (server-rendered labels toggled via [hidden]).
      var add = scope.querySelector('[name="add"]');
      if (add) {
        add.disabled = !available;
        var addLabel = add.querySelector('[data-add-label]');
        var soldLabel = add.querySelector('[data-sold-label]');
        if (addLabel && soldLabel) {
          addLabel.hidden = !available;
          soldLabel.hidden = available;
        }
      }

      this.swapPlate(variant);

      if (variant && config.updateUrl && window.history && window.history.replaceState) {
        try {
          var url = new URL(window.location.href);
          url.searchParams.set('variant', variant.id);
          window.history.replaceState({}, '', url.toString());
        } catch (error) {
          /* non-fatal */
        }
      }

      if (!config.silent) {
        this.dispatchEvent(
          new CustomEvent('variant:change', {
            bubbles: true,
            detail: {
              variant: variant,
              sectionId: this.getAttribute('data-section-id')
            }
          })
        );
      }
    }

    /* ---------- gallery ---------- */

    swapPlate(variant) {
      if (!variant) return;
      var scope = this.scope;
      var frames = toArray(scope.querySelectorAll('[data-plate-frame]'));
      var image = variant.featured_image || null;
      var imageId = image && image.id !== undefined ? String(image.id) : null;
      var mediaId =
        variant.featured_media && variant.featured_media.id !== undefined
          ? String(variant.featured_media.id)
          : null;

      if (frames.length) {
        if (imageId === null && mediaId === null) return; // keep current
        var target = null;
        frames.forEach(function (frame) {
          if (target) return;
          if (imageId !== null && frame.getAttribute('data-image-id') === imageId) {
            target = frame;
          }
        });
        if (!target && mediaId !== null) {
          frames.forEach(function (frame) {
            if (target) return;
            if (frame.getAttribute('data-media-id') === mediaId) target = frame;
          });
        }
        if (target) this.showFrame(target);
        return;
      }

      // Single-image fallback (embeds that render one plate img rather than a
      // set of frames). The Shopify version rebuilt CDN URLs by appending
      // &width=; Astro emits hashed, pre-generated files instead, so a variant
      // that wants this path must ship its own src/srcset in the variant JSON:
      //   featured_image: { id, src, srcset, alt }
      // With no src there is nothing safe to swap to, so the current image stays
      // rather than being replaced with a broken URL.
      var plate = scope.querySelector('img[data-plate]');
      if (plate && image && image.src) {
        plate.src = image.src;
        if (image.srcset) plate.srcset = image.srcset;
        if (image.alt) plate.alt = image.alt;
      }
    }

    showFrame(target) {
      var scope = this.scope;
      toArray(scope.querySelectorAll('[data-plate-frame]')).forEach(function (frame) {
        frame.hidden = frame !== target;
      });
      var mediaId = target.getAttribute('data-media-id');
      toArray(scope.querySelectorAll('[data-thumb]')).forEach(function (thumb) {
        thumb.setAttribute(
          'aria-pressed',
          String(mediaId !== null && thumb.getAttribute('data-media-id') === mediaId)
        );
      });
    }
  }

  window.customElements.define('product-form', ProductForm);

  // Text-wrap in the STORY link is viewport-width dependent, so
  // re-equalize .actions heights on resize (debounced).
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      toArray(document.querySelectorAll('product-form')).forEach(function (el) {
        if (el.equalizeActions) el.equalizeActions();
      });
    }, 150);
  });
})();
