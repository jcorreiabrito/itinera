class ViewportState {
  height = $state<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  width = $state<number>(typeof window !== 'undefined' ? window.innerWidth : 375);
  keyboardInset = $state<number>(0);
  private initialized = false;

  init() {
    if (typeof window === 'undefined' || this.initialized) return;
    this.initialized = true;

    this.update();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.update);
      window.visualViewport.addEventListener('scroll', this.update);
    }
    window.addEventListener('resize', this.update);
  }

  update = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const vv = window.visualViewport;
    if (vv) {
      this.height = vv.height;
      this.width = vv.width;
      const inset = Math.max(0, window.innerHeight - vv.height);
      this.keyboardInset = inset;
      document.documentElement.style.setProperty('--visual-viewport-height', `${vv.height}px`);
      document.documentElement.style.setProperty('--keyboard-inset-bottom', `${inset}px`);
    } else {
      this.height = window.innerHeight;
      this.width = window.innerWidth;
      this.keyboardInset = 0;
      document.documentElement.style.setProperty('--visual-viewport-height', `${window.innerHeight}px`);
      document.documentElement.style.setProperty('--keyboard-inset-bottom', '0px');
    }
  };

  destroy() {
    if (typeof window === 'undefined') return;
    this.initialized = false;
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.update);
      window.visualViewport.removeEventListener('scroll', this.update);
    }
    window.removeEventListener('resize', this.update);
  }
}

export const viewport = new ViewportState();
