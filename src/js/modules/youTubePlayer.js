import './youtubeData';
let { items } = JC.utils.data;
let { qs } = JC.helpers;

function getYouTubeIDs() {
  let ids = [];
  for (let i = 0; i < items.length; i++) {
    ids[i] = items[i].contentDetails.videoId;
  }
  return ids;
};

function youTubePlayer(id) {
  return function () {
    var body = qs('body');
    var video__modal = document.createElement('div');
        video__modal.className = 'video__modal';
    var iframeWrapper = document.createElement('div');
        iframeWrapper.className = 'iframeWrapper';
    var iframeDiv = document.createElement('iFrame');
        iframeDiv.setAttribute('data-youtube-id', id);
        iframeDiv.setAttribute('src', 'https://www.youtube.com/embed/' + id + '?rel=0&amp;controls=0&amp');
            video__modal.appendChild(iframeWrapper);
            iframeWrapper.appendChild(iframeDiv);
            body.appendChild(video__modal);
            console.log('YouTube video player is open');
  }
}

export function playRandomYouTubeVideo() {
  let ids = getYouTubeIDs(); // array
  let getRandId = ids[JC.utils.randomNumber(ids.length)];
  let playVideo = youTubePlayer(getRandId);
  playVideo();
};
