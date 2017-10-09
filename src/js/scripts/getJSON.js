(function($, JC) {

  if(JC.postsFeed) return

  var dataFeed= JC.dataFeed = {};

  var $mainDIv = $('.posts-feed');

  var getRepos = function() {
    if (!localStorage.getItem('data')) {

      $.getJSON("https://api.github.com/users/justyn-clark/repos", function(data) {

        dataFeed.dataLength = data.length

        localStorage.setItem('data', JSON.stringify(data));

        for(let i = 0; i < dataFeed.dataLength; i++){

          var post =
                "<div class='posts-post'>" +
                "<div class='posts-image'></div>" +
                "<div class='posts-post-content'>" +
                "<a href='#' target='_blank'>" +
                "<div class='content-inner'>" +
                "<div class='content'>" +
                "<div class='posts-time'><p class='time'>" + data[i].name + "</p></div>" +
                "<div class='posts-subject'>" +
                "<h2>" + data[i].url + "</h2>" +
                "</div>" +
                "</div>" +
                "</div>" +
                "</a>" +
                "</div>" +
                "</div>";

          $mainDIv.append(post);

        }
      });
    } else {

      var data = JSON.parse(localStorage.getItem('data'))

      for(let i = 0; i < data.length; i++){

        var post =
              "<div class='posts-post'>" +
              "<div class='posts-image'></div>" +
              "<div class='posts-post-content'>" +
              "<a href=" + data[i].html_url + ">" +
              "<div class='content-inner'>" +
              "<div class='content'>" +
              "<div class='posts-time'><p class='time'>" + data[i].name + "</p></div>" +
              "<div class='posts-subject'>" +
              "</div>" +
              "</div>" +
              "</div>" +
              "</a>" +
              "</div>" +
              "</div>";

        $mainDIv.append(post);

      }
        console.log("it should be reading the data");
    }
  };

  EVT.on('init', getRepos)

})(jQuery, JC)
