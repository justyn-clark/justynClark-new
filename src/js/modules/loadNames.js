export const loadNames = () => {
  var request;
  if (window.XMLHttpRequest) {
    request = new XMLHttpRequest();
  } else {
    request = new ActiveXObject("Microsoft.XMLHTTP");
  }
  request.open('GET', 'https://jsonplaceholder.typicode.com/users');
  request.onreadystatechange = function() {
    if ((request.readyState === 4) && (request.status === 200)) {
      var data = JSON.parse(request.responseText);
      console.log(data);
      localStorage.setItem('data', JSON.stringify(data));

      for(let i = 0; i < data.length; i++){
        console.log(data[i].name)

        var names = data[i].name + "<br>";

      }

      document.querySelector('[rel=copySection]').innerHTML = names;

    }
  }
  request.send();
}

