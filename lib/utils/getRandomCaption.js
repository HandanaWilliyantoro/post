import captions from "@/lib/pipeline/data/captions";

export function getRandomCaption() {
  const index = Math.floor(Math.random() * captions.length);
  return captions[index];
}