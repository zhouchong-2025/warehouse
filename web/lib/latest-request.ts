/** Cancel obsolete work and only commit the latest request, even if abort is ignored. */
export function createLatestRequest<T>() {
  let current: AbortController | undefined;
  const cancel = () => {
    current?.abort();
    current = undefined;
  };
  return {
    cancel,
    async run(
      task: (signal: AbortSignal) => Promise<T>,
      onSuccess: (value: T) => void,
      onError: (error: unknown) => void,
      onSettled: () => void,
    ) {
      cancel();
      const controller = new AbortController();
      current = controller;
      try {
        const value = await task(controller.signal);
        if (current === controller) onSuccess(value);
      } catch (error) {
        if (current === controller) onError(error);
      } finally {
        if (current === controller) {
          current = undefined;
          onSettled();
        }
      }
    },
  };
}
