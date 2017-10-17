export function loadVideos() {

  var request;

  if (window.XMLHttpRequest) {
    request = new XMLHttpRequest();
  } else {
    request = new ActiveXObject("Microsoft.XMLHTTP");
  }

  request.open('GET', 'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet%2CcontentDetails&maxResults=25&playlistId=PLQaJDwLXyBtXr1Fe2FRzIdT3RFeG52QVF&key=AIzaSyBtgVAgm_SKEiUgapy-e_4bI5FQbYej2KgAIzaSyBtgVAgm_SKEiUgapy-e_4bI5FQbYej2Kg');

  request.onreadystatechange = function() {
    if ((request.readyState === 4) && (request.status === 200)) {
      var data = JSON.parse(request.responseText);
      //localStorage.setItem('data', JSON.stringify(data));
      console.log(data);

      //var names = '';
      //for (let i = 0; i < data.length; i++) {
      //  names += '<div class="person">';
      //  names += '<h5>' + data[i].username + "</h5>";
      //  names += '<p>' + data[i].name + "</p>";
      //  names += '<i>' + data[i].email + "</i>";
      //  names += '</div>';
      //  console.log(data[i].name)
      //}
      //document.querySelector('[rel=copySection]').innerHTML = names;
    }
  }

  //request.send();
}
