import './youtubeData';
let { items } = JC.utils.data;

function getYouTubeIDs() {
  let ids = [];
  for (let i = 0; i < items.length; i++) {
    ids[i] = items[i].contentDetails.videoId;
  }
  return ids;
};

export function playRandomYouTubeVideo() {
  let ids = getYouTubeIDs(); // array
  let getRandId = ids[JC.utils.randomNumber(ids.length)];
  let playVideo = JC.utils.youTubePlayer(getRandId);
  playVideo();
};
