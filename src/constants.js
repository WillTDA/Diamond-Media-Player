const AUDIO_EXTENSIONS = ['mp3', 'aac', 'm4a', 'ogg', 'opus', 'wav'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mkv', 'ogv'];
const ALL_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];
const FILE_REGEX = new RegExp(`\\.(${ALL_EXTENSIONS.join('|')})$`, 'i');

module.exports = {
  AUDIO_EXTENSIONS,
  VIDEO_EXTENSIONS,
  ALL_EXTENSIONS,
  FILE_REGEX
};