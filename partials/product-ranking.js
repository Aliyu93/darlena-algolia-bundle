/**
 * Product Ranking - Re-ranks products using Redis endpoints
 */
import { redisService } from '../services/redis-service.js';

class ProductRanking extends HTMLElement {
    constructor() {
        super();
        this.page = 0;
        this.loading = false;
        this.hasMore = true;
        this.ids = [];
        this.container = null;
        this.originalList = null;
        this.usingSallaFilter = false;
        this.timeout = null;
    }

    async connectedCallback() {
        const categoryId = this.getAttribute('category-id');
        const tagId = this.getAttribute('tag-id');
        console.log('[PR Element] Connected:', {categoryId, tagId});

        if (!categoryId && !tagId) return;

        try {
            await this.waitForSalla();
            this.setupFilterListener();
            await this.initialize(categoryId, tagId);
        } catch (err) {
            console.error('[PR Element] Error:', err);
            this.restoreOriginalList();
        }
    }

    // Restore original list if redis fails
    restoreOriginalList() {
        if (!this.originalList || this.usingSallaFilter) return;

        const currentList = document.querySelector('.ranked-products, salla-products-list[filter]');
        const parent = currentList?.parentNode || this.originalList.parentNode;

        if (currentList) currentList.remove();
        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        if (parent && !parent.querySelector('salla-products-list')) {
            parent.appendChild(this.originalList.cloneNode(true));
            window.salla?.event?.dispatch('twilight::mutation');
        }
    }

    setupFilterListener() {
        document.addEventListener('change', e => {
            if (e.target.id !== 'product-filter') return;

            const value = e.target.value;

            if (value === 'ourSuggest' && this.usingSallaFilter) {
                this.applyRedisRanking();
            } else if (value !== 'ourSuggest') {
                this.applySallaFilter(value);
            }
        });
    }

    async applySallaFilter(filterValue) {
        const categoryId = this.getAttribute('category-id');
        const tagId = this.getAttribute('tag-id');

        if (!this.originalList) {
            return;
        }

        const currentList = document.querySelector('.ranked-products, salla-products-list[filter]');
        const parent = currentList?.parentNode || this.container?.parentNode;
        if (!parent) return;

        if (currentList) currentList.remove();
        if (this.container) {
            this.container.remove();
            this.container = null;
        }

        this.cleanupScrollListener();

        this.usingSallaFilter = true;

        const list = this.originalList.cloneNode(true);
        list.setAttribute('filter', filterValue);
        parent.appendChild(list);

        window.salla?.event?.dispatch('twilight::mutation');
    }

    async applyRedisRanking() {
        const categoryId = this.getAttribute('category-id');
        const tagId = this.getAttribute('tag-id');

        this.usingSallaFilter = false;

        await this.initialize(categoryId, tagId, true);
    }

    async initialize(categoryId, tagId, force = false) {
        console.log('[PR Element] Initialize called');
        if (this.container && !this.usingSallaFilter && !force) return;

        const selector = categoryId
            ? 'salla-products-list[source="product.index"], salla-products-list[source="categories"]'
            : 'salla-products-list[source="product.index.tag"], salla-products-list[source^="tags."]';

        const existingList = document.querySelector(selector);
        console.log('[PR Element] Existing list found:', !!existingList);
        if (!existingList) {
            return;
        }

        if (!this.originalList) {
            this.originalList = existingList.cloneNode(true);
        }

        // Reset filter to default on page load/navigation
        const filter = document.getElementById('product-filter');
        if (filter) {
            filter.value = 'ourSuggest';
            this.usingSallaFilter = false;
        } else if (filter && filter.value !== 'ourSuggest' && !force) {
            this.usingSallaFilter = true;
            return;
        }

        const dataPromise = categoryId
            ? redisService.getCategoryProducts(categoryId, 0, 12)
            : redisService.getTagProducts(tagId, 0, 12);

        const parent = existingList.parentNode;
        this.container = document.createElement('div');
        this.container.className = 'ranked-products';
        parent.insertBefore(this.container, existingList);

        // Set a fallback timeout - if Redis doesn't respond in 2.5s, restore original
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            if (!this.ids || !this.ids.length) {
                this.restoreOriginalList();
            }
        }, 2500);

        const data = await dataPromise;
        clearTimeout(this.timeout);
        console.log('[PR Element] Redis data received:', data?.objectIDs?.length, 'products');
        console.log('[PR Element] Redis product IDs:', data.objectIDs);

        if (!data?.objectIDs?.length) {
            console.warn('[PR Element] No products from Redis, restoring original');
            this.restoreOriginalList();
            return;
        }

        this.ids = data.objectIDs;
        this.page = 0;
        this.hasMore = true;

        this.usingSallaFilter = false;

        const list = document.createElement('salla-products-list');
        list.setAttribute('source', 'selected');
        list.setAttribute('source-value', JSON.stringify(this.ids));
        list.setAttribute('limit', this.ids.length);
        list.className = existingList.className || 'w-full';
        this.container.appendChild(list);

        existingList.remove();

        window.salla?.event?.dispatch('twilight::mutation');

        // Wait for Salla to render, then reorder DOM to match Redis
        this.applyOrderToList(this.container, this.ids);

        this.setupScrollListener();
    }

    setupScrollListener() {
        this.cleanupScrollListener();
        this._boundScrollHandler = this.handleScroll.bind(this);
        window.addEventListener('scroll', this._boundScrollHandler);
    }

    cleanupScrollListener() {
        if (this._boundScrollHandler) {
            window.removeEventListener('scroll', this._boundScrollHandler);
            this._boundScrollHandler = null;
        }
    }

    handleScroll() {
        if (this.loading || !this.hasMore || this.usingSallaFilter) return;

        const scrolled = window.scrollY + window.innerHeight;
        const threshold = document.documentElement.scrollHeight * 0.5; // Load products earlier at 50% scroll

        if (scrolled > threshold) {
            this.loadMore();
        }
    }

    async loadMore() {
        if (this.loading || !this.hasMore) return;

        this.loading = true;

        try {
            const nextPage = this.page + 1;
            const offset = nextPage * 12;

            const categoryId = this.getAttribute('category-id');
            const tagId = this.getAttribute('tag-id');

            const data = categoryId
                ? await redisService.getCategoryProducts(categoryId, offset, 12)
                : await redisService.getTagProducts(tagId, offset, 12);

            if (!data?.objectIDs?.length) {
                this.hasMore = false;
                return;
            }

            const list = document.createElement('salla-products-list');
            list.setAttribute('source', 'selected');
            list.setAttribute('source-value', JSON.stringify(data.objectIDs));
            list.setAttribute('limit', data.objectIDs.length);
            list.className = 'w-full';
            this.container.appendChild(list);

            this.page = nextPage;
            this.hasMore = data.hasMore !== false;

            window.salla?.event?.dispatch('twilight::mutation');

            // Reorder this pagination batch
            this.applyOrderToList(list, data.objectIDs);
        } catch (err) {
            this.hasMore = false;
        } finally {
            this.loading = false;
        }
    }

    async waitForSalla() {
        if (window.salla) return;
        return new Promise(resolve => {
            document.addEventListener('salla::ready', resolve, {once: true});
            setTimeout(resolve, 3000);
        });
    }

    applyOrderToList(container, ids, maxAttempts = 30) {
        if (!container || !ids || !ids.length) return;

        let attempt = 0;
        const intervalId = setInterval(() => {
            attempt++;

            // Find all product cards in this specific container
            const cards = Array.from(container.querySelectorAll(
                'custom-salla-product-card, .s-product-card-entry'
            ));

            // Check if we have cards rendered
            if (cards.length > 0) {
                clearInterval(intervalId);

                // Create a map of product ID -> card element
                const cardMap = new Map();
                cards.forEach(card => {
                    // Use same extraction logic as product-card-enhancer.js
                    let productId = null;

                    // Method 1: data-id attribute (PRIMARY - Salla uses this)
                    if (card.dataset.id) {
                        productId = card.dataset.id;
                    }
                    // Method 2: id attribute (if numeric)
                    else if (card.id && !isNaN(card.id)) {
                        productId = card.id;
                    }
                    // Method 3: Extract from product link URL
                    else {
                        const link = card.querySelector('.s-product-card-image a, .s-product-card-content-title a');
                        if (link?.href) {
                            const match = link.href.match(/\/product\/[^\/]+\/(\d+)/);
                            if (match) productId = match[1];
                        }
                    }

                    if (productId) {
                        cardMap.set(String(productId), card);
                    }
                });

                // Get the parent container where cards are rendered
                const parent = cards[0].parentNode;
                if (!parent) return;

                // Reorder cards to match Redis IDs
                ids.forEach(redisId => {
                    const card = cardMap.get(String(redisId));
                    if (card && parent.contains(card)) {
                        parent.appendChild(card); // Move to end in correct order
                    }
                });

                console.log('[PR Element] Reordered', cards.length, 'cards to match Redis order');
            } else if (attempt >= maxAttempts) {
                // Give up after maxAttempts * 100ms
                clearInterval(intervalId);
                console.warn('[PR Element] Cards never appeared, skipping reorder');
            }
        }, 100); // Check every 100ms
    }

    disconnectedCallback() {
        this.cleanupScrollListener();
        clearTimeout(this.timeout);
    }
}

customElements.get('product-ranking') || customElements.define('product-ranking', ProductRanking);
export default ProductRanking;
