(function(JC) {

  var canIData = document.querySelector('.canIData');
  var clickBtn = document.querySelector('[rel="main__clicker"]');

  function init() {
    var p1 = new Promise(
      function(resolve) {
        var request;
        if (window.XMLHttpRequest) {
          request = new XMLHttpRequest();
        } else {
          request = new ActiveXObject("Microsoft.XMLHTTP");
        }
        request.open('GET', 'https://raw.githubusercontent.com/Fyrd/caniuse/master/data.json');
        request.onreadystatechange = function() {
          if ((request.readyState === 4) && (request.status === 200)) {
            const canIUseData = JSON.parse(request.responseText);
            resolve(canIUseData);
            JC.utils.output(canIUseData.data);
          }
        }
        request.send();
      });
    p1
      .then(canIUseData => {
        var titles= "";
        var ul = document.createElement("ul");
        var catsCSS = canIUseData.cats.CSS;

        catsCSS.forEach(function(index,item) {
          var cssList = '<li>' + index + ' ' + item + '</li>';
          canIData.appendChild(ul);
          ul.insertAdjacentHTML('afterbegin', cssList);
        });

        for (let i in canIUseData.data) {
          titles += "<div class='data__item'>"
          titles += "<h3>" + canIUseData.data[i].title + "</h3>"
          titles += "<p>" + canIUseData.data[i].description + "</p>"
          titles += "<a href=" + canIUseData.data[i].links[0].url + ">" + canIUseData.data[i].links[0].url + "</a>"
          titles += "</div>"
        }

        ul.insertAdjacentHTML('afterend', titles);

        })
      .then(()=> canIData.insertAdjacentHTML('afterbegin', "<h1>Top Modern Features</h1>"))
  }

  clickBtn.addEventListener("click", init);

  if ("Promise" in window) {   // Check for Promise on window
    EVT.on("init", init);
   } else {
     JC.utils.output('Your browser doesn\'t support the <code>Promise<code> interface.');
   }

})(JC);
