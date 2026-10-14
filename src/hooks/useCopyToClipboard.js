import { useCallback, useEffect, useRef, useState } from 'react';

const FEEDBACK_DURATION_MS = 1500;

function copyWithSelectionFallback(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.top = '0';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  document.body.removeChild(textArea);
  return copied;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithSelectionFallback(text);
    }
  }
  return copyWithSelectionFallback(text);
}

export function useCopyToClipboard(text) {
  const [copied, setCopied] = useState(false);
  const feedbackTimer = useRef(null);

  useEffect(() => () => clearTimeout(feedbackTimer.current), []);

  const copy = useCallback(async () => {
    const succeeded = await copyText(text);
    setCopied(succeeded);
    clearTimeout(feedbackTimer.current);
    if (succeeded) {
      feedbackTimer.current = setTimeout(() => setCopied(false), FEEDBACK_DURATION_MS);
    }
  }, [text]);

  return [copied, copy];
}
