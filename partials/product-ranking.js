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
        
        if (!categoryId && !tagId) return;
        
        try {
            await this.waitForSalla();
            this.setupFilterListener();
            await this.initialize(categoryId, tagId);
        } catch (err) {
            // Error handling without logging
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
        if (this.container && !this.usingSallaFilter && !force) return;
        
        const selector = categoryId 
            ? 'salla-products-list[source="product.index"], salla-products-list[source="categories"]'
            : 'salla-products-list[source="product.index.tag"], salla-products-list[source^="tags."]';
            
        const existingList = document.querySelector(selector);
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
        
        if (!data?.objectIDs?.length) {
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
    
    disconnectedCallback() {
        this.cleanupScrollListener();
        clearTimeout(this.timeout);
    }
}

customElements.get('product-ranking') || customElements.define('product-ranking', ProductRanking);
export default ProductRanking; 