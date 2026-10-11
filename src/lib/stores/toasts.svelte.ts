// short notes in the corner that go away on their own

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

class Toasts {
  items = $state<ToastItem[]>([]);
  private next = 0;

  add(message: string, type: ToastType = 'info', duration = 3000): number {
    const id = ++this.next;
    // the same note twice in a row only shows once
    if (this.items.some((item) => item.message === message)) return id;
    this.items = [...this.items, { id, message, type }].slice(-4);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  dismiss(id: number): void {
    this.items = this.items.filter((item) => item.id !== id);
  }
}

export const toasts = new Toasts();

export function toast(message: string, type: ToastType = 'info', duration = 3000): number {
  return toasts.add(message, type, duration);
}
