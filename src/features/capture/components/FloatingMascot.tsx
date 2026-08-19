import React, { useEffect, useRef } from 'react';
import { useMessageBus } from '../../../app/providers/MessageBusContext.tsx';

interface FloatingMascotProps {
  onTogglePanel: () => void;
}

export const FloatingMascot: React.FC<FloatingMascotProps> = ({ onTogglePanel }) => {
  const messageBus = useMessageBus();
  const iconRef = useRef<HTMLDivElement>(null);
  const leftEyeRef = useRef<HTMLDivElement>(null);
  const rightEyeRef = useRef<HTMLDivElement>(null);
  const leftPupilRef = useRef<HTMLDivElement>(null);
  const rightPupilRef = useRef<HTMLDivElement>(null);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const iconStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  useEffect(() => {
    const blink = () => {
      const leftEye = leftEyeRef.current;
      const rightEye = rightEyeRef.current;
      const leftPupil = leftPupilRef.current;
      const rightPupil = rightPupilRef.current;

      if (leftEye && rightEye && leftPupil && rightPupil) {
        leftEye.style.transform = 'scaleY(0.1)';
        rightEye.style.transform = 'scaleY(0.1)';
        leftPupil.style.opacity = '0';
        rightPupil.style.opacity = '0';

        setTimeout(() => {
          leftEye.style.transform = 'scaleY(1)';
          rightEye.style.transform = 'scaleY(1)';
          leftPupil.style.opacity = '1';
          rightPupil.style.opacity = '1';
        }, 150);
      }
    };


    const handleMouseMoveGlobal = (e: MouseEvent) => {
      [leftPupilRef.current, rightPupilRef.current].forEach((pupil) => {
        if (!pupil) return;
        const eye = pupil.parentElement;
        if (!eye) return;
        const rect = eye.getBoundingClientRect();
        if (rect.width === 0) return;
        const eyeX = rect.left + rect.width / 2;
        const eyeY = rect.top + rect.height / 2;
        const angle = Math.atan2(e.clientY - eyeY, e.clientX - eyeX);
        const maxDist = 2.5; 
        const px = Math.cos(angle) * maxDist;
        const py = Math.sin(angle) * maxDist;
        pupil.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      });

      if (!isDragging.current) return;
      const icon = iconRef.current;
      if (!icon) return;

      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        hasMoved.current = true;
      }
      if (!hasMoved.current) return;

      let newX = iconStart.current.x + dx;
      let newY = iconStart.current.y + dy;

      newX = Math.max(0, Math.min(window.innerWidth - 48, newX));
      newY = Math.max(0, Math.min(window.innerHeight - 48, newY));

      icon.style.right = 'auto';
      icon.style.bottom = 'auto';
      icon.style.left = `${newX}px`;
      icon.style.top = `${newY}px`;
    };

    const handleMouseUpGlobal = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const icon = iconRef.current;
      if (icon) {
        icon.style.transition = '';
      }
      if (!hasMoved.current) {
        onTogglePanel();
      }
    };

    const unsubCapture = messageBus.listen('CAPTURE_COMPLETE', () => {
      blink();
    });

    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mouseup', handleMouseUpGlobal);

    return () => {
      unsubCapture();
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUpGlobal);
    };
  }, [onTogglePanel, messageBus]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    const icon = iconRef.current;
    if (icon) {
      const rect = icon.getBoundingClientRect();
      iconStart.current = { x: rect.left, y: rect.top };
      icon.style.transition = 'none';
    }
  };

  return (
    <div
      ref={iconRef}
      className="wsn-floating-icon"
      onMouseDown={handleMouseDown}
      style={{ pointerEvents: 'auto' }}
    >
      <div className="wsn-face">
        <div ref={leftEyeRef} className="wsn-eye wsn-eye--left" style={{ transformOrigin: 'center', transition: 'transform 0.15s ease' }}>
          <div ref={leftPupilRef} className="wsn-pupil"></div>
        </div>
        <div ref={rightEyeRef} className="wsn-eye wsn-eye--right" style={{ transformOrigin: 'center', transition: 'transform 0.15s ease' }}>
          <div ref={rightPupilRef} className="wsn-pupil"></div>
        </div>
      </div>
    </div>
  );
};
export default FloatingMascot;
