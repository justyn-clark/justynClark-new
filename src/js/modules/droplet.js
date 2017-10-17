(function() {
  var droplet = document.querySelector('.droplet')
  droplet.style.opacity = 0
  function fadeInDroplet() {
    setTimeout(function() {
      droplet.style.opacity = 1
    }, 2000)
  }
  EVT.on('init', fadeInDroplet)
})();
