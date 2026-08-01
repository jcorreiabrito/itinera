/**
 * Reliable copy-to-clipboard helper that supports both modern navigator.clipboard
 * and legacy execCommand fallback for non-secure HTTP LAN environments.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Try modern navigator.clipboard API if available (requires HTTPS or localhost)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard failed, attempting fallback copy method:', err);
    }
  }

  // Fallback for non-HTTPS LAN contexts (e.g. http://192.168.x.x)
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Keep offscreen and hidden
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
    return false;
  }
}
