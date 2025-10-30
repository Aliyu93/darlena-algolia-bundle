/**
 * Product Ranking Init - Detects and ranks category/tag products
 */
import './partials/product-ranking.js';

let initialized = false;
let initAttempts = 0;
const MAX_ATTEMPTS = 6;
let fallbackObserver = null;

function initRanking() {
  // Prevent multiple initializations
  if (initialized) {
    console.log('[Product Ranking] Already initialized, skipping');
    return;
  }

  // Track attempts to prevent infinite retries
  initAttempts++;
  console.log(`[Product Ranking] Initialization attempt ${initAttempts}/${MAX_ATTEMPTS}`);

  if (initAttempts > MAX_ATTEMPTS) {
    console.warn('[Product Ranking] Max attempts reached, activating fallback observer');
    activateFallbackObserver();
    return;
  }

  // Check for category page
  const categoryList = document.querySelector('salla-products-list[source="product.index"], salla-products-list[source="categories"]');
  if (categoryList) {
    const categoryId = categoryList.getAttribute('source-value');
    console.log('[Product Ranking] Category list found:', {
      element: categoryList.tagName,
      source: categoryList.getAttribute('source'),
      categoryId: categoryId
    });

    if (categoryId) {
      createRanking('category', categoryId);
      initialized = true;
      return;
    } else {
      console.warn('[Product Ranking] Category list found but no source-value attribute');
    }
  }

  // Check for tag page
  const tagList = document.querySelector('salla-products-list[source="product.index.tag"], salla-products-list[source^="tags."]');
  if (tagList) {
    const tagId = tagList.getAttribute('source-value');
    console.log('[Product Ranking] Tag list found:', {
      element: tagList.tagName,
      source: tagList.getAttribute('source'),
      tagId: tagId
    });

    if (tagId) {
      createRanking('tag', tagId);
      initialized = true;
      return;
    } else {
      console.warn('[Product Ranking] Tag list found but no source-value attribute');
    }
  }

  // If we reach here, products list not found yet
  console.log('[Product Ranking] Products list not found, will retry');

  // If we reach here and this is the first attempt, retry after a delay
  // This helps with slow-loading Salla components (especially stock Raed theme)
  if (initAttempts < MAX_ATTEMPTS) {
    console.log(`[Product Ranking] Retry scheduled in 1500ms (attempt ${initAttempts + 1}/${MAX_ATTEMPTS})`);
    setTimeout(initRanking, 1500);
  }
}

function createRanking(type, id) {
  // Check if already exists to prevent duplicates
  if (document.querySelector(`product-ranking[${type}-id="${id}"]`)) {
    console.warn(`[Product Ranking] Ranking element already exists for ${type} ID: ${id}`);
    return;
  }

  console.log(`[Product Ranking] Creating ranking element for ${type} ID: ${id}`);
  const ranking = document.createElement('product-ranking');
  ranking.setAttribute(`${type}-id`, id);
  document.body.appendChild(ranking);
  console.log('[Product Ranking] Ranking element created and appended to body');

  // Disconnect fallback observer if it's running
  if (fallbackObserver) {
    fallbackObserver.disconnect();
    fallbackObserver = null;
    console.log('[Product Ranking] Fallback observer disconnected');
  }
}

/**
 * Fallback MutationObserver for late-rendering product lists
 * Activates after MAX_ATTEMPTS is reached
 */
function activateFallbackObserver() {
  if (initialized || fallbackObserver) return;

  console.log('[Product Ranking] Starting fallback MutationObserver');

  fallbackObserver = new MutationObserver((mutations) => {
    // If already initialized, disconnect and stop
    if (initialized) {
      fallbackObserver.disconnect();
      fallbackObserver = null;
      console.log('[Product Ranking] Fallback observer auto-disconnected (initialized)');
      return;
    }

    // Check if products list appeared
    const categoryList = document.querySelector('salla-products-list[source="product.index"], salla-products-list[source="categories"]');
    if (categoryList && categoryList.getAttribute('source-value')) {
      console.log('[Product Ranking] Fallback observer detected category list!');
      const categoryId = categoryList.getAttribute('source-value');
      createRanking('category', categoryId);
      initialized = true;
      return;
    }

    const tagList = document.querySelector('salla-products-list[source="product.index.tag"], salla-products-list[source^="tags."]');
    if (tagList && tagList.getAttribute('source-value')) {
      console.log('[Product Ranking] Fallback observer detected tag list!');
      const tagId = tagList.getAttribute('source-value');
      createRanking('tag', tagId);
      initialized = true;
      return;
    }
  });

  fallbackObserver.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[Product Ranking] Fallback observer activated and watching document.body');
}

// Reset on navigation
document.addEventListener('salla::page::changed', () => {
  console.log('[Product Ranking] Page changed, resetting initialization state');
  initialized = false;
  initAttempts = 0;

  // Disconnect fallback observer if running
  if (fallbackObserver) {
    fallbackObserver.disconnect();
    fallbackObserver = null;
    console.log('[Product Ranking] Fallback observer disconnected on page change');
  }

  // Remove any existing rankings
  document.querySelectorAll('product-ranking').forEach(el => el.remove());

  // Initialize on next tick after page change
  setTimeout(initRanking, 100);
});

// Initialize on page load
console.log('[Product Ranking] Module loaded, document ready state:', document.readyState);

if (document.readyState === 'loading') {
  console.log('[Product Ranking] Waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initRanking);
} else {
  console.log('[Product Ranking] Document already loaded, initializing immediately');
  initRanking();
  document.addEventListener('salla::ready', () => {
    if (!initialized) {
      console.log('[Product Ranking] salla::ready fired, attempting initialization');
      setTimeout(initRanking, 100);
    }
  });
}

export default {}; 