import React from 'react';
import { motion } from 'framer-motion';

// Emil Kowalski Design Engineering: Snappy 200ms ease-out transitions, subtle blur(2px) during transition
interface BlurRevealProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  yOffset?: number;
}

export const BlurReveal: React.FC<BlurRevealProps> = ({
  children,
  delay = 0,
  duration = 0.2,
  className = '',
  yOffset = 4,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, filter: 'blur(2px)', y: yOffset, scale: 0.99 }}
      animate={{ opacity: 1, filter: 'blur(0px)', y: 0, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(2px)', scale: 0.99 }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1], // Emil's curated ease-out
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const BlurTextReveal: React.FC<{
  text: string;
  className?: string;
  delay?: number;
}> = ({ text, className = '' }) => {
  return (
    <span className={className}>
      {text}
    </span>
  );
};
