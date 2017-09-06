(function() {
  'use strict';

  function getCSS() {

    function output(x) {
      console.log(x);
    }

    var list = document.getElementById('list');
    var canIData = document.querySelector('.canIData');
    var p1 = new Promise(
      function(resolve, reject) {
        var request;
        if (window.XMLHttpRequest) {
          request = new XMLHttpRequest();
        } else {
          request = new ActiveXObject("Microsoft.XMLHTTP");
        }
        request.open('GET', 'https://raw.githubusercontent.com/Fyrd/caniuse/master/data.json');
        request.onreadystatechange = function() {
          if ((request.readyState===4) && (request.status===200)) {
            const canIUseData = JSON.parse(request.responseText)
            resolve(canIUseData)
            console.log(canIUseData);

            //output(data["css-grid"].categories)
            /*window.setTimeout(      // Async
             function res() {
             var data = JSON.parse(request.responseText)
             resolve(data)
             console.log('Fake async setTimeout ended');
             }, 3000);*/

          }
        }
        request.send();
      });
    p1
      .then(canIUseData => {


        // Logs
        var title = canIUseData.data.video.title;
        var description = canIUseData.data.video.description;
        var linkUrl = canIUseData.data["es6-module"].links[1].url;

        var ul = document.createElement("ul");
        var catsCSS = canIUseData.cats.CSS;

        //canIData.appendChild(ul);

        catsCSS.forEach(function(index,item) {
          var cssList = '<p>' + index + ' ' + item + '</p>';
          console.log(index + ' ' + item);
          canIData.appendChild(ul);
          ul.insertAdjacentHTML('afterbegin', cssList);
        })
        ul.insertAdjacentHTML('afterend', "<br>" + title + "<br>" + description + "<br>" + "<a href='#'>" + linkUrl + "</a>" + "<br>");
        console.log(catsCSS);
      })
      .then(()=> canIData.insertAdjacentHTML('afterbegin', "<h1>Top Modern Features</h1>"))
      .catch(
        function(reason) {
          //console.log(reason);
        });
  }

  var clickBtn = document.querySelector('[rel="main__clicker"]');
  clickBtn.addEventListener("click", getCSS);

  EVT.on("init", getCSS)

  /*if ("Promise" in window) {   // Check for Promise on window
   var btn = document.getElementById("btn");
   btn.addEventListener("click",testPromise);
   } else {
   var log = document.getElementById('log');
   log.innerHTML = "Live example not available as your browser doesn't support the <code>Promise<code> interface.";
   }*/

})();
