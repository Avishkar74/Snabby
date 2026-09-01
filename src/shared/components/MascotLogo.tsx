import React, { useEffect, useRef } from 'react';

export const MascotLogo: React.FC = () => {
  const leftEyeRef = useRef<SVGEllipseElement>(null);
  const rightEyeRef = useRef<SVGEllipseElement>(null);
  const leftPupilRef = useRef<SVGCircleElement>(null);
  const rightPupilRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout>;
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

      const nextBlink = 2000 + Math.random() * 3000;
      blinkTimer = setTimeout(blink, nextBlink);
    };

    blinkTimer = setTimeout(blink, 1000);

    return () => {
      clearTimeout(blinkTimer);
    };
  }, []);

  return (
    <svg className="wsn-mascot" viewBox="0 0 40 40" width="40" height="40">
      <defs>
        <filter id="wsn-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
          <feOffset dx="0" dy="3" result="offsetblur" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle
        className="wsn-mascot__outer-ring"
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.5"
        opacity="0.3"
      />
      <circle
        className="wsn-mascot__face"
        cx="20"
        cy="20"
        r="14.5"
        fill="#000"
        stroke="#ffffff"
        strokeWidth="1"
        filter="url(#wsn-shadow)"
      />
      <ellipse
        ref={leftEyeRef}
        className="wsn-mascot__eye wsn-mascot__eye--left"
        cx="16"
        cy="18.5"
        rx="3"
        ry="3.5"
        fill="white"
        style={{ transformOrigin: '16px 18.5px', transition: 'transform 0.15s ease' }}
      />
      <ellipse
        ref={rightEyeRef}
        className="wsn-mascot__eye wsn-mascot__eye--right"
        cx="24"
        cy="18.5"
        rx="3"
        ry="3.5"
        fill="white"
        style={{ transformOrigin: '24px 18.5px', transition: 'transform 0.15s ease' }}
      />
      <circle
        ref={leftPupilRef}
        className="wsn-mascot__pupil wsn-mascot__pupil--left"
        cx="16"
        cy="18.5"
        r="1.3"
        fill="#000"
        style={{ transformOrigin: '16px 18.5px', transition: 'transform 0.06s linear, opacity 150ms ease' }}
      />
      <circle
        ref={rightPupilRef}
        className="wsn-mascot__pupil wsn-mascot__pupil--right"
        cx="24"
        cy="18.5"
        r="1.3"
        fill="#000"
        style={{ transformOrigin: '24px 18.5px', transition: 'transform 0.06s linear, opacity 150ms ease' }}
      />
    </svg>
  );
};
