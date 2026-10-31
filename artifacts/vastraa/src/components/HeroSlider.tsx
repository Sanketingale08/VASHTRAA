import React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Slide {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  cta: string;
}

interface HeroSliderProps {
  slides: Slide[];
}

export function HeroSlider({ slides }: HeroSliderProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const scrollPrev = React.useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = React.useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  React.useEffect(() => {
    if (!emblaApi) return;
    const interval = setInterval(() => {
      emblaApi.scrollNext();
    }, 4000);
    return () => clearInterval(interval);
  }, [emblaApi]);

  return (
    <div className="relative overflow-hidden w-full h-[60vh] md:h-[80vh] group">
      <div className="embla h-full" ref={emblaRef}>
        <div className="embla__container h-full flex">
          {slides.map((slide) => (
            <div className="embla__slide flex-[0_0_100%] min-w-0 h-full relative" key={slide.id}>
              <div className="absolute inset-0">
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/40"></div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="max-w-3xl"
                >
                  <p className="text-[#C7CCD1] tracking-[0.3em] text-sm md:text-base uppercase mb-4 font-medium">
                    {slide.subtitle}
                  </p>
                  <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl text-white font-bold mb-8 leading-tight">
                    {slide.title}
                  </h1>
                  <button className="bg-transparent border border-[#C7CCD1] text-white hover:bg-[#C7CCD1] hover:text-[#0A1F44] transition-colors duration-300 px-8 py-3 tracking-wider uppercase text-sm font-semibold">
                    {slide.cta}
                  </button>
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-white/30 flex items-center justify-center text-white backdrop-blur bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#C7CCD1] hover:text-[#0A1F44] hover:border-[#C7CCD1]"
        onClick={scrollPrev}
      >
        <ChevronLeft size={24} />
      </button>
      <button
        className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-white/30 flex items-center justify-center text-white backdrop-blur bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#C7CCD1] hover:text-[#0A1F44] hover:border-[#C7CCD1]"
        onClick={scrollNext}
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}
