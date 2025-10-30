import { redisService } from '../services/redis-service.js';

class CartAddonsSlider extends HTMLElement {
    constructor() {
        super();
        this.initialized = false;
        this.productIds = [];
    }

    connectedCallback() {
        if (this.initialized) return;
        
        this.getHighestValueItemFromDOM()
            .then(productId => {
                if (productId) {
                    return this.fetchFrequentlyBoughtProducts(productId);
                }
                return [];
            })
            .then(() => {
                this.renderProductList();
                setTimeout(() => {
                    this.initializeSlider();
                }, 1000);
            })
            .catch(error => {
                console.error('[CartAddonsSlider] Error loading products:', error);
            });
    }

    async getHighestValueItemFromDOM() {
        try {
            const cartItemForms = document.querySelectorAll('form[id^="item-"]');
            
            if (!cartItemForms || cartItemForms.length === 0) {
                console.log('[CartAddonsSlider] No cart items found in DOM');
                return null;
            }
            
            let highestValueItem = null;
            let highestValue = 0;
            
            cartItemForms.forEach(form => {
                try {
                    const formId = form.getAttribute('id') || '';
                    const itemId = formId.replace('item-', '');
                    
                    const productLink = form.querySelector('a[href*="/p"]');
                    if (!productLink) {
                        console.log('[CartAddonsSlider] No product link found in form', formId);
                        return;
                    }
                    
                    const productUrl = productLink.getAttribute('href');
                    const productIdMatch = productUrl.match(/\/p(\d+)(?:$|\/|\?)/);
                    
                    if (!productIdMatch || !productIdMatch[1]) {
                        console.log('[CartAddonsSlider] Could not extract product ID from URL', productUrl);
                        return;
                    }
                    
                    const productId = productIdMatch[1];
                    
                    const totalElement = form.querySelector('.item-total');
                    
                    if (totalElement) {
                        const totalText = totalElement.textContent || totalElement.innerText || '0';
                        const cleanedText = totalText
                            .replace(/[^\d.,٠١٢٣٤٥٦٧٨٩]/g, '')
                            .replace(/٠/g, '0')
                            .replace(/١/g, '1')
                            .replace(/٢/g, '2')
                            .replace(/٣/g, '3')
                            .replace(/٤/g, '4')
                            .replace(/٥/g, '5')
                            .replace(/٦/g, '6')
                            .replace(/٧/g, '7')
                            .replace(/٨/g, '8')
                            .replace(/٩/g, '9');
                        
                        const totalValue = parseFloat(cleanedText.replace(',', '.')) || 0;
                        
                        console.log(`[CartAddonsSlider] Item ${itemId}: Product ID ${productId}, Total: ${totalValue}`);
                        
                        if (!isNaN(totalValue) && totalValue > highestValue) {
                            highestValue = totalValue;
                            highestValueItem = {
                                itemId,
                                productId,
                                total: totalValue
                            };
                        }
                    }
                } catch (err) {
                    console.error('[CartAddonsSlider] Error processing item form:', err);
                }
            });
            
            if (highestValueItem) {
                console.log('[CartAddonsSlider] Highest value item:', highestValueItem);
                return highestValueItem.productId;
            }
            
            return null;
        } catch (error) {
            console.error('[CartAddonsSlider] Error extracting cart data from DOM:', error);
            return null;
        }
    }

    async fetchFrequentlyBoughtProducts(productId) {
        try {
            console.log('[CartAddonsSlider] Fetching frequently bought products for:', productId);
            const productIds = await redisService.getFrequentlyBought(productId);

            if (productIds && productIds.length > 0) {
                console.log('[CartAddonsSlider] Found frequently bought products:', productIds);
                this.productIds = productIds.map(id => String(id)).slice(0, 8);
                return this.productIds;
            } else {
                console.log('[CartAddonsSlider] No frequently bought products found');
                this.productIds = [];
                return [];
            }
        } catch (error) {
            console.error('[CartAddonsSlider] Error fetching frequently bought products:', error);
            this.productIds = [];
            return [];
        }
    }

    renderProductList() {
        if (!this.productIds || this.productIds.length === 0) {
            console.log('[CartAddonsSlider] No products to render, hiding component');
            this.style.display = 'none';
            return;
        }
        
        console.log('[CartAddonsSlider] Rendering product list with IDs:', this.productIds);
        
        const container = this.querySelector('.frequently-bought-container');
        if (!container) {
            console.error('[CartAddonsSlider] Container not found');
            return;
        }
        
        const productsList = document.createElement('salla-products-list');
        productsList.setAttribute('source', 'selected');
        productsList.setAttribute('loading', 'lazy');
        productsList.setAttribute('source-value', JSON.stringify(this.productIds));
        productsList.setAttribute('class', 's-products-list-vertical-cards');
        
        container.innerHTML = '';
        container.appendChild(productsList);
        
        const touchIndicator = document.createElement('div');
        touchIndicator.classList.add('touch-indicator');
        this.appendChild(touchIndicator);
        
        console.log('[CartAddonsSlider] Product list rendered');
    }

    initializeSlider() {
        try {
            const productsList = this.querySelector('salla-products-list');
            if (!productsList) {
                console.log('[CartAddonsSlider] Products list not found');
                return;
            }

            productsList.style.opacity = '1';
            
            if (window.salla?.event?.dispatch) {
                window.salla.event.dispatch('twilight::mutation');
            }
            
            this.initialized = true;
            console.log('[CartAddonsSlider] Slider initialized');
        } catch (error) {
            console.error('[CartAddonsSlider] Failed to initialize cart addons slider:', error);
        }
    }
}

if (!customElements.get('cart-addons-slider')) {
    customElements.define('cart-addons-slider', CartAddonsSlider);
    console.log('[CartAddonsSlider] Custom element defined');
}

export default CartAddonsSlider; 