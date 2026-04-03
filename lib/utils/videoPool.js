export class VideoPool {
  constructor(videos) {
    this.videos = videos;
    this.index = 0;
  }

  next() {
    if (this.videos.length === 0) {
      throw new Error("No videos available");
    }

    const video = this.videos[this.index];

    this.index++;

    // loop back if out
    if (this.index >= this.videos.length) {
      this.index = 0;
    }

    return video;
  }
}