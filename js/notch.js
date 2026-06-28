// notch.js — locate the Mac/iPhone notch so the pinned reader can hug it.
// The browser exposes the notch as the top safe-area inset, but only when the
// page covers that region (fullscreen) with viewport-fit=cover. We measure it
// with a probe element and publish it as the --notch-top CSS variable.

export class Notch {
  constructor() {
    this.height = 0;
    this.probe = document.createElement('div');
    this.probe.style.cssText =
      'position:fixed;top:0;left:0;height:env(safe-area-inset-top);width:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(this.probe);

    this.measure = this.measure.bind(this);
    window.addEventListener('resize', this.measure);
    document.addEventListener('fullscreenchange', () => setTimeout(this.measure, 60));
  }

  measure() {
    this.height = this.probe.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty('--notch-top', `${this.height}px`);
    return this.height;
  }

  // A notch is "present" once the safe-area inset is non-trivial. Outside
  // fullscreen the inset is usually 0, so the hint tells the user to go fullscreen.
  get present() { return this.height > 8; }
}
