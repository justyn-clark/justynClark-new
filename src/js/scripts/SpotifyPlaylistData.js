(function(JC) {
  function getUserData() {
    return $.ajax({
      url: 'https://api.spotify.com/v1/users/125458843/playlists',
      headers: {
        'Authorization': 'Bearer ' + 'BQAW-SrN3PCIhz5XRkmapQzRPOC3JtpjxbTMhI0QNsW6fH5I7LXyc0om4DSFj5isBR7png7Pq4PeHO9f5BWz7WVmdrfwKcodTI4gHUQiOlvo50ZKLchF6Iyx58coOQAdVSoLziQemNZ-lRlA1V6Cwae_qQa02S20xQ'
      }
    });
  }

  /*getUserData()
    .then(function (response) {
      console.log(response);
      localStorage.setItem('playlists', JSON.stringify(response))
    })*/
})(JC);


