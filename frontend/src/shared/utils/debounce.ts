/**
 * Creates a debounced function that delays invoking `fn` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 *
 * @param fn - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns A debounced version of the function with a `cancel` method
 *
 * @example
 * ```ts
 * const debouncedSave = debounce((value) => save(value), 1000);
 * debouncedSave("hello"); // Will call save after 1 second
 * debouncedSave("world"); // Cancels previous, will call save with "world" after 1 second
 * debouncedSave.cancel(); // Cancel any pending invocation
 * ```
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  wait: number
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debounced = function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    // Clear existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn.apply(this, args);
    }, wait);
  } as T & { cancel: () => void };

  // Add cancel method
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}

export default debounce;
