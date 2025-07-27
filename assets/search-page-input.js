import { Component } from '@theme/component';
import { debounce } from '@theme/utilities';

/**
 * A custom element that allows the user to clean a search input.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} searchPageInput - The search input element.
 * @extends {Component<Refs>}
 */
class SearchPageInputComponent extends Component {
  requiredRefs = ['searchPageInput', 'voiceButton'];

  /**
   * Handles the click event on the clear button and submits an empty search.
   * This clears the search input and resubmits the form if the page is not
   * already in an empty state.
   */
  handleClearClick() {
    this.#submitEmptySearch();
  }

  /**
   * Handles the keydown event on the search input and resets the search when
   * empty and Escape is pressed.
   *
   * @param {KeyboardEvent} event - The keyboard event.
   */
  handleKeyDown = debounce((event) => {
    const value = this.refs.searchPageInput.value.trim();

    if (event.key === 'Escape' && value === '') {
      this.#submitEmptySearch();
    }
  }, 100);

  #submitEmptySearch() {
    const searchInput = this.refs.searchPageInput;

    searchInput.focus();
    searchInput.value = '';

    if (this.#isEmptyState()) return;

    searchInput.form?.submit();
  }

  #isEmptyState = () => {
    const url = new URL(window.location.href);
    const queryParam = url.searchParams.get('q') ?? '';

    return queryParam.trim() === '';
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
    // Check if we're on HTTPS (required for speech recognition)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      this.#showVoiceSearchError('Voice search requires HTTPS. Please use a secure connection.');
      if (this.refs.voiceButton) {
        this.refs.voiceButton.style.display = 'none';
      }
      return false;
    }

    // Check for speech recognition support
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      this.#showVoiceSearchError('Voice search is not supported in this browser. Please use Chrome, Edge, or Safari.');
      if (this.refs.voiceButton) {
        this.refs.voiceButton.style.display = 'none';
      }
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
        this.refs.searchPageInput.value = transcript;
        
        // Trigger search by submitting the form
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

    // Try to start recognition directly - browser will prompt for permissions if needed
    this.#startRecognition();
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
      voiceButton.classList.add('search__voice-button--listening');
      voiceButton.setAttribute('aria-label', 'Stop voice search');
      voiceButton.setAttribute('title', 'Listening... Click to stop');
      
      // Add a subtle notification
      this.#showVoiceNotification('Listening... Speak now');
    } else {
      voiceButton.classList.remove('search__voice-button--listening');
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
    
    // Ensure the search input is focused
    this.refs.searchPageInput.focus();
    
    // Submit the form to perform the search
    if (transcript.trim().length > 0) {
      this.refs.searchPageInput.form?.submit();
    }
  }

  /**
   * Show a subtle voice search notification
   */
  #showVoiceNotification(message) {
    // Remove any existing notification
    this.#removeVoiceNotification();

    const notification = document.createElement('div');
    notification.className = 'search__voice-notification';
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

    const container = this.refs.searchPageInput.closest('search-page-input-component');
    if (container) {
      container.style.position = 'relative';
      container.appendChild(notification);
    }
  }

  /**
   * Remove voice search notification
   */
  #removeVoiceNotification() {
    const existingNotification = this.querySelector('.search__voice-notification');
    if (existingNotification) {
      existingNotification.remove();
    }
  }

  /**
   * Show voice search error message
   */
  #showVoiceSearchError(message) {
    // Remove any existing error messages
    const existingError = this.querySelector('.search__voice-error');
    if (existingError) {
      existingError.remove();
    }

    // Create a temporary error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'search__voice-error';
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

    const container = this.refs.searchPageInput.closest('search-page-input-component');
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

if (!customElements.get('search-page-input-component')) {
  customElements.define('search-page-input-component', SearchPageInputComponent);
}
