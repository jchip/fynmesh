/**
 * FynMesh Lazy Loader
 * Provides UI for deferred app loading with button and countdown timer
 */

class LazyLoader {
  constructor(containerId, appName, kernel, options = {}) {
    this.containerId = containerId;
    this.appName = appName;
    this.kernel = kernel;
    this.countdown = options.countdown || 10;
    this.currentCount = this.countdown;
    this.timerId = null;
    this.isLoading = false;
  }

  /**
   * Initialize the lazy loader UI
   */
  init() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container ${this.containerId} not found`);
      return;
    }

    // Clear loading spinner if present
    container.classList.remove('loading-spinner');
    container.innerHTML = '';

    // Create loader UI
    const loaderDiv = document.createElement('div');
    loaderDiv.className = 'lazy-loader-container';
    loaderDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
      gap: 1.5rem;
      padding: 2rem;
    `;

    // Create icon
    const icon = document.createElement('div');
    icon.innerHTML = '📦';
    icon.style.cssText = 'font-size: 4rem; opacity: 0.7;';

    // Create message
    const message = document.createElement('div');
    message.style.cssText = `
      font-size: 1.25rem;
      color: #4b5563;
      font-weight: 500;
      text-align: center;
    `;
    message.textContent = `${this.appName} ready to load`;

    // Create countdown display
    const countdownDisplay = document.createElement('div');
    countdownDisplay.id = `${this.containerId}-countdown`;
    countdownDisplay.style.cssText = `
      font-size: 0.875rem;
      color: #6b7280;
      margin-top: -0.5rem;
    `;
    this.updateCountdownDisplay(countdownDisplay);

    // Create load button
    const button = document.createElement('button');
    button.id = `${this.containerId}-load-btn`;
    button.className = 'btn btn-primary btn-lg';
    button.style.cssText = `
      padding: 0.75rem 2rem;
      font-size: 1rem;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.5;
    `;
    button.textContent = `Load ${this.appName}`;
    button.onclick = () => this.handleLoad();

    // Assemble UI
    loaderDiv.appendChild(icon);
    loaderDiv.appendChild(message);
    loaderDiv.appendChild(countdownDisplay);
    loaderDiv.appendChild(button);
    container.appendChild(loaderDiv);

    // Start countdown
    this.startCountdown(countdownDisplay);
  }

  /**
   * Update countdown display text
   */
  updateCountdownDisplay(display) {
    display.textContent = `Auto-loading in ${this.currentCount}s...`;
  }

  /**
   * Start the countdown timer
   */
  startCountdown(display) {
    this.timerId = setInterval(() => {
      this.currentCount--;

      if (this.currentCount <= 0) {
        this.stopCountdown();
        console.debug(`⏰ Auto-loading ${this.appName} after countdown`);
        this.handleLoad();
      } else {
        this.updateCountdownDisplay(display);
      }
    }, 1000);
  }

  /**
   * Stop the countdown timer
   */
  stopCountdown() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Handle load button click or countdown completion
   */
  async handleLoad() {
    if (this.isLoading) {
      return; // Prevent double-loading
    }

    this.isLoading = true;
    this.stopCountdown();

    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Show loading state
    container.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 80vh;
        gap: 1rem;
      ">
        <div class="loading loading-lg"></div>
        <div style="color: #6b7280; font-size: 0.875rem;">
          Loading ${this.appName}...
        </div>
      </div>
    `;

    try {
      console.debug(`🚀 Lazy loading ${this.appName}`);
      await this.kernel.loadFynAppsByName([{ name: this.containerId }], { concurrency: 1 });
      console.debug(`✅ Successfully lazy loaded ${this.appName}`);
    } catch (error) {
      console.error(`❌ Failed to lazy load ${this.appName}:`, error);

      // Show error state
      container.innerHTML = `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 80vh;
          gap: 1rem;
          color: #dc2626;
        ">
          <div style="font-size: 3rem;">⚠️</div>
          <div style="font-size: 1.25rem; font-weight: 500;">
            Failed to load ${this.appName}
          </div>
          <div style="font-size: 0.875rem; color: #6b7280;">
            ${error.message}
          </div>
          <button
            class="btn btn-primary"
            onclick="location.reload()"
            style="margin-top: 1rem;"
          >
            Reload Page
          </button>
        </div>
      `;
    }
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stopCountdown();
  }
}

// Export for use in other scripts
window.LazyLoader = LazyLoader;
