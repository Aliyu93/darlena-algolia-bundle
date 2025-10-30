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

// Expose globals expected by legacy theme code
window.productRecommendations = productRecommendations;
window.redisService = redisService;

// DOM-ready helper
const onReady = (fn) =>
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn)
    : fn();

onReady(() => {
  // 1. Homepage: Inject category products component (mirrors original app.js logic)
  const isHomepage =
    document.body.classList.contains('page-home') ||
    window.location.pathname === '/' ||
    window.location.pathname === '';

  if (isHomepage && !document.querySelector('mahaba-category-products')) {
    const homeContent = document.querySelector('.s-home-content');
    if (homeContent) {
      const categoryComponent = document.createElement('mahaba-category-products');
      homeContent.appendChild(categoryComponent);
      console.log('✅ [Algolia Bundle] Homepage category component injected');
    }
  }

  // 2. Product page: Initialize recommendations (mirrors original product.js logic)
  const isProductPage = document.querySelector('[id^="product-"]');

  if (isProductPage) {
    setTimeout(() => {
      productRecommendations.initialize();
      console.log('✅ [Algolia Bundle] Product recommendations initialized');
    }, 3000);
  }

  console.log('✅ [Algolia Bundle] Loaded successfully');
});
