/**
 * Universal clipboard copy utility.
 * Works seamlessly across both secure (HTTPS/localhost) and
 * non-secure HTTP local Wi-Fi contexts (e.g. mobile Android/iOS on http://192.168.x.x:5050).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern Async Clipboard API if available
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Modern API rejected (common on HTTP non-secure origins on mobile), proceed to fallback
    }
  }

  // 2. Universal textarea execCommand fallback for mobile browsers on HTTP
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Set 16px to prevent iOS auto-zoom, and place offscreen
    textarea.style.fontSize = '16px';
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, 999999);

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (err) {
    console.error('All copy strategies failed:', err);
    return false;
  }
}
