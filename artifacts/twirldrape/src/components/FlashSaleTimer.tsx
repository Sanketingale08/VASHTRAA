import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

export function FlashSaleTimer() {
  const [timeLeft, setTimeLeft] = useState({
    hours: 12,
    minutes: 45,
    seconds: 30
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        let { hours, minutes, seconds } = prev;
        
        if (seconds > 0) {
          seconds--;
        } else {
          seconds = 59;
          if (minutes > 0) {
            minutes--;
          } else {
            minutes = 59;
            if (hours > 0) {
              hours--;
            }
          }
        }
        
        return { hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  return (
    <div className="flex gap-2 items-center justify-center text-[#1E6B5A]">
      <motion.div 
        key={timeLeft.hours}
        initial={{ y: -5, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-[#C9A84C]/20 px-3 py-2 rounded font-mono text-xl md:text-2xl font-bold"
      >
        {formatNumber(timeLeft.hours)}
      </motion.div>
      <span className="font-bold text-xl">:</span>
      <motion.div 
        key={timeLeft.minutes}
        initial={{ y: -5, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-[#C9A84C]/20 px-3 py-2 rounded font-mono text-xl md:text-2xl font-bold"
      >
        {formatNumber(timeLeft.minutes)}
      </motion.div>
      <span className="font-bold text-xl">:</span>
      <motion.div 
        key={timeLeft.seconds}
        initial={{ y: -5, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-[#C9A84C]/20 px-3 py-2 rounded font-mono text-xl md:text-2xl font-bold"
      >
        {formatNumber(timeLeft.seconds)}
      </motion.div>
    </div>
  );
}
