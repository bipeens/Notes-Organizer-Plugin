class ScreenshotSelector {
  constructor() {
    this.isSelecting = false;
    this.startX = 0;
    this.startY = 0;
    this.overlay = null;
    this.selection = null;
    this.instructions = null;
  }

  init() {
    // Create overlay
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      zIndex: 999998,
      cursor: 'crosshair'
    });

    // Add instructions
    this.instructions = document.createElement('div');
    Object.assign(this.instructions.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 20px',
      background: 'white',
      borderRadius: '5px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      zIndex: 999999,
      fontSize: '14px'
    });
    this.instructions.textContent = 'Click and drag to select area. Press Esc or right-click to cancel.';

    // Create selection box
    this.selection = document.createElement('div');
    Object.assign(this.selection.style, {
      position: 'fixed',
      border: '2px solid #2ea44f',
      backgroundColor: 'rgba(46, 164, 79, 0.1)',
      display: 'none',
      zIndex: 999999
    });

    document.body.appendChild(this.instructions);
    this.overlay.appendChild(this.selection);
    document.body.appendChild(this.overlay);

    this.bindEvents();
  }

  bindEvents() {
    this.overlay.addEventListener('mousedown', (e) => this.startSelection(e));
    this.overlay.addEventListener('mousemove', (e) => this.updateSelection(e));
    this.overlay.addEventListener('mouseup', (e) => this.endSelection(e));
    this.overlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.cancel();
    });
  }

  startSelection(e) {
    this.isSelecting = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.selection.style.display = 'block';
    this.updateSelection(e);
  }

  updateSelection(e) {
    if (!this.isSelecting) return;

    const x = Math.min(e.clientX, this.startX);
    const y = Math.min(e.clientY, this.startY);
    const width = Math.abs(e.clientX - this.startX);
    const height = Math.abs(e.clientY - this.startY);

    Object.assign(this.selection.style, {
      left: x + 'px',
      top: y + 'px',
      width: width + 'px',
      height: height + 'px'
    });
  }

  async endSelection(e) {
    if (!this.isSelecting) return;
    this.isSelecting = false;

    const bounds = this.selection.getBoundingClientRect();
    if (bounds.width < 10 || bounds.height < 10) {
      this.cancel();
      return;
    }

    // Capture the selected area
    const canvas = document.createElement('canvas');
    const scale = window.devicePixelRatio;
    canvas.width = bounds.width * scale;
    canvas.height = bounds.height * scale;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    
    // Capture the selected portion of the screen
    ctx.drawImage(
      await html2canvas(document.body, {
        scale: scale,
        logging: false,
        useCORS: true
      }),
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height
    );

    // Send the screenshot back to the popup
    chrome.runtime.sendMessage({
      type: 'SCREENSHOT_CAPTURED',
      screenshot: canvas.toDataURL('image/png'),
      filename: `screenshot-${Date.now()}.png`
    });

    this.cleanup();
  }

  cancel() {
    this.cleanup();
  }

  cleanup() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    if (this.instructions && this.instructions.parentNode) {
      this.instructions.parentNode.removeChild(this.instructions);
    }
  }
} 