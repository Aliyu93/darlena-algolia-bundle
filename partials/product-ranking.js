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
        console.log('[ProductRanking] connectedCallback fired');
        const categoryId = this.getAttribute('category-id');
        const tagId = this.getAttribute('tag-id');
        console.log('[ProductRanking] IDs from attributes:', { categoryId, tagId });

        if (!categoryId && !tagId) {
            console.warn('[ProductRanking] No category or tag ID found, exiting');
            return;
        }

        try {
            console.log('[ProductRanking] Starting initialization sequence');
            await this.waitForSalla();
            console.log('[ProductRanking] Salla ready, setting up filter listener');
            this.setupFilterListener();
            console.log('[ProductRanking] Calling initialize()');
            await this.initialize(categoryId, tagId);
            console.log('[ProductRanking] Initialization complete');
        } catch (err) {
            console.error('[ProductRanking] Error during initialization:', err);
            this.restoreOriginalList();
        }
    }
    
    // Restore original list if redis fails
    restoreOriginalList() {
        console.log('[ProductRanking] restoreOriginalList() called');

        if (!this.originalList || this.usingSallaFilter) {
            console.log('[ProductRanking] Cannot restore:', {
                hasOriginal: !!this.originalList,
                usingSallaFilter: this.usingSallaFilter
            });
            return;
        }

        const currentList = document.querySelector('.ranked-products, salla-products-list[filter]');
        const parent = currentList?.parentNode || this.originalList.parentNode;

        if (currentList) {
            currentList.remove();
            console.log('[ProductRanking] Removed current ranked list');
        }
        if (this.container) {
            this.container.remove();
            this.container = null;
            console.log('[ProductRanking] Removed .ranked-products container');
        }

        if (parent && !parent.querySelector('salla-products-list')) {
            parent.appendChild(this.originalList.cloneNode(true));
            console.log('[ProductRanking] Restored original products list');
            window.salla?.event?.dispatch('twilight::mutation');
            console.log('[ProductRanking] twilight::mutation event dispatched');
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
        console.log('[ProductRanking] initialize() called', { categoryId, tagId, force });

        if (this.container && !this.usingSallaFilter && !force) {
            console.log('[ProductRanking] Container already exists and not forcing, skipping');
            return;
        }

        const selector = categoryId
            ? 'salla-products-list[source="product.index"], salla-products-list[source="categories"]'
            : 'salla-products-list[source="product.index.tag"], salla-products-list[source^="tags."]';

        console.log('[ProductRanking] Looking for products list with selector:', selector);
        const existingList = document.querySelector(selector);

        if (!existingList) {
            console.error('[ProductRanking] Products list not found! Selector did not match any element');
            return;
        }

        console.log('[ProductRanking] Found existing products list:', {
            tagName: existingList.tagName,
            source: existingList.getAttribute('source'),
            sourceValue: existingList.getAttribute('source-value'),
            className: existingList.className
        });

        if (!this.originalList) {
            this.originalList = existingList.cloneNode(true);
            console.log('[ProductRanking] Cloned original list for backup');
        }

        // Reset filter to default on page load/navigation
        const filter = document.getElementById('product-filter');
        if (filter) {
            filter.value = 'ourSuggest';
            this.usingSallaFilter = false;
            console.log('[ProductRanking] Reset filter to ourSuggest');
        } else if (filter && filter.value !== 'ourSuggest' && !force) {
            this.usingSallaFilter = true;
            console.log('[ProductRanking] Filter not set to ourSuggest, using Salla filter instead');
            return;
        }

        console.log('[ProductRanking] Fetching ranked products from Redis...');
        const dataPromise = categoryId
            ? redisService.getCategoryProducts(categoryId, 0, 12)
            : redisService.getTagProducts(tagId, 0, 12);

        const parent = existingList.parentNode;
        this.container = document.createElement('div');
        this.container.className = 'ranked-products';
        parent.insertBefore(this.container, existingList);
        console.log('[ProductRanking] Created .ranked-products container');

        // Set a fallback timeout - if Redis doesn't respond in 2.5s, restore original
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            console.warn('[ProductRanking] Redis timeout after 2.5s, restoring original list');
            if (!this.ids || !this.ids.length) {
                this.restoreOriginalList();
            }
        }, 2500);

        const data = await dataPromise;
        clearTimeout(this.timeout);

        console.log('[ProductRanking] Redis response received:', {
            hasData: !!data,
            hasObjectIDs: !!data?.objectIDs,
            count: data?.objectIDs?.length || 0
        });

        if (!data?.objectIDs?.length) {
            console.warn('[ProductRanking] No products returned from Redis, restoring original');
            this.restoreOriginalList();
            return;
        }

        this.ids = data.objectIDs;
        this.page = 0;
        this.hasMore = true;

        console.log('[ProductRanking] Storing product IDs:', this.ids.length, 'products');

        this.usingSallaFilter = false;

        console.log('[ProductRanking] Creating new ranked products list...');
        const list = document.createElement('salla-products-list');
        list.setAttribute('source', 'selected');
        list.setAttribute('source-value', JSON.stringify(this.ids));
        list.setAttribute('limit', this.ids.length);
        list.className = existingList.className || 'w-full';

        console.log('[ProductRanking] New list attributes set:', {
            source: list.getAttribute('source'),
            sourceValue: list.getAttribute('source-value'),
            limit: list.getAttribute('limit'),
            className: list.className
        });

        this.container.appendChild(list);
        console.log('[ProductRanking] New list appended to .ranked-products container');

        existingList.remove();
        console.log('[ProductRanking] Original list removed from DOM');

        window.salla?.event?.dispatch('twilight::mutation');
        console.log('[ProductRanking] twilight::mutation event dispatched');

        this.setupScrollListener();
        console.log('[ProductRanking] Scroll listener set up for infinite scroll');
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
        } catch (err) {
            this.hasMore = false;
        } finally {
            this.loading = false;
        }
    }
    
    async waitForSalla() {
        console.log('[ProductRanking] Checking for Salla framework...');
        if (window.salla) {
            console.log('[ProductRanking] Salla framework already loaded');
            return;
        }
        console.log('[ProductRanking] Waiting for salla::ready event (max 3s timeout)');
        return new Promise(resolve => {
            document.addEventListener('salla::ready', () => {
                console.log('[ProductRanking] salla::ready event received');
                resolve();
            }, {once: true});
            setTimeout(() => {
                console.warn('[ProductRanking] Salla wait timeout after 3 seconds');
                resolve();
            }, 3000);
        });
    }
    
    disconnectedCallback() {
        this.cleanupScrollListener();
        clearTimeout(this.timeout);
    }
}

customElements.get('product-ranking') || customElements.define('product-ranking', ProductRanking);
export default ProductRanking; 