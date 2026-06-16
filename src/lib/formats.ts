export const supportedFormats = {
  inputFormats: ["MP4", "AVI", "MOV", "MKV", "WebM", "FLV", "3GP", "WMV"],
  outputFormats: ["MP4", "AVI", "MOV", "MKV", "WebM"],
  videoCodecs: [
    { id: "libx264", label: "H.264", note: "Best general compatibility" },
    { id: "libx265", label: "H.265", note: "Smaller files, slower encoding" },
    { id: "libvpx-vp9", label: "VP9", note: "Open codec for web delivery" },
    { id: "libaom-av1", label: "AV1", note: "High compression efficiency" }
  ],
  audioCodecs: [
    { id: "aac", label: "AAC", note: "High quality and broad support" },
    { id: "libmp3lame", label: "MP3", note: "Universal compatibility" },
    { id: "libopus", label: "Opus", note: "Low latency and efficient" },
    { id: "libvorbis", label: "Vorbis", note: "Open audio codec" }
  ],
  qualityPresets: ["ultrafast", "fast", "medium", "slow", "veryslow"]
};
