import { useEffect, useRef } from 'react';

interface UseSwipeGestureOptions {
  /** Callback ao swipe da esquerda para a direita (abrir). */
  onSwipeRight?: () => void;
  /** Callback ao swipe da direita para a esquerda (fechar). */
  onSwipeLeft?: () => void;
  enabled?: boolean;
  /** Se o menu está aberto (para detectar swipe de fechar). */
  isOpen?: boolean;
}

/** Hook para detectar gestos de swipe horizontal no mobile (abrir/fechar a sidebar). */
export function useSwipeGesture({ onSwipeRight, onSwipeLeft, enabled = true, isOpen = false }: UseSwipeGestureOptions) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndX = useRef(0);
  const touchEndY = useRef(0);
  const startedInEdge = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const hasNoSwipe = target.closest('[data-no-swipe]');
      const isInModal = target.closest('[role="dialog"]');

      if (isInput || hasNoSwipe || isInModal) {
        startedInEdge.current = false;
        return;
      }

      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;

      if (!isOpen && touchStartX.current < 20) {
        startedInEdge.current = true;
      } else if (isOpen) {
        startedInEdge.current = true;
      } else {
        startedInEdge.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!startedInEdge.current) return;
      touchEndX.current = e.touches[0].clientX;
      touchEndY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = () => {
      if (!startedInEdge.current) return;

      const deltaX = touchEndX.current - touchStartX.current;
      const deltaY = touchEndY.current - touchStartY.current;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      if (absDeltaX > 60 && absDeltaX > absDeltaY * 2) {
        if (deltaX > 0 && !isOpen) {
          onSwipeRight?.();
        } else if (deltaX < 0 && isOpen) {
          onSwipeLeft?.();
        }
      }

      startedInEdge.current = false;
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, isOpen, onSwipeRight, onSwipeLeft]);
}
