import { useEffect, useRef } from 'react';

export const ASSISTANT_WIDTH_MIN = 300;
export const ASSISTANT_WIDTH_MAX = 640;
export const ASSISTANT_WIDTH_DEFAULT = 360;

export function clampAssistantWidth(width: number): number {
  return Math.min(ASSISTANT_WIDTH_MAX, Math.max(ASSISTANT_WIDTH_MIN, Math.round(width)));
}

export interface AssistantResizeHandleProps {
  width: number;
  onWidthChange: (width: number) => void;
  onReset: () => void;
}

/** The left edge of the Assistant pane. Moving it left makes the pane wider. */
export function AssistantResizeHandle({ width, onWidthChange, onReset }: AssistantResizeHandleProps) {
  const drag = useRef<{ x: number; width: number; pointerId: number } | undefined>(undefined);
  const changeRef = useRef(onWidthChange);
  changeRef.current = onWidthChange;
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      if (!Number.isFinite(event.clientX)) return;
      changeRef.current(clampAssistantWidth(drag.current.width + drag.current.x - event.clientX));
    };
    const end = () => { if (drag.current) drag.current = undefined; };
    const mouseMove = (event: MouseEvent) => {
      if (!drag.current || !Number.isFinite(event.clientX)) return;
      changeRef.current(clampAssistantWidth(drag.current.width + drag.current.x - event.clientX));
    };
    const mouseUp = () => { if (drag.current) drag.current = undefined; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('mousemove', mouseMove);
    window.addEventListener('mouseup', mouseUp);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('mousemove', mouseMove); window.removeEventListener('mouseup', mouseUp); };
  }, []);

  return (
    <div
      role="separator"
      aria-label="调整右侧面板宽度"
      aria-orientation="vertical"
      aria-valuemin={ASSISTANT_WIDTH_MIN}
      aria-valuemax={ASSISTANT_WIDTH_MAX}
      aria-valuenow={clampAssistantWidth(width)}
      tabIndex={0}
      className="v3-assistant-resizer"
      onPointerDown={(event) => {
        drag.current = { x: Number.isFinite(event.clientX) ? event.clientX : 0, width: clampAssistantWidth(width), pointerId: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        if (Number.isFinite(event.clientX)) changeRef.current(clampAssistantWidth(drag.current.width + drag.current.x - event.clientX));
      }}
      onPointerUp={(event) => {
        if (drag.current) drag.current = undefined;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = undefined; }}
      onMouseDown={(event) => { drag.current = { x: event.clientX, width: clampAssistantWidth(width), pointerId: 0 }; }}
      onMouseMove={(event) => { if (drag.current && Number.isFinite(event.clientX)) changeRef.current(clampAssistantWidth(drag.current.width + drag.current.x - event.clientX)); }}
      onMouseUp={() => { drag.current = undefined; }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === 'Home') { event.preventDefault(); onWidthChange(ASSISTANT_WIDTH_MIN); }
        if (event.key === 'End') { event.preventDefault(); onWidthChange(ASSISTANT_WIDTH_MAX); }
        if (event.key === 'ArrowLeft') { event.preventDefault(); onWidthChange(clampAssistantWidth(width + 16)); }
        if (event.key === 'ArrowRight') { event.preventDefault(); onWidthChange(clampAssistantWidth(width - 16)); }
      }}
    >
      <span aria-hidden="true" />
    </div>
  );
}
