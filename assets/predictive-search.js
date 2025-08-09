import { Component } from '@theme/component';
import { debounce, onAnimationEnd, prefersReducedMotion, onDocumentReady } from '@theme/utilities';
import { sectionRenderer } from '@theme/section-renderer';
import { morph } from '@theme/morph';
import { ThemeEvents } from '@theme/events';
import { RecentlyViewed } from '@theme/recently-viewed-products';
import { DialogCloseEvent, DialogComponent } from '@theme/dialog';

/**
 * A custom element that allows the user to search for resources available on the store.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} searchInput - The search input element.
 * @property {HTMLElement} predictiveSearchResults - The predictive search results container.
 * @property {HTMLElement} resetButton - The reset button element.
 * @property {HTMLElement[]} [resultsItems] - The search results items elements.
 * @property {HTMLElement} [recentlyViewedWrapper] - The recently viewed products wrapper.
 * @property {HTMLElement[]} [recentlyViewedTitle] - The recently viewed title elements.
 * @property {HTMLElement[]} [recentlyViewedItems] - The recently viewed product items.
 * @extends {Component<Refs>}
 */
class PredictiveSearchComponent extends Component {
  requiredRefs = ['searchInput', 'predictiveSearchResults', 'resetButton'];

  #controller = new AbortController();

  /**
   * @type {AbortController | null}
   */
  #activeFetch = null;

  #resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      this.style.setProperty('--predictive-search-results-height', `${entry.contentRect.height}px`);
    }
  });

  /**
   * Get the dialog component.
   * @returns {DialogComponent | null} The dialog component.
   */
  get dialog() {
    return this.closest('dialog-component');
  }

  connectedCallback() {
    super.connectedCallback();

    const { dialog } = this;
    const { signal } = this.#controller;

    if (this.refs.searchInput.value.length > 0) {
      this.#showResetButton();
    }

    if (dialog) {
      document.addEventListener('keydown', this.#handleKeyboardShortcut, { signal });
      dialog.addEventListener(DialogCloseEvent.eventName, this.#handleDialogClose, { signal });

      this.addEventListener('click', this.#handleModalClick, { signal });
    } else {
      document.addEventListener(ThemeEvents.megaMenuHover, this.#blurSearch, { signal });
    }

    onDocumentReady(this.#getRecentlyViewed);

    const results = this.refs.predictiveSearchResults.firstElementChild;

    if (results) {
      this.#resizeObserver.observe(results);
    }
  }

  /**
   * Handles clicks within the predictive search modal to maintain focus on the input
   * @param {MouseEvent} event - The mouse event
   */
  #handleModalClick = (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    const isInteractiveElement =
      target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target instanceof HTMLInputElement ||
      target.closest('button') ||
      target.closest('a') ||
      target.closest('input');

    if (!isInteractiveElement && this.refs.searchInput) {
      this.refs.searchInput.focus();
    }
  };

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller.abort();
    this.#resizeObserver.disconnect();
  }

  /**
   * Handles the CMD+K key combination.
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKeyboardShortcut = (event) => {
    if (event.metaKey && event.key === 'k') {
      this.dialog?.toggleDialog();
    }
  };

  /**
   * Handles the dialog close event.
   */
  #handleDialogClose = () => {
    this.#resetSearch();
  };

  expandSearch = () => {
    // Add the expanded class to the search component
    this.classList.add('predictive-search--expanded');
    if (this.dataset.activeColorScheme) {
      const target = this.dialog ?? this;
      target.classList.add(`color-${this.dataset.activeColorScheme}`);
    }
  };

  get #allResultsItems() {
    const containers = Array.from(
      this.querySelectorAll(
        '.predictive-search-results__wrapper-queries, ' +
          '.predictive-search-results__wrapper-products, ' +
          '.predictive-search-results__list'
      )
    );

    const allItems = containers
      .flatMap((container) => {
        if (container.classList.contains('predictive-search-results__wrapper-products')) {
          return Array.from(container.querySelectorAll('.predictive-search-results__card'));
        }
        return Array.from(container.querySelectorAll('[ref="resultsItems[]"], .predictive-search-results__card'));
      })
      .filter((item) => item instanceof HTMLElement);

    return /** @type {HTMLElement[]} */ (allItems);
  }

  /**
   * Track whether the last interaction was keyboard-based
   * @type {boolean}
   */
  #isKeyboardNavigation = false;

  get #currentIndex() {
    return this.#allResultsItems?.findIndex((item) => item.getAttribute('aria-selected') === 'true') ?? -1;
  }

  set #currentIndex(index) {
    if (!this.#allResultsItems?.length) return;

    this.#allResultsItems.forEach((item) => {
      item.classList.remove('keyboard-focus');
    });

    for (const [itemIndex, item] of this.#allResultsItems.entries()) {
      if (itemIndex === index) {
        item.setAttribute('aria-selected', 'true');

        if (this.#isKeyboardNavigation) {
          item.classList.add('keyboard-focus');
        }
        item.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'nearest' });
      } else {
        item.removeAttribute('aria-selected');
      }
    }
    this.refs.searchInput.focus();
  }

  get #currentItem() {
    return this.#allResultsItems?.[this.#currentIndex];
  }

  /**
   * Navigate through the predictive search results using arrow keys or close them with the Escape key.
   * @param {KeyboardEvent} event - The keyboard event.
   */
  onSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      this.#resetSearch();
      return;
    }

    if (!this.#allResultsItems?.length || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      return;
    }

    const currentIndex = this.#currentIndex;
    const totalItems = this.#allResultsItems.length;

    switch (event.key) {
      case 'ArrowDown':
        this.#isKeyboardNavigation = true;
        event.preventDefault();
        this.#currentIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        break;

      case 'Tab':
        if (event.shiftKey) {
          this.#isKeyboardNavigation = true;
          event.preventDefault();
          this.#currentIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        } else {
          this.#isKeyboardNavigation = true;
          event.preventDefault();
          this.#currentIndex = currentIndex < totalItems - 1 ? currentIndex + 1 : 0;
        }
        break;

      case 'ArrowUp':
        this.#isKeyboardNavigation = true;
        event.preventDefault();
        this.#currentIndex = currentIndex > 0 ? currentIndex - 1 : totalItems - 1;
        break;

      case 'Enter':
        const singleResultContainer = this.refs.predictiveSearchResults.querySelector('[data-single-result-url]');
        if (singleResultContainer instanceof HTMLElement && singleResultContainer.dataset.singleResultUrl) {
          event.preventDefault();
          window.location.href = singleResultContainer.dataset.singleResultUrl;
          return;
        }

        if (this.#currentIndex >= 0) {
          event.preventDefault();
          this.#currentItem?.querySelector('a')?.click();
        } else {
          const searchUrl = new URL(Theme.routes.search_url, location.origin);
          searchUrl.searchParams.set('q', this.refs.searchInput.value);
          window.location.href = searchUrl.toString();
        }
        break;
    }
  };

  /**
   * Clears the recently viewed products.
   * @param {Event} event - The event.
   */
  clearRecentlyViewedProducts(event) {
    event.stopPropagation();

    RecentlyViewed.clearProducts();

    const { recentlyViewedItems, recentlyViewedTitle, recentlyViewedWrapper } = this.refs;

    const allRecentlyViewedElements = [...(recentlyViewedItems || []), ...(recentlyViewedTitle || [])];

    if (allRecentlyViewedElements.length === 0) {
      return;
    }

    if (recentlyViewedWrapper) {
      recentlyViewedWrapper.classList.add('removing');

      onAnimationEnd(recentlyViewedWrapper, () => {
        recentlyViewedWrapper.remove();
      });
    }
  }

  /**
   * Reset the search state.
   * @param {boolean} [keepFocus=true] - Whether to keep focus on input after reset
   */
  resetSearch = debounce((keepFocus = true) => {
    if (keepFocus) {
      this.refs.searchInput.focus();
    }
    this.#resetSearch();
  }, 100);

  /**
   * Debounce the search handler to fetch and display search results based on the input value.
   * Reset the current selection index and close results if the search term is empty.
   */
  search = debounce((event) => {
    // If the input is not a text input (like using the Escape key), don't search
    if (!event.inputType) return;

    const searchTerm = this.refs.searchInput.value.trim();
    this.#currentIndex = -1;

    if (!searchTerm.length) {
      this.#resetSearch();
      return;
    }

    this.#showResetButton();
    this.#getSearchResults(searchTerm);
  }, 200);

  /**
   * Resets scroll positions for search results containers
   */
  #resetScrollPositions() {
    requestAnimationFrame(() => {
      const resultsInner = this.refs.predictiveSearchResults.querySelector('.predictive-search-results__inner');
      if (resultsInner instanceof HTMLElement) {
        resultsInner.scrollTop = 0;
      }

      const formContent = this.querySelector('.predictive-search-form__content');
      if (formContent instanceof HTMLElement) {
        formContent.scrollTop = 0;
      }
    });
  }

  /**
   * Fetch search results using the section renderer and update the results container.
   * @param {string} searchTerm - The term to search for
   */
  async #getSearchResults(searchTerm) {
    if (!this.dataset.sectionId) return;

    const url = new URL(Theme.routes.predictive_search_url, location.origin);
    url.searchParams.set('q', searchTerm);
    url.searchParams.set('resources[limit_scope]', 'each');

    const { predictiveSearchResults } = this.refs;

    const abortController = this.#createAbortController();

    sectionRenderer
      .getSectionHTML(this.dataset.sectionId, false, url)
      .then((resultsMarkup) => {
        if (!resultsMarkup) return;

        if (abortController.signal.aborted) return;

        morph(predictiveSearchResults, resultsMarkup);

        this.#resetScrollPositions();
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;
        throw error;
      });
  }

  /**
   * Fetch the markup for the recently viewed products.
   * @returns {Promise<string | null>} The markup for the recently viewed products.
   */
  async #getRecentlyViewedProductsMarkup() {
    if (!this.dataset.sectionId) return null;

    const viewedProducts = RecentlyViewed.getProducts();
    if (viewedProducts.length === 0) return null;

    const url = new URL(Theme.routes.search_url, location.origin);
    url.searchParams.set('q', viewedProducts.map(/** @param {string} id */ (id) => `id:${id}`).join(' OR '));
    url.searchParams.set('resources[type]', 'product');

    return sectionRenderer.getSectionHTML(this.dataset.sectionId, false, url);
  }

  /**
   * Fetch recently viewed products using the section renderer and update the results container.
   */
  #getRecentlyViewed = async () => {
    const { predictiveSearchResults } = this.refs;
    // Get the initial height before the results are rendered
    const abortController = this.#createAbortController();

    try {
      const resultsMarkup = await this.#getRecentlyViewedProductsMarkup();
      if (!resultsMarkup) return;

      const parsedNextPage = new DOMParser().parseFromString(resultsMarkup, 'text/html');
      const recentlyViewedProductsHtml = parsedNextPage.getElementById('predictive-search-products');
      if (!recentlyViewedProductsHtml) return;

      for (const child of recentlyViewedProductsHtml.children) {
        if (child instanceof HTMLElement) {
          child.setAttribute('ref', 'recentlyViewedWrapper');
        }
      }

      const collectionElement = predictiveSearchResults.querySelector('#predictive-search-products');
      if (!collectionElement) return;

      if (this.refs.recentlyViewedWrapper) {
        this.refs.recentlyViewedWrapper.remove();
      }

      if (abortController.signal.aborted) return;
      // Prepend the recently viewed products to the collection
      collectionElement.prepend(...recentlyViewedProductsHtml.children);
    } catch (error) {
      throw error;
    }
  };

  #hideResetButton() {
    const { resetButton } = this.refs;

    resetButton.hidden = true;
  }

  #showResetButton() {
    const { resetButton } = this.refs;

    resetButton.hidden = false;
  }

  #createAbortController() {
    const abortController = new AbortController();
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    this.#activeFetch = abortController;
    return abortController;
  }

  #resetSearch = async () => {
    const { predictiveSearchResults, searchInput } = this.refs;
    const emptySectionId = 'predictive-search-empty';

    this.#currentIndex = -1;
    searchInput.value = '';
    this.#hideResetButton();

    const abortController = this.#createAbortController();
    const emptySectionMarkup = await sectionRenderer.getSectionHTML(emptySectionId, false);
    const parsedEmptySectionMarkup = new DOMParser()
      .parseFromString(emptySectionMarkup, 'text/html')
      .querySelector('.predictive-search-empty-section');

    if (!parsedEmptySectionMarkup) throw new Error('No empty section markup found');

    /** This needs to be awaited and not .then so the DOM is already morphed
     * when #closeResults is called and therefore the height is animated */
    const viewedProducts = RecentlyViewed.getProducts();

    if (viewedProducts.length > 0) {
      const recentlyViewedMarkup = await this.#getRecentlyViewedProductsMarkup();
      if (!recentlyViewedMarkup) return;

      const parsedRecentlyViewedMarkup = new DOMParser().parseFromString(recentlyViewedMarkup, 'text/html');
      const recentlyViewedProductsHtml = parsedRecentlyViewedMarkup.getElementById('predictive-search-products');
      if (!recentlyViewedProductsHtml) return;

      for (const child of recentlyViewedProductsHtml.children) {
        if (child instanceof HTMLElement) {
          child.setAttribute('ref', 'recentlyViewedWrapper');
        }
      }

      const collectionElement = parsedEmptySectionMarkup.querySelector('#predictive-search-products');
      if (!collectionElement) return;
      collectionElement.prepend(...recentlyViewedProductsHtml.children);
    }

    if (abortController.signal.aborted) return;

    morph(predictiveSearchResults, parsedEmptySectionMarkup);
    this.#resetScrollPositions();
  };

  /**
   * Closes the predictive search.
   */
  #blurSearch = () => {
    this.refs.searchInput.blur();
  };

  /**
   * Voice search functionality
   */
  #recognition = null;
  #isListening = false;

  /**
   * Initialize speech recognition
   */
  #initSpeechRecognition() {
    // Check if voice button exists (voice search might be disabled)
    if (!this.refs.voiceButton) {
      return false;
    }

    // Check if we're on HTTPS (required for speech recognition)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      this.#showVoiceSearchError('Voice search requires HTTPS. Please use a secure connection.');
      this.refs.voiceButton.style.display = 'none';
      return false;
    }

    // Check for speech recognition support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.#showVoiceSearchError('Voice search is not supported in this browser. Please use Chrome, Edge, or Safari.');
      this.refs.voiceButton.style.display = 'none';
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.#recognition = new SpeechRecognition();
    
    this.#recognition.continuous = false;
    this.#recognition.interimResults = false;
    this.#recognition.lang = document.documentElement.lang || 'en-US';
    this.#recognition.maxAlternatives = 1;

    this.#recognition.onstart = () => {
      this.#isListening = true;
      this.#updateVoiceButtonState();
      console.log('Voice search started');
    };

    this.#recognition.onresult = (event) => {
      if (event.results.length > 0) {
        const transcript = event.results[0][0].transcript;
        console.log('Voice transcript:', transcript);
        this.refs.searchInput.value = transcript;
        
        // Trigger search immediately after setting the value
        this.#triggerVoiceSearch(transcript);
        
        this.#stopVoiceSearch();
      }
    };

    this.#recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = 'Voice search error occurred.';
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
          break;
        case 'no-speech':
          errorMessage = 'No speech detected. Please try speaking again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found. Please check your microphone connection.';
          break;
        case 'network':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
        default:
          errorMessage = `Voice search error: ${event.error}`;
      }
      
      // Remove the listening notification
      this.#removeVoiceNotification();
      this.#showVoiceSearchError(errorMessage);
      this.#stopVoiceSearch();
    };

    this.#recognition.onend = () => {
      this.#isListening = false;
      this.#updateVoiceButtonState();
      console.log('Voice search ended');
    };

    return true;
  }

  /**
   * Start voice search
   */
  startVoiceSearch = () => {
    // Ensure the search input is focused
    if (this.refs.searchInput) {
      this.refs.searchInput.focus();
    }

    // If recognition is not initialized, try to initialize it
    if (!this.#recognition) {
      if (!this.#initSpeechRecognition()) {
        return;
      }
    }

    if (this.#isListening) {
      this.#stopVoiceSearch();
      return;
    }

    // Play AI assistant voice prompt first
    this.#playVoicePrompt();
  }

  /**
   * Play AI assistant voice prompt
   */
  #playVoicePrompt() {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance();
      
      // Get custom prompt from theme settings or use default
      const customPrompt = this.getAttribute('data-voice-prompt') || 
                          "I am your AI assistant. How can I help you and what do you want to search?";
      
      utterance.text = customPrompt;
      utterance.lang = document.documentElement.lang || 'en-US';
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      
      // Get voice gender preference
      const voiceGender = this.getAttribute('data-voice-gender') || 'female';
      
      // Use a more natural voice if available
      const voices = speechSynthesis.getVoices();
      let preferredVoice = null;
      
      if (voiceGender === 'auto') {
        // Auto: Find the best available voice
        preferredVoice = voices.find(voice => 
          voice.lang.includes('en') && 
          (voice.name.includes('Google') || voice.name.includes('Natural') || voice.name.includes('Premium'))
        );
      } else {
        // Gender-specific: Find voice matching the selected gender
        preferredVoice = voices.find(voice => {
          const isEnglish = voice.lang.includes('en');
          const isPreferredGender = voiceGender === 'female' ? 
            (voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('woman') || voice.name.toLowerCase().includes('girl')) :
            (voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('man') || voice.name.toLowerCase().includes('boy'));
          
          return isEnglish && (isPreferredGender || voice.name.includes('Google') || voice.name.includes('Natural'));
        });
      }
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      utterance.onend = () => {
        // Start speech recognition after the prompt finishes
        setTimeout(() => {
          this.#startRecognition();
        }, 500); // Small delay for better UX
      };
      
      utterance.onerror = () => {
        // If voice prompt fails, start recognition anyway
        this.#startRecognition();
      };
      
      speechSynthesis.speak(utterance);
    } else {
      // Fallback if speech synthesis is not supported
      this.#startRecognition();
    }
  }

  /**
   * Start the actual speech recognition
   */
  #startRecognition = () => {
    try {
      this.#recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      this.#showVoiceSearchError('Failed to start voice search. Please try again.');
    }
  }

  /**
   * Stop voice search
   */
  #stopVoiceSearch = () => {
    if (this.#recognition && this.#isListening) {
      this.#recognition.stop();
    }
  }

  /**
   * Update voice button visual state
   */
  #updateVoiceButtonState() {
    const voiceButton = this.refs.voiceButton;
    if (!voiceButton) return;

    if (this.#isListening) {
      voiceButton.classList.add('predictive-search__voice-button--listening');
      voiceButton.setAttribute('aria-label', 'Stop voice search');
      voiceButton.setAttribute('title', 'Listening... Click to stop');
      
      // Add a subtle notification only when actively listening
      this.#showVoiceNotification('Listening... Speak now');
    } else {
      voiceButton.classList.remove('predictive-search__voice-button--listening');
      voiceButton.setAttribute('aria-label', 'Start voice search');
      voiceButton.setAttribute('title', 'Click to start voice search');
      
      // Remove any existing notification when not listening
      this.#removeVoiceNotification();
    }
  }

  /**
   * Trigger search after voice input
   */
  #triggerVoiceSearch(transcript) {
    // Remove any voice notification since we're done listening
    this.#removeVoiceNotification();
    
    // Ensure the search input is focused and expanded
    this.refs.searchInput.focus();
    this.expandSearch();
    
    // Show reset button
    this.#showResetButton();
    
    // Reset current index
    this.#currentIndex = -1;
    
    // Trigger the search directly
    if (transcript.trim().length > 0) {
      this.#getSearchResults(transcript.trim());
    }
  }

  /**
   * Show a subtle voice search notification
   */
  #showVoiceNotification(message) {
    // Remove any existing notification
    this.#removeVoiceNotification();

    const notification = document.createElement('div');
    notification.className = 'predictive-search__voice-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #e8f5e8;
      color: #2d5a2d;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 999;
      margin-top: 4px;
      border: 1px solid #c3e6c3;
      text-align: center;
      animation: slideIn 0.2s ease-out;
    `;

    const container = this.refs.searchInput.closest('.predictive-search-form__header-inner');
    if (container) {
      container.appendChild(notification);
    }
  }

  /**
   * Remove voice search notification
   */
  #removeVoiceNotification() {
    const existingNotification = this.querySelector('.predictive-search__voice-notification');
    if (existingNotification) {
      existingNotification.remove();
    }
  }

  /**
   * Show voice search error message
   */
  #showVoiceSearchError(message) {
    // Remove any existing error messages
    const existingError = this.querySelector('.predictive-search__voice-error');
    if (existingError) {
      existingError.remove();
    }

    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'predictive-search__voice-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #fee;
      color: #c33;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 1000;
      margin-top: 8px;
      border: 1px solid #fcc;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      animation: slideIn 0.3s ease-out;
    `;

    const searchInput = this.refs.searchInput;
    const container = searchInput.closest('.predictive-search-form__header-inner');
    if (container) {
      container.style.position = 'relative';
      container.appendChild(errorDiv);
    }

    // Remove error message after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentElement) {
        errorDiv.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
          if (errorDiv.parentElement) {
            errorDiv.parentElement.removeChild(errorDiv);
          }
        }, 300);
      }
    }, 5000);
  }
}

if (!customElements.get('predictive-search-component')) {
  customElements.define('predictive-search-component', PredictiveSearchComponent);
}
