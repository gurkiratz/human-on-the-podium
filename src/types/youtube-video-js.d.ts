import type { DetailedHTMLProps, HTMLAttributes } from "react";

type YoutubeVideoProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  src?: string;
  width?: string | number;
  height?: string | number;
  controls?: boolean;
  autoplay?: boolean;
  playsinline?: boolean;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "youtube-video": YoutubeVideoProps;
    }
  }
}

export {};
