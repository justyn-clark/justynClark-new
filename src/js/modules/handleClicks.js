import { setPolicyCookie } from './cookies';
import './youtube';


export function play() {
  var videos = randTubeVid();
  var videoID = videos[JC.utils.randomNumber(videos.length)];
  var video = JC.utils.youTubePlayer(videoID);
  video();
};

function randTubeVid() {
  var vidList = [];
  for (let i = 0; i < JC.utils.data.items.length; i++) {
    vidList[i] = JC.utils.data.items[i].contentDetails.videoId;
  }
  return vidList;
};


// Set up click handlers
function clickHandlers() {

  var header = document.querySelector('.header');
  var content1 = document.querySelector('.logo');
  var body = document.querySelector('body');
  var openOverlay = document.querySelector('[rel="1"]');
  var overlay = document.querySelector('.overlay')
  //document.querySelector('[rel="main__loadNames"]').addEventListener('click', loadNames);
  /*document.querySelector('[rel="main__clicker"]').addEventListener('click', function() {
    document.querySelector('[rel="main__clicker"]').innerHTML = adder();
  });*/

  document.querySelector('.cookie-policy__close').addEventListener('click', setPolicyCookie); // Cookie Policy
  overlay.addEventListener('click', JC.utils.closeOverlay); // close overlay
  openOverlay.addEventListener('click', JC.utils.openOverlay); // open overlay
  openOverlay.addEventListener('click', play); // open overlay
  content1.addEventListener('click', function () {
    header.classList.toggle('--open');
    body.classList.toggle('overlay--open');
  })
}

EVT.on('init', clickHandlers);

