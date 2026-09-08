const SUCCESS_TAG = "axongem-generation-success";
const ERROR_TAG = "axongem-generation-error";

function canUseNotifications(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

/** Ask once so background-tab users can hear when a long Gemini run finishes. */
export async function ensureGenerationNotifyPermission(): Promise<void> {
  if (!canUseNotifications()) return;
  if (Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    // Insecure context or a blocked prompt — in-app toasts still work.
  }
}

export function notifyGenerationSuccess(title: string, body: string): void {
  showOsNotification(title, body, SUCCESS_TAG);
}

export function notifyGenerationError(title: string, body: string): void {
  showOsNotification(title, body, ERROR_TAG);
}

export function notifyGenerationPause(title: string, body: string): void {
  showOsNotification(title, body, "axongem-generation-pause");
}

function showOsNotification(title: string, body: string, tag: string): void {
  if (!canUseNotifications()) return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, { body, tag });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers throw if the document is not fully active.
  }
}
