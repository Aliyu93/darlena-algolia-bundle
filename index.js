/**
 * Algolia Integration Bundle
 * Standalone bundle for Redis/Algolia-powered features:
 * - Category ranking
 * - Product recommendations
 * - Homepage category sliders
 * - Cart frequently bought together
 */

// Static imports – esbuild bundles these automatically
import { redisService } from './services/redis-service.js';
import CartAddonsSlider from './components/CartAddonsSlider.js';
import './partials/product-ranking.js';       // Registers <product-ranking> custom element
import './partials/category-products.js';     // Registers <mahaba-category-products> custom element
import productRecommendations from './partials/product-recommendations.js';
import './product-ranking-init.js';           // Sets up category/tag page ranking
import './partials/youtube-lazy.js';          // YouTube lazy loading
import './partials/product-card-enhancer.js'; // Auto-enhances product cards with image sliders

// Expose globals expected by legacy theme code
window.productRecommendations = productRecommendations;
window.redisService = redisService;

// DOM-ready helper
const onReady = (fn) =>
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn)
    : fn();

/**
 * Injects the custom <mahaba-category-products> element onto the homepage.
 * Works with stock Raed theme (body.index class and .app-inner container).
 */
function runHomepageInjection() {
  // Correct homepage detection for stock Raed theme
  if (!document.body.classList.contains('index')) {
    console.log('[Algolia Bundle] Not on homepage, skipping category products injection');
    return;
  }

  const ANCHOR_SELECTOR = '.app-inner';
  const ELEMENT_TAG = 'mahaba-category-products';

  function injectElement() {
    const anchor = document.querySelector(ANCHOR_SELECTOR);

    if (anchor && !anchor.querySelector(ELEMENT_TAG)) {
      try {
        console.log(`[Algolia Bundle] Found ${ANCHOR_SELECTOR}, injecting ${ELEMENT_TAG}...`);
        const newElement = document.createElement(ELEMENT_TAG);

        // Insert BEFORE footer (not after)
        const footer = document.querySelector('.store-footer');
        if (footer) {
          anchor.insertBefore(newElement, footer);
        } else {
          anchor.appendChild(newElement);  // Fallback
        }

        console.log('✅ [Algolia Bundle] Homepage category component injected successfully');
        return true;
      } catch (e) {
        console.error('[Algolia Bundle] Error during injection:', e);
        return true;
      }
    }
    return false;
  }

  // Try immediate injection
  if (injectElement()) {
    return;
  }

  // Setup MutationObserver for async content
  console.log(`[Algolia Bundle] ${ANCHOR_SELECTOR} not found, waiting for async load...`);

  const observer = new MutationObserver((mutations, obs) => {
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);

    if (hasAddedNodes && injectElement()) {
      obs.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function runCartAddonsInjection() {
  const ensure = () => {
    const submitButton = document.querySelector('#cart-submit');
    if (!submitButton) return false;

    const submitWrap = submitButton.closest('.cart-submit-wrap') || submitButton.parentElement;
    const parent = submitWrap?.parentElement || submitWrap;
    if (!parent) return false;

    if (parent.querySelector('cart-addons-slider')) {
      return true;
    }

    const slider = document.createElement('cart-addons-slider');
    slider.className = 'cart-addons-wrapper';

    if (submitWrap && parent) {
      parent.insertBefore(slider, submitWrap.nextSibling);
    } else {
      parent.appendChild(slider);
    }

    console.log('[Algolia Bundle] Injected cart addons slider');
    return true;
  };

  if (document.querySelector('cart-addons-slider')) return;

  if (ensure()) return;

  const observer = new MutationObserver((mutations, obs) => {
    if (ensure()) {
      obs.disconnect();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

onReady(() => {
  // 1. Homepage: Inject category products component
  runHomepageInjection();

  // 2. Product page: Initialize recommendations (works correctly, unchanged)
  const isProductPage = document.querySelector('[id^="product-"]');

  if (isProductPage) {
    setTimeout(() => {
      productRecommendations.initialize();
      console.log('✅ [Algolia Bundle] Product recommendations initialized');
    }, 3000);
  }

  // 3. Cart page: Ensure cart addons slider exists
  if (document.querySelector('form[id^="item-"]') || document.querySelector('#cart-submit')) {
    setTimeout(runCartAddonsInjection, 500);
  }

  console.log('✅ [Algolia Bundle] Loaded successfully');
});

document.addEventListener('salla::page::changed', () => {
  productRecommendations.reset();
  setTimeout(() => {
    productRecommendations.initialize();
  }, 1000);

  setTimeout(runCartAddonsInjection, 500);
});
