/**
 * Product Ranking Init - Detects and ranks category/tag products
 */
import './partials/product-ranking.js';

let initialized = false;
let initAttempts = 0;
const MAX_ATTEMPTS = 2;

function initRanking() {
  // Prevent multiple initializations
  if (initialized) return;

  // Track attempts to prevent infinite retries
  initAttempts++;
  if (initAttempts > MAX_ATTEMPTS) return;

  // Check for category page
  const categoryList = document.querySelector('salla-products-list[source="product.index"], salla-products-list[source="categories"]');
  if (categoryList) {
    const categoryId = categoryList.getAttribute('source-value');
    if (categoryId) {
      createRanking('category', categoryId);
      initialized = true;
      return;
    }
  }

  // Check for tag page
  const tagList = document.querySelector('salla-products-list[source="product.index.tag"], salla-products-list[source^="tags."]');
  if (tagList) {
    const tagId = tagList.getAttribute('source-value');
    if (tagId) {
      createRanking('tag', tagId);
      initialized = true;
      return;
    }
  }

  // If we reach here and this is the first attempt, retry after a delay
  // This helps with slow-loading Salla components
  if (initAttempts < MAX_ATTEMPTS) {
    setTimeout(initRanking, 800);
  }
}

function createRanking(type, id) {
  // Check if already exists to prevent duplicates
  if (document.querySelector(`product-ranking[${type}-id="${id}"]`)) {
    return;
  }

  const ranking = document.createElement('product-ranking');
  ranking.setAttribute(`${type}-id`, id);
  document.body.appendChild(ranking);
}

// Reset on navigation
document.addEventListener('salla::page::changed', () => {
  initialized = false;
  initAttempts = 0;

  // Remove any existing rankings
  document.querySelectorAll('product-ranking').forEach(el => el.remove());

  // Initialize on next tick after page change
  setTimeout(initRanking, 100);
});

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRanking);
} else {
  initRanking();
  document.addEventListener('salla::ready', () => {
    if (!initialized) {
      setTimeout(initRanking, 100);
    }
  });
}

export default {};
